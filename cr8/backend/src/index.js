import { createApp } from './app.js'
import { config } from './config.js'
import { startDownloadWorker } from './features/requests/downloader.js'
import { startExplorationWorker } from './features/exploration/worker.js'

const app = await createApp()

const port = config.PORT
await app.listen({ port, host: '0.0.0.0' })

startDownloadWorker(app)
startExplorationWorker(app)

async function checkSlskd() {
  try {
    const res = await fetch(`${config.SLSKD_URL}/api/v0/application`, {
      headers: { 'X-API-Key': config.SLSKD_API_KEY },
    })
    if (res.ok) app.log.info('slskd connected')
    else app.log.warn(`slskd reachable but returned ${res.status} — check API key`)
  } catch {
    app.log.warn(`slskd unreachable at ${config.SLSKD_URL}`)
  }
}

async function checkGonic() {
  const base = config.GONIC_URL
  if (!base) { app.log.info('Gonic not configured, skipping library checks'); return }
  try {
    await app.library.contains('ping', 'ping')
    app.log.info('Gonic connected')
  } catch {
    app.log.warn(`Gonic unreachable at ${base}`)
  }
}

checkSlskd()
checkGonic()
