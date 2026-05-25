import { config } from '../config.js'

const BASE = () => config.SLSKD_URL
const API_KEY = () => config.SLSKD_API_KEY

function headers() {
  return { 'X-API-Key': API_KEY(), 'Content-Type': 'application/json' }
}

async function slskdFetch(path, options = {}) {
  const res = await fetch(`${BASE()}${path}`, { ...options, headers: headers() })
  if (!res.ok) throw new Error(`slskd error ${res.status}: ${path}`)
  if (res.status === 204) return null
  return res.json()
}

export function createSoulseekAdapter() {
  return {
    async startSearch(searchText) {
      const data = await slskdFetch('/api/v0/searches', {
        method: 'POST',
        body: JSON.stringify({ searchText }),
      })
      return data.id
    },

    async pollSearch(searchId, retries = 20) {
      for (let i = 0; i < retries; i++) {
        const search = await slskdFetch(`/api/v0/searches/${searchId}`)
        if (search.isComplete) {
          if (search.fileCount === 0 || search.fileCount === search.lockedFileCount) {
            throw new Error(`Search complete but no available files found`)
          }
          return slskdFetch(`/api/v0/searches/${searchId}/responses`)
        }
        await new Promise((r) => setTimeout(r, 15000))
      }
      throw new Error(`Search ${searchId} did not complete after ${retries} retries`)
    },

    async cancelSearch(searchId) {
      await slskdFetch(`/api/v0/searches/${searchId}`, { method: 'DELETE' })
    },

    async queueFiles(username, files) {
      await slskdFetch(`/api/v0/transfers/downloads/${username}`, {
        method: 'POST',
        body: JSON.stringify(files.map((f) => ({ filename: f.filename, size: f.size }))),
      })
    },

    async getDownloads() {
      return slskdFetch('/api/v0/transfers/downloads')
    },

    async removeDownload(username, downloadId) {
      await slskdFetch(`/api/v0/transfers/downloads/${username}/${downloadId}?remove=false`, {
        method: 'DELETE',
      })
      await new Promise((r) => setTimeout(r, 1000))
      await slskdFetch(`/api/v0/transfers/downloads/${username}/${downloadId}?remove=true`, {
        method: 'DELETE',
      })
    },

    async requeueFiles(username, files) {
      await slskdFetch(`/api/v0/transfers/downloads/${username}`, {
        method: 'POST',
        body: JSON.stringify(files.map((f) => ({ filename: f.filename, size: f.size }))),
      })
    },
  }
}
