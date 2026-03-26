// Uses Subsonic API (stable, v1.16.1) for library duplicate checks
import crypto from 'crypto'

function subsonicParams(extra = {}) {
  const salt = Math.random().toString(36).slice(2)
  const token = crypto
    .createHash('md5')
    .update((process.env.NAVIDROME_PASSWORD || '') + salt)
    .digest('hex')

  const params = new URLSearchParams({
    u: process.env.NAVIDROME_USER || '',
    t: token,
    s: salt,
    v: '1.16.1',
    c: 'cr8',
    f: 'json',
    ...extra,
  })
  return params.toString()
}

export async function checkDuplicateInLibrary(title, artist) {
  const base = process.env.NAVIDROME_URL
  if (!base) return false

  try {
    const query = `${artist} ${title}`
    const url = `${base}/rest/search3?${subsonicParams({ query, songCount: 5 })}`
    const res = await fetch(url)
    if (!res.ok) return false

    const data = await res.json()

    const status = data?.['subsonic-response']?.status
    if (status !== 'ok') return false

    const songs = data?.['subsonic-response']?.searchResult3?.song || []
    return songs.some(
      (s) =>
        s.title?.toLowerCase() === title.toLowerCase() &&
        s.artist?.toLowerCase() === artist.toLowerCase()
    )
  } catch {
    // Don't block submissions if Navidrome is unreachable
    return false
  }
}
