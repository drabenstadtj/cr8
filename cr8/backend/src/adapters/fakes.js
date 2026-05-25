// In-memory fake implementations of all adapters for use in tests.
// Each factory accepts optional overrides so tests can configure specific behaviour.

export function createFakeCatalog({ tracks = [], albums = [], artists = [] } = {}) {
  return {
    async searchTracks() { return { total: tracks.length, results: tracks } },
    async searchAlbums() { return { total: albums.length, results: albums } },
    async searchArtists() { return { total: artists.length, results: artists } },
    async browseArtistAlbums() { return { total: albums.length, results: albums } },
    async lookup() { return {} },
  }
}

export function createFakeSoulseek({
  searchResponses = [],
  downloads = [],
  shouldFailQueue = false,
} = {}) {
  const searches = new Map()
  let searchIdCounter = 1

  return {
    async startSearch(searchText) {
      const id = String(searchIdCounter++)
      searches.set(id, searchText)
      return id
    },

    async pollSearch() {
      return searchResponses
    },

    async cancelSearch() {},

    async queueFiles(username, files) {
      if (shouldFailQueue) throw new Error('Queue failed')
    },

    async getDownloads() {
      return downloads
    },

    async removeDownload() {},

    async requeueFiles() {},
  }
}

export function createFakeRecommender({ tracks = [] } = {}) {
  return {
    async weeklyTracks() {
      return tracks
    },
  }
}

export function createFakeLibrary({
  containsResult = false,
  lastFmLinked = false,
  shouldFailCreateUser = false,
} = {}) {
  const playlists = new Map()

  return {
    async createUser(username) {
      if (shouldFailCreateUser) throw new Error('createUser failed')
    },

    async deleteUser() {},

    async scanLibrary() {},

    async contains() {
      return containsResult
    },

    async lastFmStatus() {
      return { linked: lastFmLinked, apiKey: null }
    },

    async linkLastFm() {},

    async unlinkLastFm() {},

    async getOrCreatePlaylist(name) {
      if (!playlists.has(name)) playlists.set(name, String(playlists.size + 1))
      return playlists.get(name)
    },

    async addTracksToPlaylist() {},

    async addAlbumToPlaylist() {},

    weeklyPlaylistName() {
      return 'Weekly Exploration 2025-W01'
    },
  }
}

export function createFakeImporter({ shouldFail = false } = {}) {
  const imports = []

  return {
    async importDownload(name) {
      if (shouldFail) throw new Error('import failed')
      imports.push(name)
    },

    _imports: imports,
  }
}
