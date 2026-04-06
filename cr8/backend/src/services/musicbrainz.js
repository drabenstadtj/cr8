const BASE = 'https://musicbrainz.org/ws/2'
const HEADERS = {
  'User-Agent': 'cr8/0.1.0 (https://github.com/yourname/cr8)',
  Accept: 'application/json',
}
const PAGE_SIZE = 20

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

function q(val) {
  // wrap in quotes for Lucene phrase matching, escape internal quotes
  return `"${val.replace(/"/g, '\\"')}"`
}

function buildReleaseQuery({ title, artist }) {
  const parts = ['status:Official']
  if (title) parts.push(`release:${q(title)}`)
  if (artist) parts.push(`artist:${q(artist)}`)
  return parts.join(' AND ')
}

function buildRecordingQuery({ title, artist, album }) {
  const parts = []
  if (title) parts.push(`recording:${q(title)}`)
  if (artist) parts.push(`artist:${q(artist)}`)
  if (album) parts.push(`release:${q(album)}`)
  return parts.join(' AND ') || '*'
}

export async function searchRecordings({ title, artist, album, offset = 0 }) {
  const query = buildRecordingQuery({ title, artist, album })
  const url = `${BASE}/recording?query=${encodeURIComponent(query)}&limit=${PAGE_SIZE}&offset=${offset}&fmt=json`
  const data = await mbFetch(url)
  return {
    total: data['recording-count'] ?? 0,
    results: data.recordings.map((r) => ({
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
    })),
  }
}

export async function searchReleases({ title, artist, offset = 0 }) {
  const query = buildReleaseQuery({ title, artist })
  const url = `${BASE}/release?query=${encodeURIComponent(query)}&limit=${PAGE_SIZE}&offset=${offset}&fmt=json`
  const data = await mbFetch(url)
  return {
    total: data['release-count'] ?? 0,
    results: data.releases.map((r) => ({
      mbid: r.id,
      title: r.title,
      artist: r['artist-credit']?.[0]?.artist?.name,
      artistMbid: r['artist-credit']?.[0]?.artist?.id,
      date: r.date,
      trackCount: r['track-count'],
      coverArt: `https://coverartarchive.org/release/${r.id}/front-250`,
    })),
  }
}

export async function searchArtists({ name, offset = 0 }) {
  const url = `${BASE}/artist?query=${encodeURIComponent(name || '*')}&limit=${PAGE_SIZE}&offset=${offset}&fmt=json`
  const data = await mbFetch(url)
  return {
    total: data['artist-count'] ?? 0,
    results: data.artists.map((a) => ({
      mbid: a.id,
      name: a.name,
      artistType: a.type,
      country: a.country,
      resultType: 'artist',
    })),
  }
}

export async function browseReleasesByArtist(artistMbid, { offset = 0 } = {}) {
  const url = `${BASE}/release?artist=${artistMbid}&limit=${PAGE_SIZE}&offset=${offset}&inc=artist-credits&fmt=json`
  const data = await mbFetch(url)
  return {
    total: data['release-count'] ?? 0,
    results: data.releases.map((r) => ({
      mbid: r.id,
      title: r.title,
      artist: r['artist-credit']?.[0]?.artist?.name,
      artistMbid: artistMbid,
      date: r.date,
      trackCount: r['track-count'],
      coverArt: `https://coverartarchive.org/release/${r.id}/front-250`,
    })),
  }
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
