import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import { PrismaClient } from '@prisma/client'
import authRoutes from './routes/auth.js'
import searchRoutes from './routes/search.js'
import requestRoutes from './routes/requests.js'
import adminRoutes from './routes/admin.js'
import { startDownloadWorker } from './workers/downloader.js'

const prisma = new PrismaClient()
const app = Fastify({ logger: true })

await app.register(cors, {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
})

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

await app.register(authRoutes, { prefix: '/auth' })
await app.register(searchRoutes, { prefix: '/search' })
await app.register(requestRoutes, { prefix: '/requests' })
await app.register(adminRoutes, { prefix: '/admin' })

app.get('/health', async () => ({ ok: true }))

const port = parseInt(process.env.PORT || '3000')
await app.listen({ port, host: '0.0.0.0' })

startDownloadWorker(app)
