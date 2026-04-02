export default async function explorationRoutes(app) {
  // GET /exploration/users — returns LB usernames for all users who have set one.
  // Protected by a static API key so Explo can call it without a user JWT.
  app.get('/users', async (req, reply) => {
    const apiKey = process.env.EXPLO_API_KEY
    if (!apiKey) {
      return reply.code(503).send({ error: 'EXPLO_API_KEY not configured' })
    }
    const auth = req.headers['authorization'] || ''
    const provided = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (provided !== apiKey) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }

    const users = await req.prisma.user.findMany({
      where: { listenbrainzUsername: { not: null } },
      select: { listenbrainzUsername: true },
    })
    return users
  })
}
