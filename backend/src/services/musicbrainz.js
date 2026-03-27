const BASE = 'https://musicbrainz.org/ws/2'
const HEADERS = {
  'User-Agent': 'cr8/0.1.0 (https://github.com/yourname/cr8)',
  Accept: 'application/json',
}

async function mbFetch(url) {
  let res = await fetch(url, { headers: HEADERS })
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('retry-after') || '1') * 1000
    await new Promise((r) => setTimeout(r, retryAfter))
    res = await fetch(url, { headers: HEADERS })
  }
  if (!res.ok) throw new Error(`MusicBrainz error: ${res.status}`)
  return res.json()
}

export async function searchRecordings(query) {
  const url = `${BASE}/recording?query=${encodeURIComponent(query)}&limit=20&fmt=json`
  const data = await mbFetch(url)
  return data.recordings.map((r) => ({
    mbid: r.id,
    title: r.title,
    artist: r['artist-credit']?.[0]?.artist?.name,
    artistMbid: r['artist-credit']?.[0]?.artist?.id,
    album: r.releases?.[0]?.title,
    albumMbid: r.releases?.[0]?.id,
    duration: r.length,
    coverArt: r.releases?.[0]?.id
      ? `https://coverartarchive.org/release/${r.releases[0].id}/front-250`
      : null,
  }))
}

export async function searchReleases(query) {
  const url = `${BASE}/release?query=${encodeURIComponent(query)}&limit=20&fmt=json`
  const data = await mbFetch(url)
  return data.releases.map((r) => ({
    mbid: r.id,
    title: r.title,
    artist: r['artist-credit']?.[0]?.artist?.name,
    artistMbid: r['artist-credit']?.[0]?.artist?.id,
    date: r.date,
    trackCount: r['track-count'],
    coverArt: `https://coverartarchive.org/release/${r.id}/front-250`,
  }))
}

export async function searchArtists(query) {
  const url = `${BASE}/artist?query=${encodeURIComponent(query)}&limit=15&fmt=json`
  const data = await mbFetch(url)
  return data.artists.map((a) => ({
    mbid: a.id,
    name: a.name,
    artistType: a.type,
    country: a.country,
    resultType: 'artist',
  }))
}

export async function browseReleasesByArtist(artistMbid) {
  const url = `${BASE}/release?artist=${artistMbid}&limit=20&inc=artist-credits&fmt=json`
  const data = await mbFetch(url)
  return data.releases.map((r) => ({
    mbid: r.id,
    title: r.title,
    artist: r['artist-credit']?.[0]?.artist?.name,
    artistMbid: artistMbid,
    date: r.date,
    trackCount: r['track-count'],
    coverArt: `https://coverartarchive.org/release/${r.id}/front-250`,
  }))
}

export async function lookupByMbid(mbid, type = 'recording') {
  let url
  if (type === 'recording') {
    url = `${BASE}/recording/${mbid}?inc=artist-credits+releases&fmt=json`
  } else {
    url = `${BASE}/release/${mbid}?inc=artist-credits+recordings&fmt=json`
  }
  return mbFetch(url)
}
