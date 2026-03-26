const BASE = () => process.env.SLSKD_URL
const API_KEY = () => process.env.SLSKD_API_KEY

function headers() {
  return { 'X-API-Key': API_KEY(), 'Content-Type': 'application/json' }
}

async function slskdFetch(path, options = {}) {
  const res = await fetch(`${BASE()}${path}`, { ...options, headers: headers() })
  if (!res.ok) throw new Error(`slskd error ${res.status}: ${path}`)
  if (res.status === 204) return null
  return res.json()
}

// Start a search, returns search ID
export async function startSearch(searchText) {
  const data = await slskdFetch('/api/v0/searches', {
    method: 'POST',
    body: JSON.stringify({ searchText }),
  })
  return data.id
}

// Poll until search is complete, returns responses
export async function waitForSearch(searchId, timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const search = await slskdFetch(`/api/v0/searches/${searchId}`)
    if (search.isComplete) {
      return slskdFetch(`/api/v0/searches/${searchId}/responses`)
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  throw new Error(`Search ${searchId} timed out`)
}

// Pick the best file from search responses
// Criteria: ranked extensions, min bitrate, filename contains artist+title, duration within 10s
export function selectBestFile(responses, { title, artist, durationMs }) {
  const PREFERRED_EXTS = ['.flac', '.mp3', '.ogg', '.m4a']
  const MIN_BITRATE = 192
  const DURATION_TOLERANCE_MS = 10000

  const candidates = []

  for (const response of responses) {
    for (const file of response.files || []) {
      const name = file.filename.toLowerCase()
      const ext = PREFERRED_EXTS.find((e) => name.endsWith(e))
      if (!ext) continue

      const bitrate = file.bitRate || 0
      if (bitrate < MIN_BITRATE) continue

      const nameMatch =
        name.includes(artist.toLowerCase()) && name.includes(title.toLowerCase())
      if (!nameMatch) continue

      if (durationMs) {
        const fileDurationMs = (file.length || 0) * 1000
        if (Math.abs(fileDurationMs - durationMs) > DURATION_TOLERANCE_MS) continue
      }

      candidates.push({
        username: response.username,
        filename: file.filename,
        size: file.size,
        bitrate,
        extRank: PREFERRED_EXTS.indexOf(ext),
      })
    }
  }

  if (!candidates.length) return null

  candidates.sort((a, b) => a.extRank - b.extRank || b.bitrate - a.bitrate)
  return candidates[0]
}

export async function queueDownload(username, filename, size) {
  return slskdFetch(`/api/v0/transfers/downloads/${username}`, {
    method: 'POST',
    body: JSON.stringify([{ filename, size }]),
  })
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
  await slskdFetch(`/api/v0/transfers/downloads/${username}/${downloadId}?remove=true`, {
    method: 'DELETE',
  })
}
