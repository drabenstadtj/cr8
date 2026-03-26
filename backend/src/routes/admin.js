import crypto from 'crypto'

export default async function adminRoutes(app) {
  // GET /admin/requests — all requests
  app.get('/requests', { onRequest: [app.requireAdmin] }, async (req) => {
    return req.prisma.request.findMany({
      include: { user: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'desc' },
    })
  })

  // PATCH /admin/requests/:id — approve or reject
  app.patch('/requests/:id', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    const { action, reason } = req.body // action: 'approve' | 'reject'
    const { id } = req.params

    const request = await req.prisma.request.findUnique({ where: { id } })
    if (!request) return reply.code(404).send({ error: 'Not found' })
    if (request.status !== 'PENDING') {
      return reply.code(400).send({ error: 'Request is not pending' })
    }

    if (action === 'approve') {
      const updated = await req.prisma.request.update({
        where: { id },
        data: { status: 'APPROVED' },
      })
      return updated
    }

    if (action === 'reject') {
      const updated = await req.prisma.request.update({
        where: { id },
        data: { status: 'REJECTED', rejectedReason: reason || null },
      })
      return updated
    }

    return reply.code(400).send({ error: 'action must be approve or reject' })
  })

  // POST /admin/invites — generate an invite token
  app.post('/invites', { onRequest: [app.requireAdmin] }, async (req) => {
    const { expiresAt } = req.body // optional ISO date string

    const token = crypto.randomBytes(24).toString('hex')
    const invite = await req.prisma.invite.create({
      data: {
        token,
        createdBy: req.user.id,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    })

    return invite
  })

  // GET /admin/invites
  app.get('/invites', { onRequest: [app.requireAdmin] }, async (req) => {
    return req.prisma.invite.findMany({ orderBy: { id: 'desc' } })
  })

  // DELETE /admin/requests/:id
  app.delete('/requests/:id', { onRequest: [app.requireAdmin] }, async (req, reply) => {
    const { id } = req.params
    const request = await req.prisma.request.findUnique({ where: { id } })
    if (!request) return reply.code(404).send({ error: 'Not found' })
    await req.prisma.request.delete({ where: { id } })
    return reply.code(204).send()
  })

  // GET /admin/users
  app.get('/users', { onRequest: [app.requireAdmin] }, async (req) => {
    return req.prisma.user.findMany({
      select: { id: true, username: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
  })
}
