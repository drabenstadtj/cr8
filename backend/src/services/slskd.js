const BASE = () => process.env.SLSKD_URL
const API_KEY = () => process.env.SLSKD_API_KEY

const PREFERRED_EXTS = ['flac', 'mp3', 'ogg', 'm4a']
const MIN_BITRATE = 192
const MIN_BIT_DEPTH = 0
const DURATION_TOLERANCE_S = 10
const DOWNLOAD_ATTEMPTS = 3

// Keywords to reject if they appear in a filename but NOT in the track title/artist
const BLACKLIST_KEYWORDS = ['karaoke', 'instrumental', 'acappella', 'cover', 'bootleg', 'tribute']
// These need word-boundary checks because they're common words
const BLACKLIST_WORD_KEYWORDS = ['live']

function headers() {
  return { 'X-API-Key': API_KEY(), 'Content-Type': 'application/json' }
}

async function slskdFetch(path, options = {}) {
  const res = await fetch(`${BASE()}${path}`, { ...options, headers: headers() })
  if (!res.ok) throw new Error(`slskd error ${res.status}: ${path}`)
  if (res.status === 204) return null
  return res.json()
}

// Strip to lowercase alphanumeric+spaces for fuzzy matching
function alnumOnly(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Strip featuring credits: "Artist ft. X", "Artist feat. X", "Artist (feat. X)"
function mainArtist(artist) {
  return alnumOnly(
    (artist || '').replace(/\s*[\(\[]?(?:ft|feat|featuring|with)\.?\s+.*/i, '').trim()
  )
}

// Check all significant words (>2 chars) from query appear in filename
function wordMatch(sanitizedFilename, sanitizedQuery) {
  if (!sanitizedQuery) return false
  const words = sanitizedQuery.split(' ').filter((w) => w.length > 2)
  if (!words.length) return sanitizedFilename.includes(sanitizedQuery)
  return words.every((w) => sanitizedFilename.includes(w))
}

// Return true if the filename contains a blacklisted keyword that isn't in the track title/artist
function hasBlacklistedKeyword(sanitizedFilename, sanitizedTitle, sanitizedArtist) {
  for (const kw of BLACKLIST_KEYWORDS) {
    if (sanitizedTitle.includes(kw) || sanitizedArtist.includes(kw)) continue
    if (sanitizedFilename.includes(kw)) return true
  }
  for (const kw of BLACKLIST_WORD_KEYWORDS) {
    if (sanitizedTitle.includes(kw) || sanitizedArtist.includes(kw)) continue
    if (new RegExp(`\\b${kw}\\b`).test(sanitizedFilename)) return true
  }
  return false
}

function getExtension(file) {
  let ext = (file.extension || '').toLowerCase().replace(/^\./, '')
  if (!ext) {
    const match = file.filename.match(/\.([a-z0-9]+)$/i)
    ext = match ? match[1].toLowerCase() : ''
  }
  return ext
}

export async function startSearch(searchText) {
  const data = await slskdFetch('/api/v0/searches', {
    method: 'POST',
    body: JSON.stringify({ searchText }),
  })
  return data.id
}

export async function waitForSearch(searchId, retries = 20) {
  for (let i = 0; i < retries; i++) {
    const search = await slskdFetch(`/api/v0/searches/${searchId}`)
    if (search.isComplete) {
      if (search.fileCount === 0 || search.fileCount === search.lockedFileCount) {
        throw new Error(`Search complete but no available files found`)
      }
      return slskdFetch(`/api/v0/searches/${searchId}/responses`)
    }
    await new Promise((r) => setTimeout(r, 15000))
  }
  throw new Error(`Search ${searchId} did not complete after ${retries} retries`)
}

function getDirectory(filename) {
  const sep = filename.includes('\\') ? '\\' : '/'
  const idx = filename.lastIndexOf(sep)
  return idx === -1 ? '' : filename.substring(0, idx)
}

function getBasename(filename) {
  const sep = filename.includes('\\') ? '\\' : '/'
  return filename.substring(filename.lastIndexOf(sep) + 1)
}

// Extract leading track number from filename basename, e.g. "02 - Foo.flac" → 2
function extractTrackNumber(filename) {
  const base = getBasename(filename)
  const m = base.match(/^(\d{1,3})[\s\-_.]/)
  return m ? parseInt(m[1], 10) : null
}

// Returns true if the file list has duplicate track numbers (messy/double-rip folder)
function hasDuplicateTracks(files) {
  const seen = new Set()
  for (const f of files) {
    const n = extractTrackNumber(f.filename)
    if (n === null) continue
    if (seen.has(n)) return true
    seen.add(n)
  }
  return false
}

// Collect and rank all matching candidates from search responses
export function collectCandidates(responses, { title, artist, album, durationS }) {
  const sanitizedTitle = alnumOnly(title)
  const sanitizedMainArtist = mainArtist(artist)
  const sanitizedAlbum = alnumOnly(album || '')

  const candidates = []

  for (const response of responses) {
    if (!response.hasFreeUploadSlot) continue
    for (const file of response.files || []) {
      const ext = getExtension(file)
      const extRank = PREFERRED_EXTS.indexOf(ext)
      if (extRank === -1) continue

      const sanitizedFilename = alnumOnly(file.filename)

      if (hasBlacklistedKeyword(sanitizedFilename, sanitizedTitle, sanitizedMainArtist)) continue

      const titleMatch = wordMatch(sanitizedFilename, sanitizedTitle)
      const artistOrAlbumMatch =
        (sanitizedMainArtist && wordMatch(sanitizedFilename, sanitizedMainArtist)) ||
        (sanitizedAlbum && wordMatch(sanitizedFilename, sanitizedAlbum))
      if (!titleMatch || !artistOrAlbumMatch) continue

      if (durationS && file.length) {
        if (Math.abs(file.length - durationS) > DURATION_TOLERANCE_S) continue
      }

      const bitrate = file.bitRate || 0
      if (bitrate > 0 && bitrate <= MIN_BITRATE) continue

      const bitDepth = file.bitDepth || 0
      if (bitDepth > 0 && bitDepth <= MIN_BIT_DEPTH) continue

      candidates.push({
        username: response.username,
        filename: file.filename,
        size: file.size,
        bitrate,
        bitDepth,
        extRank,
      })
    }
  }

  // Sort: best extension first, then highest bitrate
  candidates.sort((a, b) => a.extRank - b.extRank || b.bitrate - a.bitrate)
  return candidates.slice(0, DOWNLOAD_ATTEMPTS)
}

// Collect album candidates: groups files by (username, directory), returns best groups
export function collectAlbumCandidates(responses, { artist, album }) {
  const sanitizedArtist = mainArtist(artist)
  const sanitizedAlbum = alnumOnly(album || '')

  const groups = new Map() // key: "username\0directory"

  for (const response of responses) {
    if (!response.hasFreeUploadSlot) continue
    for (const file of response.files || []) {
      const ext = getExtension(file)
      if (PREFERRED_EXTS.indexOf(ext) === -1) continue

      const dir = getDirectory(file.filename)
      const sanitizedDir = alnumOnly(dir)

      const artistMatch = sanitizedArtist && wordMatch(sanitizedDir, sanitizedArtist)
      const albumMatch = sanitizedAlbum && wordMatch(sanitizedDir, sanitizedAlbum)
      if (!artistMatch && !albumMatch) continue

      const key = `${response.username}\0${dir}`
      if (!groups.has(key)) {
        groups.set(key, {
          username: response.username,
          directory: dir,
          files: [],
          extRankSum: 0,
          bitrateSum: 0,
        })
      }
      const g = groups.get(key)
      const extRank = PREFERRED_EXTS.indexOf(ext)
      g.files.push({ filename: file.filename, size: file.size })
      g.extRankSum += extRank
      g.bitrateSum += file.bitRate || 0
    }
  }

  // Only keep groups with at least 2 music files and no duplicate track numbers
  const candidates = [...groups.values()].filter(
    (g) => g.files.length >= 2 && !hasDuplicateTracks(g.files)
  )

  // Sort: most files first, then best average extension rank, then highest avg bitrate
  candidates.sort((a, b) => {
    if (b.files.length !== a.files.length) return b.files.length - a.files.length
    const aExtAvg = a.extRankSum / a.files.length
    const bExtAvg = b.extRankSum / b.files.length
    if (aExtAvg !== bExtAvg) return aExtAvg - bExtAvg
    return b.bitrateSum / b.files.length - a.bitrateSum / a.files.length
  })

  return candidates.slice(0, DOWNLOAD_ATTEMPTS)
}

// Try candidates in order until one queues successfully
export async function queueBestDownload(candidates) {
  for (const candidate of candidates) {
    try {
      await slskdFetch(`/api/v0/transfers/downloads/${candidate.username}`, {
        method: 'POST',
        body: JSON.stringify([{ filename: candidate.filename, size: candidate.size }]),
      })
      return candidate
    } catch {
      continue
    }
  }
  throw new Error('Failed to queue any candidate')
}

// Queue all files in an album candidate
export async function queueAlbumDownload(candidates) {
  for (const candidate of candidates) {
    try {
      await slskdFetch(`/api/v0/transfers/downloads/${candidate.username}`, {
        method: 'POST',
        body: JSON.stringify(candidate.files.map((f) => ({ filename: f.filename, size: f.size }))),
      })
      return candidate
    } catch {
      continue
    }
  }
  throw new Error('Failed to queue any album candidate')
}

export async function getDownloads() {
  return slskdFetch('/api/v0/transfers/downloads')
}

export async function deleteSearch(searchId) {
  await slskdFetch(`/api/v0/searches/${searchId}`, { method: 'DELETE' })
}

export async function cleanupDownload(username, downloadId) {
  await slskdFetch(`/api/v0/transfers/downloads/${username}/${downloadId}?remove=false`, {
    method: 'DELETE',
  })
  await new Promise((r) => setTimeout(r, 1000))
  await slskdFetch(`/api/v0/transfers/downloads/${username}/${downloadId}?remove=true`, {
    method: 'DELETE',
  })
}
