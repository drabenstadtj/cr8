import { getWeeklyTracks } from '../services/listenbrainz.js'
import { checkDuplicateInLibrary } from '../services/gonic.js'

const PLAYLIST_TYPE = process.env.LB_PLAYLIST || 'weekly-exploration'
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // check every 6 hours

let lastRunWeek = null

function isoWeekKey(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  const week = 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  return `${d.getFullYear()}-W${week}`
}

export function startExplorationWorker(app) {
  app.log.info('Exploration worker started')
  runIfNewWeek(app)
  setInterval(() => runIfNewWeek(app).catch((e) => app.log.error(e)), CHECK_INTERVAL_MS)
}

async function runIfNewWeek(app) {
  const week = isoWeekKey()
  if (week === lastRunWeek) return
  lastRunWeek = week
  await runExploration(app).catch((e) =>
    app.log.error({ err: e.message }, 'Exploration worker failed')
  )
}

async function runExploration(app) {
  const prisma = app.prisma

  const users = await prisma.user.findMany({
    where: { listenbrainzUsername: { not: null } },
    select: { id: true, listenbrainzUsername: true },
  })

  if (!users.length) {
    app.log.info('No users with ListenBrainz usernames, skipping exploration')
    return
  }

  app.log.info({ users: users.length, playlist: PLAYLIST_TYPE }, 'Running weekly exploration')

  for (const user of users) {
    await runForUser(prisma, user, app.log).catch((e) =>
      app.log.warn({ user: user.listenbrainzUsername, err: e.message }, 'Exploration failed for user')
    )
  }
}

async function runForUser(prisma, user, log) {
  log.info({ lbUser: user.listenbrainzUsername }, 'Fetching LB recommendations')

  const tracks = await getWeeklyTracks(user.listenbrainzUsername, PLAYLIST_TYPE)
  log.info({ lbUser: user.listenbrainzUsername, tracks: tracks.length }, 'Got LB tracks')

  // One request per album — deduplicate by artist+album
  const seen = new Set()
  const albums = []
  for (const track of tracks) {
    if (!track.album || !track.mainArtist) continue
    const key = `${track.mainArtist.toLowerCase()}|${track.album.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    albums.push(track)
  }

  log.info({ lbUser: user.listenbrainzUsername, albums: albums.length }, 'Unique albums to consider')

  for (const track of albums) {
    const mbid = track.releaseMbid || track.mbid
    if (!mbid) {
      log.warn({ title: track.title, artist: track.mainArtist }, 'No MBID, skipping')
      continue
    }

    const existing = await prisma.request.findFirst({ where: { mbid } })
    if (existing) continue

    const inLibrary = await checkDuplicateInLibrary(track.album, track.mainArtist)
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
        userId: user.id,
      },
    })

    log.info({ artist: track.mainArtist, album: track.album }, 'Exploration request created')
  }
}
