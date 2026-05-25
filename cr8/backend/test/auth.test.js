import { describe, it, expect, vi, beforeEach } from 'vitest'
import bcrypt from 'bcrypt'
import { createApp } from '../src/app.js'

// Stub out external service calls made by routes
vi.mock('../src/services/gonic.js', () => ({
  createGonicUser: vi.fn().mockResolvedValue(undefined),
  checkDuplicateInLibrary: vi.fn().mockResolvedValue(false),
  deleteGonicUser: vi.fn().mockResolvedValue(undefined),
}))

const PASSWORD = 'password123'
const HASH = await bcrypt.hash(PASSWORD, 10)

function mockPrisma(overrides = {}) {
  return {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      ...overrides.user,
    },
    invite: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      ...overrides.invite,
    },
    request: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      groupBy: vi.fn(),
      ...overrides.request,
    },
  }
}

async function buildApp(prismaOverrides = {}) {
  return createApp({ prisma: mockPrisma(prismaOverrides) })
}

// ─── health ──────────────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('returns ok without auth', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
  })
})

// ─── login ───────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('returns 400 when fields are missing', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'alice' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 401 for unknown user', async () => {
    const app = await buildApp({ user: { findUnique: vi.fn().mockResolvedValue(null) } })
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'nobody', password: 'password123' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 for wrong password', async () => {
    const app = await buildApp({
      user: { findUnique: vi.fn().mockResolvedValue({ id: 1, username: 'alice', password: HASH, role: 'USER' }) },
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'alice', password: 'wrongpassword' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns JWT on valid credentials', async () => {
    const app = await buildApp({
      user: { findUnique: vi.fn().mockResolvedValue({ id: 1, username: 'alice', password: HASH, role: 'USER' }) },
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'alice', password: PASSWORD },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveProperty('token')
  })
})

// ─── register ────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  it('returns 400 when token is missing', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'alice', password: PASSWORD },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 for invalid invite token', async () => {
    const app = await buildApp({ invite: { findUnique: vi.fn().mockResolvedValue(null) } })
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'alice', password: PASSWORD, token: 'bad-token' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/invite/i)
  })

  it('returns 400 for expired invite', async () => {
    const app = await buildApp({
      invite: {
        findUnique: vi.fn().mockResolvedValue({
          token: 'tok',
          usedAt: null,
          expiresAt: new Date('2000-01-01'),
        }),
      },
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'alice', password: PASSWORD, token: 'tok' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 for already-taken username', async () => {
    const app = await buildApp({
      invite: { findUnique: vi.fn().mockResolvedValue({ token: 'tok', usedAt: null, expiresAt: null }) },
      user: { findUnique: vi.fn().mockResolvedValue({ id: 1 }), create: vi.fn() },
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'alice', password: PASSWORD, token: 'tok' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/taken/i)
  })

  it('returns JWT on successful registration', async () => {
    const createdUser = { id: 42, username: 'alice', role: 'USER' }
    const app = await buildApp({
      invite: {
        findUnique: vi.fn().mockResolvedValue({ token: 'tok', usedAt: null, expiresAt: null }),
        update: vi.fn().mockResolvedValue({}),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(createdUser),
      },
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'alice', password: PASSWORD, token: 'tok' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveProperty('token')
  })
})

// ─── GET /me ─────────────────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  it('returns 401 without token', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' })
    expect(res.statusCode).toBe(401)
  })

  it('returns user profile with valid token', async () => {
    const user = { id: 1, username: 'alice', role: 'USER', listenbrainzUsername: null }
    const app = await buildApp({ user: { findUnique: vi.fn().mockResolvedValue(user) } })

    const token = app.jwt.sign({ id: 1, username: 'alice', role: 'USER' })
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().username).toBe('alice')
  })
})
