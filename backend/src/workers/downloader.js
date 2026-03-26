import {
  startSearch,
  waitForSearch,
  selectBestFile,
  queueDownload,
  getDownloads,
  deleteSearch,
  cleanupDownload,
} from '../services/slskd.js'

const POLL_INTERVAL_MS = 15000

export function startDownloadWorker(app) {
  app.log.info('Download worker started')
  setInterval(() => runWorker(app).catch((e) => app.log.error(e)), POLL_INTERVAL_MS)
}

async function runWorker(app) {
  const prisma = app.prisma

  // Process approved requests
  const approved = await prisma.request.findMany({ where: { status: 'APPROVED' } })
  for (const req of approved) {
    await startDownload(prisma, req, app.log)
  }

  // Poll in-progress downloads
  const downloading = await prisma.request.findMany({ where: { status: 'DOWNLOADING' } })
  if (downloading.length) {
    await pollDownloads(prisma, downloading, app.log)
  }
}

async function startDownload(prisma, request, log) {
  log.info({ id: request.id }, 'Starting slskd search for request')

  try {
    await prisma.request.update({ where: { id: request.id }, data: { status: 'SEARCHING' } })

    const searchText = `${request.artist} - ${request.title}`
    const searchId = await startSearch(searchText)
    await prisma.request.update({ where: { id: request.id }, data: { slskdSearchId: searchId } })

    const responses = await waitForSearch(searchId)
    await deleteSearch(searchId)

    const best = selectBestFile(responses, {
      title: request.title,
      artist: request.artist,
      durationMs: null, // TODO: pass from MusicBrainz metadata if available
    })

    if (!best) {
      log.warn({ id: request.id }, 'No suitable file found')
      await prisma.request.update({ where: { id: request.id }, data: { status: 'FAILED' } })
      return
    }

    await queueDownload(best.username, best.filename, best.size)
    await prisma.request.update({
      where: { id: request.id },
      data: {
        status: 'DOWNLOADING',
        slskdUsername: best.username,
        slskdFilename: best.filename,
      },
    })

    log.info({ id: request.id, file: best.filename }, 'Download queued')
  } catch (err) {
    log.error({ id: request.id, err }, 'Download failed')
    await prisma.request.update({ where: { id: request.id }, data: { status: 'FAILED' } })
  }
}

async function pollDownloads(prisma, requests, log) {
  let allDownloads
  try {
    allDownloads = await getDownloads()
  } catch {
    return
  }

  for (const request of requests) {
    const match = allDownloads
      .flatMap((u) => u.directories?.flatMap((d) => d.files || []) || [])
      .find(
        (f) =>
          f.username === request.slskdUsername &&
          f.filename === request.slskdFilename
      )

    if (!match) continue

    if (match.state === 'Completed, Succeeded') {
      log.info({ id: request.id }, 'Download complete')
      await prisma.request.update({ where: { id: request.id }, data: { status: 'COMPLETE' } })
      await cleanupDownload(request.slskdUsername, match.id)
    } else if (match.state?.startsWith('Completed,')) {
      log.warn({ id: request.id, state: match.state }, 'Download failed')
      await prisma.request.update({ where: { id: request.id }, data: { status: 'FAILED' } })
    }
  }
}
