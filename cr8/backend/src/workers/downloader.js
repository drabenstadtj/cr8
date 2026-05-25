import { collectCandidates, collectAlbumCandidates } from '../lib/scoring.js'
import { applyTransition } from '../lib/apply-transition.js'
import { EVENT, EFFECT } from '../lib/request-machine.js'

const POLL_INTERVAL_MS = 15000
const MAX_TRACK_RETRIES = 3

let workerRunning = false

export function startDownloadWorker(app) {
  app.log.info('Download worker started')
  setInterval(() => {
    if (workerRunning) return
    workerRunning = true
    runWorker(app).catch((e) => app.log.error(e)).finally(() => { workerRunning = false })
  }, POLL_INTERVAL_MS)
}

async function runWorker(app) {
  const prisma = app.prisma

  const approved = await prisma.request.findMany({ where: { status: 'APPROVED' } })
  for (const req of approved) {
    await startDownload(prisma, req, app)
  }

  const downloading = await prisma.request.findMany({ where: { status: 'DOWNLOADING' } })
  if (downloading.length) {
    await pollDownloads(prisma, downloading, app)
  }
}

async function startDownload(prisma, request, app) {
  const { soulseek, log } = app
  log.info({ id: request.id, type: request.type }, 'Starting slskd search')

  try {
    const isAlbum = request.type === 'ALBUM'
    const searchText = isAlbum
      ? `${request.artist} ${request.album || request.title}`
      : `${request.artist} - ${request.title}`

    const searchId = await soulseek.startSearch(searchText)
    await applyTransition(prisma, request, EVENT.SEARCH_STARTED, { searchId })

    const responses = await soulseek.pollSearch(searchId)
    await soulseek.cancelSearch(searchId)

    // Reload to get latest status after SEARCH_STARTED update
    const searching = await prisma.request.findUnique({ where: { id: request.id } })

    if (isAlbum) {
      const candidates = collectAlbumCandidates(responses, {
        artist: request.artist,
        album: request.album || request.title,
      })

      if (!candidates.length) {
        log.warn({ id: request.id }, 'No suitable album candidates found')
        await applyTransition(prisma, searching, EVENT.NO_CANDIDATES)
        return
      }

      let queued = null
      for (const candidate of candidates) {
        try {
          await soulseek.queueFiles(candidate.username, candidate.files)
          queued = candidate
          break
        } catch { continue }
      }

      if (!queued) {
        log.warn({ id: request.id }, 'Failed to queue any album candidate')
        await applyTransition(prisma, searching, EVENT.QUEUE_FAILED)
        return
      }

      await applyTransition(prisma, searching, EVENT.DOWNLOAD_QUEUED, {
        username: queued.username,
        filename: queued.directory,
      })

      log.info({ id: request.id, dir: queued.directory, tracks: queued.files.length }, 'Album download queued')
    } else {
      const candidates = collectCandidates(responses, {
        title: request.title,
        artist: request.artist,
        album: request.album,
        durationS: null,
      })

      if (!candidates.length) {
        log.warn({ id: request.id }, 'No suitable candidates found')
        await applyTransition(prisma, searching, EVENT.NO_CANDIDATES)
        return
      }

      let queued = null
      for (const candidate of candidates) {
        try {
          await soulseek.queueFiles(candidate.username, [{ filename: candidate.filename, size: candidate.size }])
          queued = candidate
          break
        } catch { continue }
      }

      if (!queued) {
        log.warn({ id: request.id }, 'Failed to queue any track candidate')
        await applyTransition(prisma, searching, EVENT.QUEUE_FAILED)
        return
      }

      await applyTransition(prisma, searching, EVENT.DOWNLOAD_QUEUED, {
        username: queued.username,
        filename: queued.filename,
      })

      log.info({ id: request.id, file: queued.filename }, 'Track download queued')
    }
  } catch (err) {
    log.error({ id: request.id, err }, 'Download failed')
    // Force status to FAILED without going through the machine (unexpected error path)
    await prisma.request.update({ where: { id: request.id }, data: { status: 'FAILED' } })
  }
}

async function executeSideEffects(sideEffects, { library, importer, log, requestId }) {
  for (const effect of sideEffects) {
    if (effect.type === EFFECT.IMPORT_DOWNLOAD) {
      await importer.importDownload(effect.payload.dirName).catch(
        (e) => log.warn({ err: e.message }, 'betanin import trigger failed')
      )
    } else if (effect.type === EFFECT.SCAN_LIBRARY) {
      library.scanLibrary()
    } else if (effect.type === EFFECT.ADD_TO_PLAYLIST) {
      library.addTracksToPlaylist(effect.payload.playlistName, effect.payload.lbTracks).catch(
        (e) => log.warn({ id: requestId, err: e.message }, 'Weekly playlist update failed')
      )
    }
  }
}

