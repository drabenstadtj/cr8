import {
  startSearch,
  waitForSearch,
  collectCandidates,
  collectAlbumCandidates,
  queueBestDownload,
  queueAlbumDownload,
  getDownloads,
  deleteSearch,
  cleanupDownload,
} from '../services/slskd.js'
import { triggerBetaninImport } from '../services/betanin.js'

const POLL_INTERVAL_MS = 15000

export function startDownloadWorker(app) {
  app.log.info('Download worker started')
  setInterval(() => runWorker(app).catch((e) => app.log.error(e)), POLL_INTERVAL_MS)
}

async function runWorker(app) {
  const prisma = app.prisma

  const approved = await prisma.request.findMany({ where: { status: 'APPROVED' } })
  for (const req of approved) {
    await startDownload(prisma, req, app.log)
  }

  const downloading = await prisma.request.findMany({ where: { status: 'DOWNLOADING' } })
  if (downloading.length) {
    await pollDownloads(prisma, downloading, app.log)
  }
}

async function startDownload(prisma, request, log) {
  log.info({ id: request.id, type: request.type }, 'Starting slskd search')

  try {
    await prisma.request.update({ where: { id: request.id }, data: { status: 'SEARCHING' } })

    const isAlbum = request.type === 'ALBUM'
    const searchText = isAlbum
      ? `${request.artist} ${request.album || request.title}`
      : `${request.artist} - ${request.title}`

    const searchId = await startSearch(searchText)
    await prisma.request.update({ where: { id: request.id }, data: { slskdSearchId: searchId } })

    const responses = await waitForSearch(searchId)
    await deleteSearch(searchId)

    if (isAlbum) {
      const candidates = collectAlbumCandidates(responses, {
        artist: request.artist,
        album: request.album || request.title,
      })

      if (!candidates.length) {
        log.warn({ id: request.id }, 'No suitable album candidates found')
        await prisma.request.update({ where: { id: request.id }, data: { status: 'FAILED' } })
        return
      }

      const queued = await queueAlbumDownload(candidates)
      await prisma.request.update({
        where: { id: request.id },
        data: {
          status: 'DOWNLOADING',
          slskdUsername: queued.username,
          slskdFilename: queued.directory, // store directory for album polling
        },
      })

      log.info(
        { id: request.id, dir: queued.directory, tracks: queued.files.length },
        'Album download queued'
      )
    } else {
      const candidates = collectCandidates(responses, {
        title: request.title,
        artist: request.artist,
        album: request.album,
        durationS: null,
      })

      if (!candidates.length) {
        log.warn({ id: request.id }, 'No suitable candidates found')
        await prisma.request.update({ where: { id: request.id }, data: { status: 'FAILED' } })
        return
      }

      const queued = await queueBestDownload(candidates)
      await prisma.request.update({
        where: { id: request.id },
        data: {
          status: 'DOWNLOADING',
          slskdUsername: queued.username,
          slskdFilename: queued.filename,
        },
      })

      log.info({ id: request.id, file: queued.filename }, 'Track download queued')
    }
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

  const allFiles = allDownloads.flatMap((u) =>
    (u.directories?.flatMap((d) => d.files || []) || []).map((f) => ({
      ...f,
      username: u.username,
    }))
  )

  for (const request of requests) {
    if (request.type === 'ALBUM') {
      // slskdFilename stores the directory for album requests
      const dirFiles = allFiles.filter(
        (f) =>
          f.username === request.slskdUsername &&
          f.filename.startsWith(request.slskdFilename)
      )

      if (!dirFiles.length) continue

      const anyFailed = dirFiles.some(
        (f) => f.state?.startsWith('Completed,') && f.state !== 'Completed, Succeeded'
      )
      const allSucceeded = dirFiles.every((f) => f.state === 'Completed, Succeeded')

      if (allSucceeded) {
        log.info({ id: request.id, tracks: dirFiles.length }, 'Album download complete')
        await prisma.request.update({ where: { id: request.id }, data: { status: 'COMPLETE' } })
        await triggerBetaninImport(`${request.artist} - ${request.album || request.title}`).catch(
          (e) => log.warn({ err: e.message }, 'betanin import trigger failed')
        )
        for (const f of dirFiles) {
          await cleanupDownload(request.slskdUsername, f.id).catch(() => {})
        }
      } else if (anyFailed) {
        const allRejected = dirFiles
          .filter((f) => f.state?.startsWith('Completed,'))
          .every((f) => f.state === 'Completed, Rejected')
        if (allRejected) {
          log.warn({ id: request.id, user: request.slskdUsername }, 'Album rejected by peer — retrying with new search')
          await prisma.request.update({ where: { id: request.id }, data: { status: 'APPROVED', slskdUsername: null, slskdFilename: null } })
        } else {
          log.warn({ id: request.id }, 'Album download has failed tracks')
          await prisma.request.update({ where: { id: request.id }, data: { status: 'FAILED' } })
        }
      }
    } else {
      const match = allFiles.find(
        (f) => f.username === request.slskdUsername && f.filename === request.slskdFilename
      )

      if (!match) continue

      if (match.state === 'Completed, Succeeded') {
        log.info({ id: request.id }, 'Download complete')
        await prisma.request.update({ where: { id: request.id }, data: { status: 'COMPLETE' } })
        await triggerBetaninImport(`${request.artist} - ${request.title}`).catch(
          (e) => log.warn({ err: e.message }, 'betanin import trigger failed')
        )
        await cleanupDownload(request.slskdUsername, match.id)
      } else if (match.state === 'Completed, Rejected') {
        log.warn({ id: request.id, user: request.slskdUsername }, 'Track rejected by peer — retrying with new search')
        await prisma.request.update({ where: { id: request.id }, data: { status: 'APPROVED', slskdUsername: null, slskdFilename: null } })
      } else if (match.state?.startsWith('Completed,')) {
        log.warn({ id: request.id, state: match.state }, 'Download failed')
        await prisma.request.update({ where: { id: request.id }, data: { status: 'FAILED' } })
      }
    }
  }
}
