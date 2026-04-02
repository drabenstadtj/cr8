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

export async function findGonicUrl() {
  const base = process.env.GONIC_URL
  if (!base) return null
  return process.env.GONIC_PUBLIC_URL || base
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

    const lTitle = title.toLowerCase()
    const lArtist = artist.toLowerCase()

    // Check songs (for track searches)
    const songs = r.searchResult3?.song || []
    if (songs.some((s) =>
      s.title?.toLowerCase() === lTitle &&
      s.artist?.toLowerCase() === lArtist
    )) return true

    // Check albums (for album searches — title is the album name)
    const albums = r.searchResult3?.album || []
    if (albums.some((a) =>
      a.name?.toLowerCase() === lTitle &&
      a.artist?.toLowerCase() === lArtist
    )) return true

    return false
  } catch {
    return false
  }
}
