function checkExploApiKey(req, reply) {
  const apiKey = process.env.EXPLO_API_KEY
  if (!apiKey) return reply.code(503).send({ error: 'EXPLO_API_KEY not configured' })
  const auth = req.headers['authorization'] || ''
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (provided !== apiKey) return reply.code(401).send({ error: 'Unauthorized' })
  return null
}

export default async function explorationRoutes(app) {
  app.post('/betanin-import', async (req, reply) => {
    const denied = checkExploApiKey(req, reply)
    if (denied !== null) return

    const { name } = req.body || {}
    if (!name || typeof name !== 'string') {
      return reply.code(400).send({ error: 'name required' })
    }

    await app.importer.importDownload(name).catch((e) =>
      req.log.warn({ err: e.message }, 'betanin import failed')
    )
    return reply.code(204).send()
  })

  app.get('/users', async (req, reply) => {
    const denied = checkExploApiKey(req, reply)
    if (denied !== null) return

    return req.prisma.user.findMany({
      where: { listenbrainzUsername: { not: null } },
      select: { listenbrainzUsername: true },
    })
  })
}
