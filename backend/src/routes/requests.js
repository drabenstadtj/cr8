import { checkDuplicateInLibrary } from '../services/navidrome.js'

export default async function requestRoutes(app) {
  // GET /requests — current user's requests
  app.get('/', { onRequest: [app.authenticate] }, async (req) => {
    return req.prisma.request.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    })
  })

  // POST /requests — submit a new request
  app.post('/', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { mbid, title, artist, album, type = 'TRACK' } = req.body

    if (!mbid || !title || !artist) {
      return reply.code(400).send({ error: 'mbid, title, and artist are required' })
    }

    // Check for duplicate request by MBID
    const existing = await req.prisma.request.findFirst({ where: { mbid } })
    if (existing) {
      return reply.code(409).send({
        error: 'already_requested',
        request: existing,
      })
    }

    // Check if already in Navidrome library
    const inLibrary = await checkDuplicateInLibrary(title, artist)
    if (inLibrary) {
      return reply.code(409).send({ error: 'already_in_library' })
    }

    const status = req.user.role === 'ADMIN' ? 'APPROVED' : 'PENDING'
    const request = await req.prisma.request.create({
      data: { mbid, title, artist, album, type, userId: req.user.id, status },
    })

    return reply.code(201).send(request)
  })

  // GET /requests/:id
  app.get('/:id', { onRequest: [app.authenticate] }, async (req, reply) => {
    const request = await req.prisma.request.findUnique({
      where: { id: req.params.id },
    })

    if (!request) return reply.code(404).send({ error: 'Not found' })
    if (request.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return reply.code(403).send({ error: 'Forbidden' })
    }

    return request
  })
}
