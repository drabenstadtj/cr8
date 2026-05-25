export default async function lastfmRoutes(app) {
  app.get('/status', { onRequest: [app.authenticate] }, async (req, reply) => {
    try {
      return await app.library.lastFmStatus(req.user.username)
    } catch (err) {
      return reply.code(502).send({ error: err.message })
    }
  })

  app.post('/link', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { token } = req.body || {}
    if (!token) return reply.code(400).send({ error: 'token is required' })
    try {
      await app.library.linkLastFm(req.user.username, token)
      return reply.code(204).send()
    } catch (err) {
      return reply.code(502).send({ error: err.message })
    }
  })

  app.delete('/link', { onRequest: [app.authenticate] }, async (req, reply) => {
    try {
      await app.library.unlinkLastFm(req.user.username)
      return reply.code(204).send()
    } catch (err) {
      return reply.code(502).send({ error: err.message })
    }
  })
}
