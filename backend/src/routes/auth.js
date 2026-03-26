import bcrypt from 'bcrypt'
import { createNavidromeUser } from '../services/navidrome.js'

export default async function authRoutes(app) {
  // POST /auth/register
  app.post('/register', async (req, reply) => {
    const { username, password, token } = req.body

    if (!username || !password || !token) {
      return reply.code(400).send({ error: 'username, password, and token are required' })
    }

    const invite = await req.prisma.invite.findUnique({ where: { token } })
    if (!invite) return reply.code(400).send({ error: 'Invalid invite token' })
    if (invite.usedAt) return reply.code(400).send({ error: 'Invite token already used' })
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return reply.code(400).send({ error: 'Invite token expired' })
    }

    const existing = await req.prisma.user.findUnique({ where: { username } })
    if (existing) return reply.code(400).send({ error: 'Username already taken' })

    const hashed = await bcrypt.hash(password, 10)
    const user = await req.prisma.user.create({
      data: { username, password: hashed },
    })

    await req.prisma.invite.update({
      where: { token },
      data: { usedBy: user.id, usedAt: new Date() },
    })

    try {
      await createNavidromeUser(username, password)
    } catch (err) {
      app.log.warn({ err: err.message }, 'Failed to create Navidrome user — continuing anyway')
    }

    const jwtToken = app.jwt.sign({ id: user.id, username: user.username, role: user.role })
    return reply.send({ token: jwtToken })
  })

  // POST /auth/login
  app.post('/login', async (req, reply) => {
    const { username, password } = req.body

    if (!username || !password) {
      return reply.code(400).send({ error: 'username and password are required' })
    }

    const user = await req.prisma.user.findUnique({ where: { username } })
    if (!user) return reply.code(401).send({ error: 'Invalid credentials' })

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) return reply.code(401).send({ error: 'Invalid credentials' })

    const token = app.jwt.sign({ id: user.id, username: user.username, role: user.role })
    return reply.send({ token })
  })

  // GET /auth/me
  app.get('/me', { onRequest: [app.authenticate] }, async (req) => {
    return { id: req.user.id, username: req.user.username, role: req.user.role }
  })
}
