import crypto from 'crypto'
import { triggerExploration } from '../workers/exploration.js'
import { applyTransition } from '../lib/apply-transition.js'
import { EVENT } from '../lib/request-machine.js'

export default async function adminRoutes(app) {
  app.get('/requests', { onRequest: [app.requireAdmin] }, async (req) => {
    return req.prisma.request.findMany({
      include: { user: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'desc' },
    })
  })

  app.patch('/requests/:id', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    const { action, reason } = req.body
    const { id } = req.params

    const request = await req.prisma.request.findUnique({ where: { id } })
    if (!request) return reply.code(404).send({ error: 'Not found' })
    if (request.status !== 'PENDING') {
      return reply.code(400).send({ error: 'Request is not pending' })
    }

    if (action === 'approve') {
      await applyTransition(req.prisma, request, EVENT.APPROVE)
      return req.prisma.request.findUnique({ where: { id } })
    }

    if (action === 'reject') {
      await applyTransition(req.prisma, request, EVENT.REJECT, { reason: reason || null })
      return req.prisma.request.findUnique({ where: { id } })
    }

    return reply.code(400).send({ error: 'action must be approve or reject' })
  })

  app.post('/invites', { onRequest: [app.requireAdmin] }, async (req) => {
    const { expiresAt } = req.body
    const token = crypto.randomBytes(24).toString('hex')
    return req.prisma.invite.create({
      data: { token, createdBy: req.user.id, expiresAt: expiresAt ? new Date(expiresAt) : null },
    })
  })

  app.get('/invites', { onRequest: [app.requireAdmin] }, async (req) => {
    const invites = await req.prisma.invite.findMany({ orderBy: { id: 'desc' } })
    const usedIds = invites.map((i) => i.usedBy).filter(Boolean)
    const users = usedIds.length
      ? await req.prisma.user.findMany({ where: { id: { in: usedIds } }, select: { id: true, username: true } })
      : []
    const userMap = Object.fromEntries(users.map((u) => [u.id, u.username]))
    return invites.map((i) => ({ ...i, usedByUsername: i.usedBy ? userMap[i.usedBy] || null : null }))
  })

  app.delete('/requests/:id', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    const request = await req.prisma.request.findUnique({ where: { id: req.params.id } })
    if (!request) return reply.code(404).send({ error: 'Not found' })
    await req.prisma.request.delete({ where: { id: req.params.id } })
    return reply.code(204).send()
  })

  app.delete('/invites/:id', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    const invite = await req.prisma.invite.findUnique({ where: { id: req.params.id } })
    if (!invite) return reply.code(404).send({ error: 'Not found' })
    await req.prisma.invite.delete({ where: { id: req.params.id } })
    return reply.code(204).send()
  })

  app.delete('/requests', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    await req.prisma.request.deleteMany({})
    return reply.code(204).send()
  })

  app.post('/exploration/run', { onRequest: [app.requireAdmin] }, async (_req, reply) => {
    triggerExploration(app).catch((e) => app.log.error({ err: e.message }, 'Manual exploration failed'))
    return reply.code(202).send({ ok: true })
  })

  app.post('/playlist/rebuild', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    const users = await req.prisma.user.findMany({
      where: { listenbrainzUsername: { not: null } },
      select: { listenbrainzUsername: true },
    })
    reply.code(202).send({ ok: true, users: users.length })
    await app.library.scanLibrary()
    await new Promise((r) => setTimeout(r, 5000))
    const playlistName = app.library.weeklyPlaylistName()
    for (const u of users) {
      const tracks = await app.recommender.weeklyTracks(u.listenbrainzUsername).catch((e) => {
        app.log.warn({ lbUser: u.listenbrainzUsername, err: e.message }, 'Playlist rebuild: LB fetch failed')
        return []
      })
      if (!tracks.length) continue
      const lbTracks = tracks.map((t) => ({ title: t.title, artist: t.mainArtist }))
      await app.library.addTracksToPlaylist(playlistName, lbTracks, { maxRetries: 1 }).catch(
        (e) => app.log.warn({ lbUser: u.listenbrainzUsername, err: e.message }, 'Playlist rebuild failed')
      )
      app.log.info({ lbUser: u.listenbrainzUsername, tracks: lbTracks.length }, 'Playlist rebuild complete')
    }
  })

  app.get('/users', { onRequest: [app.requireAdmin] }, async (req) => {
    return req.prisma.user.findMany({
      select: { id: true, username: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
  })

  app.delete('/users/:id', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    if (req.params.id === req.user.id) {
      return reply.code(400).send({ error: 'Cannot delete yourself' })
    }
    const user = await req.prisma.user.findUnique({ where: { id: req.params.id } })
    if (!user) return reply.code(404).send({ error: 'Not found' })
    await req.prisma.request.deleteMany({ where: { userId: req.params.id } })
    await req.prisma.user.delete({ where: { id: req.params.id } })
    try {
      await app.library.deleteUser(user.username)
    } catch (err) {
      req.log.warn({ err: err.message }, 'Failed to delete Gonic user — cr8 user still removed')
    }
    return reply.code(204).send()
  })
}
