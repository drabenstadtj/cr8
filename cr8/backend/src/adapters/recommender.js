const LB_BASE = 'https://api.listenbrainz.org/1'

async function lbFetch(path) {
  const res = await fetch(`${LB_BASE}/${path}`)
  if (!res.ok) throw new Error(`LB ${res.status}: ${path}`)
  return res.json()
}

function isoWeekKey(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  const week = 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  return `${d.getFullYear()}-W${week}`
}

async function findCurrentPlaylistId(lbUser, playlistType) {
  const currentWeek = isoWeekKey()
  let offset = 0

  while (true) {
    const data = await lbFetch(`user/${lbUser}/playlists/createdfor?offset=${offset}`)
    const playlists = data?.playlists ?? []

    for (const p of playlists) {
      const ext = p.playlist?.extension?.['https://musicbrainz.org/doc/jspf#playlist']
      if (ext?.additional_metadata?.algorithm_metadata?.source_patch !== playlistType) continue
      if (isoWeekKey(p.playlist.date) !== currentWeek) continue
      const parts = p.playlist.identifier.split('/')
      return parts[parts.length - 1]
    }

    const fetched = offset + playlists.length
    if (fetched >= (data?.playlist_count ?? 0) || !playlists.length) break
    offset = fetched
  }

  throw new Error(`No ${playlistType} playlist found this week for ${lbUser}`)
}

function parseTrack(track) {
  const ext = track.extension?.['https://musicbrainz.org/doc/jspf#track']?.additional_metadata
  const artists = ext?.artists ?? []
  const mainArtist = artists[0]?.artist_credit_name || track.creator

  const mbid = (track.identifier ?? [])
    .map((id) => id.split('/').pop())
    .find((part) => /^[0-9a-f-]{36}$/.test(part)) ?? null

  return {
    title: track.title,
    artist: track.creator,
    mainArtist,
    album: track.album || '',
    duration: track.duration || null,
    mbid,
    releaseMbid: ext?.caa_release_mbid || null,
  }
}

async function enrichMissingAlbums(tracks) {
  const missing = tracks.filter((t) => !t.album && t.mbid)
  if (!missing.length) return

  const data = await lbFetch(
    `metadata/recording/?recording_mbids=${missing.map((t) => t.mbid).join(',')}&inc=release`
  )

  for (const track of missing) {
    const meta = data?.[track.mbid]
    if (meta?.release?.name) {
      track.album = meta.release.name
      if (!track.releaseMbid) track.releaseMbid = meta.release.mbid
    }
  }
}

export function createRecommenderAdapter() {
  return {
    async weeklyTracks(lbUser, playlistType = 'weekly-exploration') {
      const playlistId = await findCurrentPlaylistId(lbUser, playlistType)
      const data = await lbFetch(`playlist/${playlistId}`)
      const raw = data?.playlist?.track ?? []
      const tracks = raw.map(parseTrack)
      await enrichMissingAlbums(tracks)
      return tracks
    },
  }
}
