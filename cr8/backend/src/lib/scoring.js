export const PREFERRED_EXTS = ['flac', 'mp3', 'ogg', 'm4a']
export const MIN_BITRATE = 192
export const MIN_BIT_DEPTH = 0
export const DURATION_TOLERANCE_S = 10
export const DOWNLOAD_ATTEMPTS = 3

export const BLACKLIST_KEYWORDS = ['karaoke', 'instrumental', 'acappella', 'cover', 'bootleg', 'tribute']
export const BLACKLIST_WORD_KEYWORDS = ['live']

// Strip punctuation/symbols but keep all Unicode letters and numbers (including CJK etc.)
// NFD decomposition strips combining diacritics so "Böhm" and "Bohm" both normalise to "bohm".
export function alnumOnly(str) {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Strip featuring credits: "Artist ft. X", "Artist feat. X", "Artist (feat. X)"
export function mainArtist(artist) {
  return alnumOnly(
    (artist || '').replace(/\s*[\(\[]?(?:ft|feat|featuring|with)\.?\s+.*/i, '').trim()
  )
}

// Check all significant words (>2 chars) from query appear in filename
export function wordMatch(sanitizedFilename, sanitizedQuery) {
  if (!sanitizedQuery) return false
  const words = sanitizedQuery.split(' ').filter((w) => w.length > 2)
  if (!words.length) return sanitizedFilename.includes(sanitizedQuery)
  return words.every((w) => sanitizedFilename.includes(w))
}

// Return true if the filename contains a blacklisted keyword that isn't in the track title/artist
export function hasBlacklistedKeyword(sanitizedFilename, sanitizedTitle, sanitizedArtist) {
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

export function getExtension(file) {
  let ext = (file.extension || '').toLowerCase().replace(/^\./, '')
  if (!ext) {
    const match = file.filename.match(/\.([a-z0-9]+)$/i)
    ext = match ? match[1].toLowerCase() : ''
  }
  return ext
}

export function getDirectory(filename) {
  const sep = filename.includes('\\') ? '\\' : '/'
  const idx = filename.lastIndexOf(sep)
  return idx === -1 ? '' : filename.substring(0, idx)
}

export function getBasename(filename) {
  const sep = filename.includes('\\') ? '\\' : '/'
  return filename.substring(filename.lastIndexOf(sep) + 1)
}

// Extract leading track number from filename basename, e.g. "02 - Foo.flac" → 2
export function extractTrackNumber(filename) {
  const base = getBasename(filename)
  const m = base.match(/^(\d{1,3})[\s\-_.]/)
  return m ? parseInt(m[1], 10) : null
}

// Returns true if the file list has duplicate track numbers (messy/double-rip folder)
export function hasDuplicateTracks(files) {
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
    for (const file of response.files || []) {
      const ext = getExtension(file)
      const extRank = PREFERRED_EXTS.indexOf(ext)
      if (extRank === -1) continue

      const sanitizedFilename = alnumOnly(file.filename)

      if (hasBlacklistedKeyword(sanitizedFilename, sanitizedTitle, sanitizedMainArtist)) continue

      const titleMatch = wordMatch(sanitizedFilename, sanitizedTitle)
      const artistMatch = sanitizedMainArtist && wordMatch(sanitizedFilename, sanitizedMainArtist)
      const albumMatch = sanitizedAlbum && wordMatch(sanitizedFilename, sanitizedAlbum)
      const secondaryMatch = sanitizedMainArtist ? artistMatch : albumMatch
      if (!titleMatch || !secondaryMatch) continue

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
        freeSlot: response.hasFreeUploadSlot ? 0 : 1,
      })
    }
  }

  candidates.sort((a, b) => a.freeSlot - b.freeSlot || a.extRank - b.extRank || b.bitrate - a.bitrate)
  return candidates.slice(0, DOWNLOAD_ATTEMPTS)
}

// Collect album candidates: groups files by (username, directory), returns best groups
export function collectAlbumCandidates(responses, { artist, album }) {
  const sanitizedArtist = mainArtist(artist)
  const sanitizedAlbum = alnumOnly(album || '')

  const groups = new Map()

  for (const response of responses) {
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
          freeSlot: response.hasFreeUploadSlot ? 0 : 1,
        })
      }
      const g = groups.get(key)
      const extRank = PREFERRED_EXTS.indexOf(ext)
      g.files.push({ filename: file.filename, size: file.size })
      g.extRankSum += extRank
      g.bitrateSum += file.bitRate || 0
    }
  }

  const candidates = [...groups.values()].filter(
    (g) => g.files.length >= 2 && !hasDuplicateTracks(g.files)
  )

  candidates.sort((a, b) => {
    if (a.freeSlot !== b.freeSlot) return a.freeSlot - b.freeSlot
    if (b.files.length !== a.files.length) return b.files.length - a.files.length
    const aExtAvg = a.extRankSum / a.files.length
    const bExtAvg = b.extRankSum / b.files.length
    if (aExtAvg !== bExtAvg) return aExtAvg - bExtAvg
    return b.bitrateSum / b.files.length - a.bitrateSum / a.files.length
  })

  return candidates.slice(0, DOWNLOAD_ATTEMPTS)
}
