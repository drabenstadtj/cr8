import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { PrismaClient } from '@prisma/client'
import { createCatalogAdapter } from './adapters/catalog.js'
import { createSoulseekAdapter } from './adapters/soulseek.js'
import { createRecommenderAdapter } from './adapters/recommender.js'
import { createLibraryAdapter } from './adapters/library.js'
import { createImporterAdapter } from './adapters/importer.js'
import authRoutes from './routes/auth.js'
import searchRoutes from './routes/search.js'
import requestRoutes from './routes/requests.js'
import adminRoutes from './routes/admin.js'
import explorationRoutes from './routes/exploration.js'
import lastfmRoutes from './routes/lastfm.js'

const isDev = process.env.NODE_ENV !== 'production'

export async function createApp({
  prisma,
  catalog,
  soulseek,
  recommender,
  library,
  importer,
} = {}) {
  const _prisma = prisma || new PrismaClient()
  const _catalog = catalog || createCatalogAdapter()
  const _soulseek = soulseek || createSoulseekAdapter()
  const _recommender = recommender || createRecommenderAdapter()
  const _library = library || createLibraryAdapter()
  const _importer = importer || createImporterAdapter()

  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : isDev ? {
      transport: { target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname' } },
      serializers: {
        req: (req) => `${req.method} ${req.url}`,
        res: (res) => `${res.statusCode}`,
      },
    } : true,
    bodyLimit: 65536,
  })

  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cors, {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
  await app.register(rateLimit, { global: false })

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'changeme') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be set in production')
    }
  }

  await app.register(jwt, {
    secret: process.env.JWT_SECRET || 'changeme',
  })

  app.decorate('prisma', _prisma)
  app.decorate('catalog', _catalog)
  app.decorate('soulseek', _soulseek)
  app.decorate('recommender', _recommender)
  app.decorate('library', _library)
  app.decorate('importer', _importer)

  app.addHook('onRequest', async (req) => {
    req.prisma = _prisma
  })

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
  await app.register(explorationRoutes, { prefix: '/api/exploration' })
  await app.register(lastfmRoutes, { prefix: '/api/lastfm' })

  app.get('/api/health', async () => ({ ok: true }))
  app.get('/api/config', { onRequest: [app.authenticate] }, async () => ({
    gonicUrl: process.env.GONIC_PUBLIC_URL || process.env.GONIC_URL || null,
  }))

  return app
}
