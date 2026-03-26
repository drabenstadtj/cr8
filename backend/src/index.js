import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { PrismaClient } from '@prisma/client'
import authRoutes from './routes/auth.js'
import searchRoutes from './routes/search.js'
import requestRoutes from './routes/requests.js'
import adminRoutes from './routes/admin.js'
import { startDownloadWorker } from './workers/downloader.js'

const isDev = process.env.NODE_ENV !== 'production'
const prisma = new PrismaClient()
const app = Fastify({
  logger: isDev ? {
    transport: { target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname' } },
    serializers: {
      req: (req) => `${req.method} ${req.url}`,
      res: (res) => `${res.statusCode}`,
    },
  } : true,
  bodyLimit: 65536, // 64KB max body
})

await app.register(helmet, {
  contentSecurityPolicy: false, // CSP handled by frontend build
})

await app.register(cors, {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
})

await app.register(rateLimit, {
  global: false, // apply per-route only
})

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'changeme') {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production')
  }
  app.log.warn('JWT_SECRET not set — using insecure default (dev only)')
}

await app.register(jwt, {
  secret: process.env.JWT_SECRET || 'changeme',
})

// Attach prisma to every request
app.decorate('prisma', prisma)
app.addHook('onRequest', async (req) => {
  req.prisma = prisma
})

// Auth hook — call req.authenticate() on protected routes
app.decorate('authenticate', async (req, reply) => {
  try {
    await req.jwtVerify()
  } catch {
    reply.code(401).send({ error: 'Unauthorized' })
  }
})

app.decorate('requireAdmin', async (req, reply) => {
  try {
    await req.jwtVerify()
    if (req.user.role !== 'ADMIN') {
      reply.code(403).send({ error: 'Forbidden' })
    }
  } catch {
    reply.code(401).send({ error: 'Unauthorized' })
  }
})

await app.register(authRoutes, { prefix: '/api/auth' })
await app.register(searchRoutes, { prefix: '/api/search' })
await app.register(requestRoutes, { prefix: '/api/requests' })
await app.register(adminRoutes, { prefix: '/api/admin' })

app.get('/api/health', async () => ({ ok: true }))
app.get('/api/config', { onRequest: [app.authenticate] }, async () => ({ navidromeUrl: process.env.NAVIDROME_PUBLIC_URL || process.env.NAVIDROME_URL || null }))

const port = parseInt(process.env.PORT || '3000')
await app.listen({ port, host: '0.0.0.0' })

startDownloadWorker(app)

// Connectivity checks
async function checkSlskd() {
  try {
    const res = await fetch(`${process.env.SLSKD_URL}/api/v0/application`, {
      headers: { 'X-API-Key': process.env.SLSKD_API_KEY },
    })
    if (res.ok) app.log.info('slskd connected')
    else app.log.warn(`slskd reachable but returned ${res.status} — check API key`)
  } catch {
    app.log.warn(`slskd unreachable at ${process.env.SLSKD_URL}`)
  }
}

checkSlskd()

async function checkNavidrome() {
  const base = process.env.NAVIDROME_URL
  if (!base) { app.log.info('Navidrome not configured, skipping library checks'); return }
  try {
    const { checkDuplicateInLibrary } = await import('./services/navidrome.js')
    await checkDuplicateInLibrary('ping', 'ping')
    app.log.info('Navidrome connected')
  } catch {
    app.log.warn(`Navidrome unreachable at ${base}`)
  }
}

checkNavidrome()
