import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'
import crypto from 'crypto'

const prisma = new PrismaClient()

const username = process.env.ADMIN_USERNAME || 'admin'
const password = process.env.ADMIN_PASSWORD

if (!password) {
  console.error('Set ADMIN_PASSWORD in your .env before running the seed')
  process.exit(1)
}

const existing = await prisma.user.findUnique({ where: { username } })
if (existing) {
  console.log(`User "${username}" already exists, skipping.`)
  process.exit(0)
}

const hashed = await bcrypt.hash(password, 10)
await prisma.user.create({
  data: { username, password: hashed, role: 'ADMIN' },
})

const token = crypto.randomBytes(24).toString('hex')
await prisma.invite.create({
  data: { token, createdBy: username },
})

console.log(`Admin user "${username}" created.`)
console.log(`First invite token: ${token}`)

await prisma.$disconnect()