async function pollDownloads(prisma, requests, app) {
  const { soulseek, library, importer, log } = app

  let allDownloads
  try {
    allDownloads = await soulseek.getDownloads()
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
        const dirName = request.slskdFilename.replace(/\\/g, '/').split('/').filter(Boolean).pop()
        const lbTracks = request.lbTrackTitles ? JSON.parse(request.lbTrackTitles) : null
        const { sideEffects } = await applyTransition(prisma, request, EVENT.DOWNLOAD_COMPLETE, {
          dirName,
          lbTracks: lbTracks ?? [],
          playlistName: library.weeklyPlaylistName(),
        })
        await executeSideEffects(sideEffects, { library, importer, log, requestId: request.id })
        for (const f of dirFiles) {
          await soulseek.removeDownload(request.slskdUsername, f.id).catch(() => {})
        }
      } else if (anyFailed) {
        const completedFiles = dirFiles.filter((f) => f.state?.startsWith('Completed,'))
        const allRejected = completedFiles.every((f) => f.state === 'Completed, Rejected')
        const failedFiles = completedFiles.filter((f) => f.state !== 'Completed, Succeeded')

        if (allRejected || request.downloadRetries >= MAX_TRACK_RETRIES) {
          const reason = allRejected ? 'Album rejected by peer' : 'Max track retries reached'
          log.warn({ id: request.id, user: request.slskdUsername, retries: request.downloadRetries }, `${reason} — retrying with new search`)
          for (const f of dirFiles) {
            await soulseek.removeDownload(request.slskdUsername, f.id).catch(() => {})
          }
          await applyTransition(prisma, request, EVENT.FRESH_SEARCH, {}, reason)
        } else {
          log.warn(
            { id: request.id, failed: failedFiles.length, retry: request.downloadRetries + 1 },
            'Retrying failed tracks'
          )
          for (const f of failedFiles) {
            await soulseek.removeDownload(request.slskdUsername, f.id).catch(() => {})
          }
          await soulseek.requeueFiles(request.slskdUsername, failedFiles).catch((e) => {
            log.warn({ id: request.id, err: e.message }, 'Failed to requeue tracks — will retry next poll')
          })
          await applyTransition(prisma, request, EVENT.PEER_RETRY, { retries: request.downloadRetries + 1 })
        }
      }
    } else {
      const match = allFiles.find(
        (f) => f.username === request.slskdUsername && f.filename === request.slskdFilename
      )

      if (!match) continue

      if (match.state === 'Completed, Succeeded') {
        log.info({ id: request.id }, 'Download complete')
        const trackDirName = request.slskdFilename.replace(/\\/g, '/').split('/').filter(Boolean).slice(-2, -1)[0] || request.slskdFilename
        const { sideEffects } = await applyTransition(prisma, request, EVENT.DOWNLOAD_COMPLETE, {
          dirName: trackDirName,
          lbTracks: [],
        })
        await executeSideEffects(sideEffects, { library, importer, log, requestId: request.id })
        await soulseek.removeDownload(request.slskdUsername, match.id)
      } else if (match.state === 'Completed, Rejected' || request.downloadRetries >= MAX_TRACK_RETRIES) {
        const reason = match.state === 'Completed, Rejected' ? 'Track rejected by peer' : 'Max track retries reached'
        log.warn({ id: request.id, user: request.slskdUsername, retries: request.downloadRetries }, `${reason} — retrying with new search`)
        await soulseek.removeDownload(request.slskdUsername, match.id).catch(() => {})
        await applyTransition(prisma, request, EVENT.FRESH_SEARCH, {}, reason)
      } else if (match.state?.startsWith('Completed,')) {
        log.warn({ id: request.id, state: match.state, retry: request.downloadRetries + 1 }, 'Track download failed — retrying')
        await soulseek.removeDownload(request.slskdUsername, match.id).catch(() => {})
        await soulseek.requeueFiles(request.slskdUsername, [match]).catch((e) => {
          log.warn({ id: request.id, err: e.message }, 'Failed to requeue track — will retry next poll')
        })
        await applyTransition(prisma, request, EVENT.PEER_RETRY, { retries: request.downloadRetries + 1 })
      }
    }
  }
}
