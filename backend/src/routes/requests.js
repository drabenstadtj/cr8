import { checkDuplicateInLibrary, findNavidromeUrl } from '../services/navidrome.js'

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
    const { mbid, title, artist, album, type = 'TRACK', coverArt } = req.body

    if (!mbid || !title || !artist) {
      return reply.code(400).send({ error: 'mbid, title, and artist are required' })
    }

    if (!/^[0-9a-f-]{36}$/.test(mbid)) return reply.code(400).send({ error: 'Invalid mbid' })
    if (title.length > 500) return reply.code(400).send({ error: 'title too long' })
    if (artist.length > 500) return reply.code(400).send({ error: 'artist too long' })
    if (album && album.length > 500) return reply.code(400).send({ error: 'album too long' })
    if (!['TRACK', 'ALBUM'].includes(type)) return reply.code(400).send({ error: 'type must be TRACK or ALBUM' })

    // Only allow http/https URLs for coverArt, and only from trusted domains
    const safeCoverArt = coverArt && /^https?:\/\/coverartarchive\.org\//.test(coverArt) ? coverArt : null

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
    let request
    try {
      request = await req.prisma.request.create({
        data: { mbid, title, artist, album, type, coverArt: safeCoverArt, userId: req.user.id, status },
      })
    } catch (err) {
      if (err.code === 'P2003') {
        return reply.code(401).send({ error: 'Session invalid — please log in again' })
      }
      throw err
    }

    return reply.code(201).send(request)
  })

  // GET /requests/activity — recent requests across all users (limited fields)
  app.get('/activity', { onRequest: [app.authenticate] }, async (req) => {
    return req.prisma.request.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, title: true, artist: true, album: true, type: true, status: true, createdAt: true, coverArt: true },
    })
  })

  // GET /requests/stats — counts by status
  app.get('/stats', { onRequest: [app.authenticate] }, async (req) => {
    const rows = await req.prisma.request.groupBy({
      by: ['status'],
      _count: { status: true },
    })
    return Object.fromEntries(rows.map((r) => [r.status, r._count.status]))
  })

  // GET /requests/:id/listen — resolve Navidrome deep link
  app.get('/:id/listen', { onRequest: [app.authenticate] }, async (req, reply) => {
    const request = await req.prisma.request.findUnique({ where: { id: req.params.id } })
    if (!request) return reply.code(404).send({ error: 'Not found' })
    const url = await findNavidromeUrl(request.title, request.artist, request.type)
    return { url }
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
