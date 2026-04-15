// Uses Subsonic API (stable, v1.16.1) for all gonic interactions.
// Gonic has no separate REST admin API — user management goes through Subsonic too.
import crypto from 'crypto'

function subsonicParams(extra = {}) {
  const salt = Math.random().toString(36).slice(2)
  const token = crypto
    .createHash('md5')
    .update((process.env.GONIC_PASSWORD || '') + salt)
    .digest('hex')

  const params = new URLSearchParams({
    u: process.env.GONIC_USER || '',
    t: token,
    s: salt,
    v: '1.16.1',
    c: 'cr8',
    f: 'json',
    ...extra,
  })
  return params.toString()
}

export async function createGonicUser(username, password) {
  const base = process.env.GONIC_URL
  if (!base) return

  const url = `${base}/rest/createUser.view?${subsonicParams({ username, password, email: `${username}@cr8.local` })}`
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gonic createUser HTTP ${res.status}: ${body}`)
  }
  const data = await res.json()
  const r = data?.['subsonic-response']
  if (r?.status !== 'ok') {
    throw new Error(`Gonic createUser failed: ${r?.error?.message || 'unknown error'}`)
  }
}

export async function deleteGonicUser(username) {
  const base = process.env.GONIC_URL
  if (!base) return

  // Subsonic deleteUser takes username directly — no need to list users first
  const url = `${base}/rest/deleteUser.view?${subsonicParams({ username })}`
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gonic deleteUser HTTP ${res.status}: ${body}`)
  }
  const data = await res.json()
  const r = data?.['subsonic-response']
  if (r?.status !== 'ok' && r?.error?.code !== 70) {
    // error code 70 = "user not found" — treat as already gone
    throw new Error(`Gonic deleteUser failed: ${r?.error?.message || 'unknown error'}`)
  }
}

export async function triggerGonicScan() {
  const base = process.env.GONIC_URL
  if (!base) return

  const url = `${base}/rest/startScan.view?${subsonicParams()}`
  await fetch(url).catch(() => {}) // fire and forget
}

export async function getLastFmStatus(username) {
  const base = process.env.GONIC_URL
  if (!base) return { linked: false, apiKey: null }
  const url = `${base}/rest/getLastFmStatus.view?${subsonicParams({ username })}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Gonic getLastFmStatus HTTP ${res.status}`)
  const data = await res.json()
  const r = data?.['subsonic-response']
  if (r?.status !== 'ok') throw new Error(r?.error?.message || 'getLastFmStatus failed')
  return { linked: r.lastFmStatus?.linked ?? false, apiKey: r.lastFmStatus?.apiKey ?? null }
}

export async function linkLastFm(username, token) {
  const base = process.env.GONIC_URL
  if (!base) throw new Error('Gonic not configured')
  const url = `${base}/rest/linkLastFm.view?${subsonicParams({ username, token })}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Gonic linkLastFm HTTP ${res.status}`)
  const data = await res.json()
  const r = data?.['subsonic-response']
  if (r?.status !== 'ok') throw new Error(r?.error?.message || 'linkLastFm failed')
}

export async function unlinkLastFm(username) {
  const base = process.env.GONIC_URL
  if (!base) throw new Error('Gonic not configured')
  const url = `${base}/rest/unlinkLastFm.view?${subsonicParams({ username })}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Gonic unlinkLastFm HTTP ${res.status}`)
  const data = await res.json()
  const r = data?.['subsonic-response']
  if (r?.status !== 'ok') throw new Error(r?.error?.message || 'unlinkLastFm failed')
}

async function searchAlbumSongIds(artist, album) {
  const base = process.env.GONIC_URL
  const url = `${base}/rest/search3?${subsonicParams({ query: `${artist} ${album}`, songCount: 50, albumCount: 0 })}`
  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json()
  const songs = data?.['subsonic-response']?.searchResult3?.song || []
  return songs
    .filter((s) => looseMatch(s.album, album) && looseMatch(s.artist, artist))
    .map((s) => s.id)
}

async function getOrCreateWeeklyPlaylist(name) {
  const base = process.env.GONIC_URL

  const listRes = await fetch(`${base}/rest/getPlaylists?${subsonicParams()}`)
  if (listRes.ok) {
    const data = await listRes.json()
    const playlists = data?.['subsonic-response']?.playlists?.playlist || []
    const existing = playlists.find((p) => p.name === name)
    if (existing) return existing.id
  }

  const createRes = await fetch(`${base}/rest/createPlaylist?${subsonicParams({ name })}`, { method: 'POST' })
  if (!createRes.ok) throw new Error(`createPlaylist HTTP ${createRes.status}`)
  const created = await createRes.json()
  const id = created?.['subsonic-response']?.playlist?.id
  if (!id) throw new Error('createPlaylist returned no id')

  // Mark public so all users can see it in their Subsonic clients
  const pubParams = new URLSearchParams(subsonicParams({ playlistId: id, public: 'true' }))
  await fetch(`${base}/rest/updatePlaylist?${pubParams.toString()}`, { method: 'POST' }).catch(() => {})

  return id
}

export async function addAlbumToWeeklyPlaylist(artist, album) {
  const base = process.env.GONIC_URL
  if (!base) return

  // Retry up to 8 times with 30s delay — beets import + gonic scan can take a few minutes.
  // Caller is responsible for triggering a gonic scan before calling this.
  let songIds = []
  for (let i = 0; i < 8; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 30000))
    songIds = await searchAlbumSongIds(artist, album).catch(() => [])
    console.log(`[playlist] ${artist} / ${album}: attempt ${i + 1}, found ${songIds.length} songs`)
    if (songIds.length) break
  }
  if (!songIds.length) {
    console.log(`[playlist] ${artist} / ${album}: no songs found after retries, skipping`)
    return
  }

  const playlistName = `Weekly Exploration ${isoWeekLabel()}`
  const playlistId = await getOrCreateWeeklyPlaylist(playlistName)
  console.log(`[playlist] ${artist} / ${album}: adding ${songIds.length} songs to playlist ${playlistId}`)

  const params = new URLSearchParams(subsonicParams({ playlistId, public: 'true' }))
  for (const id of songIds) params.append('songIdToAdd', id)
  const res = await fetch(`${base}/rest/updatePlaylist?${params.toString()}`, { method: 'POST' })
  console.log(`[playlist] updatePlaylist status: ${res.status}`)
}

export async function findGonicUrl() {
  const base = process.env.GONIC_URL
  if (!base) return null
  return process.env.GONIC_PUBLIC_URL || base
}

function normStr(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function looseMatch(a, b) {
  const na = normStr(a)
  const nb = normStr(b)
  return na === nb || na.includes(nb) || nb.includes(na)
}

function isoWeekLabel(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  const week = 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
}

export async function checkDuplicateInLibrary(title, artist) {
  const base = process.env.GONIC_URL
  if (!base) return false

  try {
    const query = `${artist} ${title}`
    const url = `${base}/rest/search3?${subsonicParams({ query, songCount: 10, albumCount: 5 })}`
    const res = await fetch(url)
    if (!res.ok) return false

    const data = await res.json()
    const r = data?.['subsonic-response']
    if (r?.status !== 'ok') return false

    // Check albums (for album requests — title is the album name)
    const albums = r.searchResult3?.album || []
    if (albums.some((a) => looseMatch(a.name, title) && looseMatch(a.artist, artist))) return true

    // Check songs (for track requests — title is the track name)
    const songs = r.searchResult3?.song || []
    if (songs.some((s) => looseMatch(s.title, title) && looseMatch(s.artist, artist))) return true

    return false
  } catch {
    return false
  }
}
