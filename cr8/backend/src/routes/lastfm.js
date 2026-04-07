import { getLastFmStatus, linkLastFm, unlinkLastFm } from '../services/gonic.js'

export default async function lastfmRoutes(app) {
  // GET /lastfm/status — returns { linked, apiKey }
  app.get('/status', { onRequest: [app.authenticate] }, async (req, reply) => {
    try {
      const status = await getLastFmStatus(req.user.username)
      return status
    } catch (err) {
      return reply.code(502).send({ error: err.message })
    }
  })

  // POST /lastfm/link — exchanges Last.fm token and stores session key in gonic
  app.post('/link', { onRequest: [app.authenticate] }, async (req, reply) => {
    const { token } = req.body || {}
    if (!token) return reply.code(400).send({ error: 'token is required' })
    try {
      await linkLastFm(req.user.username, token)
      return reply.code(204).send()
    } catch (err) {
      return reply.code(502).send({ error: err.message })
    }
  })

  // DELETE /lastfm/link — clears Last.fm session key in gonic
  app.delete('/link', { onRequest: [app.authenticate] }, async (req, reply) => {
    try {
      await unlinkLastFm(req.user.username)
      return reply.code(204).send()
    } catch (err) {
      return reply.code(502).send({ error: err.message })
    }
  })
}
