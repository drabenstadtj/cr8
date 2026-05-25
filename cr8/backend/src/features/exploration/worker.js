import crypto from 'crypto'
import cron from 'node-cron'
import { config } from '../../config.js'

const PLAYLIST_TYPE = config.LB_PLAYLIST

export function startExplorationWorker(app) {
  app.log.info('Exploration worker started — scheduled for Mondays at 08:30')
  cron.schedule('30 8 * * 1', () => {
    runExploration(app).catch((e) => app.log.error({ err: e.message }, 'Exploration worker failed'))
  })
}

export async function triggerExploration(app) {
  await runExploration(app)
}

async function runExploration(app) {
  const { prisma, recommender, library, log } = app
  const runId = crypto.randomUUID()
  const startedAt = new Date()
  const summary = { usersProcessed: 0, requestsCreated: 0, albumsSkipped: 0, failures: [] }

  const users = await prisma.user.findMany({
    where: { listenbrainzUsername: { not: null } },
    select: { id: true, listenbrainzUsername: true },
  })

  if (!users.length) {
    log.info({ runId }, 'No users with ListenBrainz usernames, skipping exploration')
    await writeRun(prisma, { runId, startedAt, outcome: 'empty', summary })
    return
  }

  log.info({ runId, users: users.length, playlist: PLAYLIST_TYPE }, 'Running weekly exploration')

  for (const user of users) {
    await runForUser(prisma, user, recommender, library, log, runId, summary).catch((e) => {
      log.warn({ runId, lbUser: user.listenbrainzUsername, err: e.message }, 'Exploration failed for user')
      summary.failures.push({ lbUser: user.listenbrainzUsername, error: e.message })
    })
  }

  const outcome = summary.failures.length === 0
    ? 'ok'
    : summary.usersProcessed === 0
      ? 'failed'
      : 'partial'

  log.info({ runId, outcome, ...summary }, 'Exploration run complete')
  await writeRun(prisma, { runId, startedAt, outcome, summary })
}

async function writeRun(prisma, { runId, startedAt, outcome, summary }) {
  await prisma.explorationRun.create({
    data: {
      runId,
      startedAt,
      finishedAt: new Date(),
      outcome,
      usersProcessed: summary.usersProcessed,
      requestsCreated: summary.requestsCreated,
      albumsSkipped: summary.albumsSkipped,
      failures: summary.failures.length ? JSON.stringify(summary.failures) : null,
    },
  }).catch((e) => {
    // non-fatal: if DB write fails the run still happened
    console.error('Failed to write ExplorationRun record:', e.message)
  })
}

async function runForUser(prisma, user, recommender, library, log, runId, summary) {
  const lbUser = user.listenbrainzUsername
  log.info({ runId, lbUser }, 'Fetching LB recommendations')
  summary.usersProcessed++

  const tracks = await recommender.weeklyTracks(lbUser, PLAYLIST_TYPE)
  log.info({ runId, lbUser, tracks: tracks.length }, 'Got LB tracks')

  const albumMap = new Map()
  for (const track of tracks) {
    if (!track.album || !track.mainArtist) continue
    const key = `${track.mainArtist.toLowerCase()}|${track.album.toLowerCase()}`
    if (!albumMap.has(key)) albumMap.set(key, { representative: track, lbTracks: [] })
    albumMap.get(key).lbTracks.push({ title: track.title, artist: track.mainArtist })
  }

  log.info({ runId, lbUser, albums: albumMap.size }, 'Unique albums to consider')

  for (const { representative: track, lbTracks } of albumMap.values()) {
    const mbid = track.releaseMbid || track.mbid
    if (!mbid) {
      log.warn({ runId, lbUser, artist: track.mainArtist, album: track.album }, 'No MBID, skipping')
      summary.albumsSkipped++
      continue
    }

    const existing = await prisma.request.findFirst({ where: { mbid } })
    if (existing) {
      summary.albumsSkipped++
      continue
    }

    const inLibrary = await library.contains(track.album, track.mainArtist)
    if (inLibrary) {
      summary.albumsSkipped++
      continue
    }

    const coverArt = track.releaseMbid
      ? `https://coverartarchive.org/release/${track.releaseMbid}/front`
      : null

    await prisma.request.create({
      data: {
        mbid,
        title: track.album,
        artist: track.mainArtist,
        album: track.album,
        type: 'ALBUM',
        status: 'APPROVED',
        coverArt,
        lbTrackTitles: JSON.stringify(lbTracks),
        userId: user.id,
      },
    })

    summary.requestsCreated++
    log.info({ runId, lbUser, artist: track.mainArtist, album: track.album }, 'Exploration request created')
  }
}
