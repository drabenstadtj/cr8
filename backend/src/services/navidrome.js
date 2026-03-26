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

async function navidromeAdminToken() {
  const base = process.env.NAVIDROME_URL
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: process.env.NAVIDROME_USER || '',
      password: process.env.NAVIDROME_PASSWORD || '',
    }),
  })
  if (!res.ok) throw new Error(`Navidrome admin login failed: ${res.status}`)
  const data = await res.json()
  if (!data.token) throw new Error('Navidrome admin login returned no token')
  return data.token
}

export async function createNavidromeUser(username, password) {
  const base = process.env.NAVIDROME_URL
  if (!base) return

  const token = await navidromeAdminToken()

  const res = await fetch(`${base}/api/user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-nd-authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ userName: username, name: username, password, isAdmin: false }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Navidrome createUser HTTP ${res.status}: ${body}`)
  }
}

export async function deleteNavidromeUser(username) {
  const base = process.env.NAVIDROME_URL
  if (!base) return

  const token = await navidromeAdminToken()

  // Need to look up the user's Navidrome ID first
  const listRes = await fetch(`${base}/api/user?_end=500&_start=0`, {
    headers: { 'x-nd-authorization': `Bearer ${token}` },
  })
  if (!listRes.ok) throw new Error(`Navidrome list users HTTP ${listRes.status}`)
  const users = await listRes.json()
  const ndUser = users.find((u) => u.userName === username)
  if (!ndUser) return // already gone

  const delRes = await fetch(`${base}/api/user/${ndUser.id}`, {
    method: 'DELETE',
    headers: { 'x-nd-authorization': `Bearer ${token}` },
  })
  if (!delRes.ok) throw new Error(`Navidrome deleteUser HTTP ${delRes.status}`)
}

export async function findNavidromeUrl(title, artist, type) {
  const base = process.env.NAVIDROME_URL
  if (!base) return null

  try {
    const query = `${artist} ${title}`
    const url = `${base}/rest/search3?${subsonicParams({ query, albumCount: 5, songCount: 5, artistCount: 0 })}`
    const res = await fetch(url)
    if (!res.ok) return null

    const data = await res.json()
    const r = data?.['subsonic-response']
    if (r?.status !== 'ok') return null

    if (type === 'ALBUM') {
      const albums = r.searchResult3?.album || []
      const match = albums.find(
        (a) =>
          a.name?.toLowerCase() === title.toLowerCase() &&
          a.artist?.toLowerCase() === artist.toLowerCase()
      ) || albums[0]
      if (match) return `${base}/app/#/album/${match.id}/show`
    } else {
      const songs = r.searchResult3?.song || []
      const match = songs.find(
        (s) =>
          s.title?.toLowerCase() === title.toLowerCase() &&
          s.artist?.toLowerCase() === artist.toLowerCase()
      ) || songs[0]
      if (match) return `${base}/app/#/album/${match.albumId}/show`
    }
  } catch {
    // fall through
  }
  return `${base}/app/`
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
