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

export function createLibraryAdapter() {
  return {
    async createUser(username, password) {
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
    },

    async deleteUser(username) {
      const base = process.env.GONIC_URL
      if (!base) return

      const url = `${base}/rest/deleteUser.view?${subsonicParams({ username })}`
      const res = await fetch(url)
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Gonic deleteUser HTTP ${res.status}: ${body}`)
      }
      const data = await res.json()
      const r = data?.['subsonic-response']
      if (r?.status !== 'ok' && r?.error?.code !== 70) {
        throw new Error(`Gonic deleteUser failed: ${r?.error?.message || 'unknown error'}`)
      }
    },

    async scanLibrary() {
      const base = process.env.GONIC_URL
      if (!base) return

      const url = `${base}/rest/startScan.view?${subsonicParams()}`
      await fetch(url).catch(() => {})
    },

    async contains(title, artist) {
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

        const albums = r.searchResult3?.album || []
        if (albums.some((a) => looseMatch(a.name, title) && looseMatch(a.artist, artist))) return true

        const songs = r.searchResult3?.song || []
        if (songs.some((s) => looseMatch(s.title, title) && looseMatch(s.artist, artist))) return true

        return false
      } catch {
        return false
      }
    },

    async lastFmStatus(username) {
      const base = process.env.GONIC_URL
      if (!base) return { linked: false, apiKey: null }
      const url = `${base}/rest/getLastFmStatus.view?${subsonicParams({ username })}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Gonic getLastFmStatus HTTP ${res.status}`)
      const data = await res.json()
      const r = data?.['subsonic-response']
      if (r?.status !== 'ok') throw new Error(r?.error?.message || 'getLastFmStatus failed')
      return { linked: r.lastFmStatus?.linked ?? false, apiKey: r.lastFmStatus?.apiKey ?? null }
    },

    async linkLastFm(username, token) {
      const base = process.env.GONIC_URL
      if (!base) throw new Error('Gonic not configured')
      const url = `${base}/rest/linkLastFm.view?${subsonicParams({ username, token })}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Gonic linkLastFm HTTP ${res.status}`)
      const data = await res.json()
      const r = data?.['subsonic-response']
      if (r?.status !== 'ok') throw new Error(r?.error?.message || 'linkLastFm failed')
    },

    async unlinkLastFm(username) {
      const base = process.env.GONIC_URL
      if (!base) throw new Error('Gonic not configured')
      const url = `${base}/rest/unlinkLastFm.view?${subsonicParams({ username })}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Gonic unlinkLastFm HTTP ${res.status}`)
      const data = await res.json()
      const r = data?.['subsonic-response']
      if (r?.status !== 'ok') throw new Error(r?.error?.message || 'unlinkLastFm failed')
    },

    async getOrCreatePlaylist(name) {
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

      const pubParams = new URLSearchParams(subsonicParams({ playlistId: id, public: 'true' }))
      await fetch(`${base}/rest/updatePlaylist?${pubParams.toString()}`, { method: 'POST' }).catch(() => {})

      return id
    },

    async addTracksToPlaylist(playlistName, lbTracks, { maxRetries = 8 } = {}) {
      const base = process.env.GONIC_URL
      if (!base) return

      async function searchSongId(title, artist) {
        const res = await fetch(
          `${base}/rest/search3?${subsonicParams({ query: title, songCount: 20, albumCount: 0 })}`
        )
        if (!res.ok) return null
        const data = await res.json()
        const songs = data?.['subsonic-response']?.searchResult3?.song || []
        const match = songs.find((s) => looseMatch(s.title, title) && looseMatch(s.artist, artist))
        return match?.id ?? null
      }

      let songIds = []
      for (let i = 0; i < maxRetries; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 30000))
        const results = await Promise.all(
          lbTracks.map((t) => searchSongId(t.title, t.artist).catch(() => null))
        )
        songIds = results.filter(Boolean)
        console.log(`[playlist] attempt ${i + 1}: found ${songIds.length}/${lbTracks.length} LB tracks in gonic`)
        if (songIds.length) break
      }
      if (!songIds.length) return

      const playlistId = await this.getOrCreatePlaylist(playlistName)
      const params = new URLSearchParams(subsonicParams({ playlistId, public: 'true' }))
      for (const id of songIds) params.append('songIdToAdd', id)
      const res = await fetch(`${base}/rest/updatePlaylist?${params.toString()}`, { method: 'POST' })
      console.log(`[playlist] addTracksToPlaylist updatePlaylist status: ${res.status}`)
    },

    async addAlbumToPlaylist(playlistName, artist, album, { maxRetries = 8 } = {}) {
      const base = process.env.GONIC_URL
      if (!base) return

      async function searchAlbumSongIds() {
        const searchRes = await fetch(
          `${base}/rest/search3?${subsonicParams({ query: album, songCount: 0, albumCount: 20 })}`
        )
        if (!searchRes.ok) return []
        const searchData = await searchRes.json()
        const albums = searchData?.['subsonic-response']?.searchResult3?.album || []
        const matched = albums.filter(
          (a) => looseMatch(a.name, album) && looseMatch(a.artist, artist)
        )
        if (!matched.length) return []

        const songIds = []
        for (const a of matched) {
          const albumRes = await fetch(`${base}/rest/getAlbum?${subsonicParams({ id: a.id })}`)
          if (!albumRes.ok) continue
          const albumData = await albumRes.json()
          const songs = albumData?.['subsonic-response']?.album?.song || []
          for (const s of songs) songIds.push(s.id)
        }
        return songIds
      }

      let songIds = []
      for (let i = 0; i < maxRetries; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 30000))
        songIds = await searchAlbumSongIds().catch(() => [])
        console.log(`[playlist] ${artist} / ${album}: attempt ${i + 1}, found ${songIds.length} songs`)
        if (songIds.length) break
      }
      if (!songIds.length) {
        console.log(`[playlist] ${artist} / ${album}: no songs found after retries, skipping`)
        return
      }

      const playlistId = await this.getOrCreatePlaylist(playlistName)
      console.log(`[playlist] ${artist} / ${album}: adding ${songIds.length} songs to playlist ${playlistId}`)

      const params = new URLSearchParams(subsonicParams({ playlistId, public: 'true' }))
      for (const id of songIds) params.append('songIdToAdd', id)
      const res = await fetch(`${base}/rest/updatePlaylist?${params.toString()}`, { method: 'POST' })
      console.log(`[playlist] updatePlaylist status: ${res.status}`)
    },

    weeklyPlaylistName() {
      return `Weekly Exploration ${isoWeekLabel()}`
    },
  }
}
