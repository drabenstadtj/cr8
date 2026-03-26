// Uses Subsonic API (stable, v1.16.1) for library duplicate checks
// Navidrome Subsonic endpoint: /rest/*

function subsonicParams(extra = {}) {
  const params = new URLSearchParams({
    u: process.env.NAVIDROME_USER || '',
    p: process.env.NAVIDROME_PASSWORD || '',
    v: '1.16.1',
    c: 'cr8',
    f: 'json',
    ...extra,
  })
  return params.toString()
}

export async function checkDuplicateInLibrary(title, artist) {
  const base = process.env.NAVIDROME_URL
  if (!base) return false // skip check if not configured

  try {
    const query = `${artist} ${title}`
    const url = `${base}/rest/search3?${subsonicParams({ query, songCount: 5 })}`
    const res = await fetch(url)
    if (!res.ok) return false

    const data = await res.json()
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
