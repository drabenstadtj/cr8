import { triggerBetaninImport } from '../services/betanin.js'

function checkExploApiKey(req, reply) {
  const apiKey = process.env.EXPLO_API_KEY
  if (!apiKey) return reply.code(503).send({ error: 'EXPLO_API_KEY not configured' })
  const auth = req.headers['authorization'] || ''
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (provided !== apiKey) return reply.code(401).send({ error: 'Unauthorized' })
  return null
}

export default async function explorationRoutes(app) {
  // POST /exploration/betanin-import — called by Explo when a download completes
  app.post('/betanin-import', async (req, reply) => {
    const denied = checkExploApiKey(req, reply)
    if (denied !== null) return

    const { name } = req.body || {}
    if (!name || typeof name !== 'string') {
      return reply.code(400).send({ error: 'name required' })
    }

    await triggerBetaninImport(name).catch((e) =>
      req.log.warn({ err: e.message }, 'betanin import failed')
    )
    return reply.code(204).send()
  })

  // GET /exploration/users — returns LB usernames for all users who have set one.
  // Protected by a static API key so Explo can call it without a user JWT.
  app.get('/users', async (req, reply) => {
    const denied = checkExploApiKey(req, reply)
    if (denied !== null) return

    const users = await req.prisma.user.findMany({
      where: { listenbrainzUsername: { not: null } },
      select: { listenbrainzUsername: true },
    })
    return users
  })
}
