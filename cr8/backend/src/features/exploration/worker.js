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

  const users = await prisma.user.findMany({
    where: { listenbrainzUsername: { not: null } },
    select: { id: true, listenbrainzUsername: true },
  })

  if (!users.length) {
    log.info({ runId }, 'No users with ListenBrainz usernames, skipping exploration')
    return
  }

  log.info({ runId, users: users.length, playlist: PLAYLIST_TYPE }, 'Running weekly exploration')

  for (const user of users) {
    await runForUser(prisma, user, recommender, library, log, runId).catch((e) =>
      log.warn({ runId, lbUser: user.listenbrainzUsername, err: e.message }, 'Exploration failed for user')
    )
  }

  log.info({ runId }, 'Exploration run complete')
}

async function runForUser(prisma, user, recommender, library, log, runId) {
  const lbUser = user.listenbrainzUsername
  log.info({ runId, lbUser }, 'Fetching LB recommendations')

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
      continue
    }

    const existing = await prisma.request.findFirst({ where: { mbid } })
    if (existing) continue

    const inLibrary = await library.contains(track.album, track.mainArtist)
    if (inLibrary) continue

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

    log.info({ runId, lbUser, artist: track.mainArtist, album: track.album }, 'Exploration request created')
  }
}
