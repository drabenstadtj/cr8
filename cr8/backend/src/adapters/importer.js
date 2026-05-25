import { config } from '../config.js'

export function createImporterAdapter() {
  return {
    async importDownload(name) {
      if (!config.BETANIN_URL) return

      const body = new URLSearchParams({ path: config.DOWNLOAD_DIR, name })

      const res = await fetch(`${config.BETANIN_URL}/api/torrents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...(config.BETANIN_API_KEY ? { 'X-API-Key': config.BETANIN_API_KEY } : {}),
        },
        body: body.toString(),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`betanin import failed ${res.status}: ${text}`)
      }
    },
  }
}
