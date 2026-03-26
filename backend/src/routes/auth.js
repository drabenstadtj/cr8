import bcrypt from 'bcrypt'
import { createNavidromeUser } from '../services/navidrome.js'

const authRateLimit = {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: '15 minutes',
    },
  },
}

function validatePassword(password) {
  if (!password || password.length < 8) return 'Password must be at least 8 characters'
  if (password.length > 128) return 'Password too long'
  return null
}

function validateUsername(username) {
  if (!username || username.length < 2) return 'Username must be at least 2 characters'
  if (username.length > 32) return 'Username too long'
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) return 'Username may only contain letters, numbers, _ and -'
  return null
}

export default async function authRoutes(app) {
  // POST /auth/register
  app.post('/register', authRateLimit, async (req, reply) => {
    const { username, password, token } = req.body

    if (!username || !password || !token) {
      return reply.code(400).send({ error: 'username, password, and token are required' })
    }

    const usernameErr = validateUsername(username)
    if (usernameErr) return reply.code(400).send({ error: usernameErr })

    const passwordErr = validatePassword(password)
    if (passwordErr) return reply.code(400).send({ error: passwordErr })

    const invite = await req.prisma.invite.findUnique({ where: { token } })
    if (!invite || invite.usedAt || (invite.expiresAt && invite.expiresAt < new Date())) {
      return reply.code(400).send({ error: 'Invalid or expired invite token' })
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

    const jwtToken = app.jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      { expiresIn: '30d' }
    )
    return reply.send({ token: jwtToken })
  })

  // POST /auth/login
  app.post('/login', authRateLimit, async (req, reply) => {
    const { username, password } = req.body

    if (!username || !password) {
      return reply.code(400).send({ error: 'username and password are required' })
    }

    const user = await req.prisma.user.findUnique({ where: { username } })
    // Constant-time comparison even on not-found to prevent user enumeration
    const hash = user?.password || '$2b$10$invalidhashpaddingtomakethisslow000000000000000000000'
    const valid = await bcrypt.compare(password, hash)

    if (!user || !valid) return reply.code(401).send({ error: 'Invalid credentials' })

    const token = app.jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      { expiresIn: '30d' }
    )
    return reply.send({ token })
  })

  // GET /auth/me
  app.get('/me', { onRequest: [app.authenticate] }, async (req) => {
    return { id: req.user.id, username: req.user.username, role: req.user.role }
  })
}
