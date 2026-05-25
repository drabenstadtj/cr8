import { createApp } from './app.js'
import { startDownloadWorker } from './features/requests/downloader.js'
import { startExplorationWorker } from './features/exploration/worker.js'

const app = await createApp()

const port = parseInt(process.env.PORT || '3000')
await app.listen({ port, host: '0.0.0.0' })

startDownloadWorker(app)
startExplorationWorker(app)
