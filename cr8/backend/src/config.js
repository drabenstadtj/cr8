import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  JWT_SECRET: z.string().default('changeme'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),

  // Soulseek / slskd
  SLSKD_URL: z.string().optional(),
  SLSKD_API_KEY: z.string().optional(),

  // Gonic (music library)
  GONIC_URL: z.string().optional(),
  GONIC_PUBLIC_URL: z.string().optional(),
  GONIC_USER: z.string().default(''),
  GONIC_PASSWORD: z.string().default(''),

  // Betanin (beets importer)
  BETANIN_URL: z.string().optional(),
  BETANIN_API_KEY: z.string().optional(),
  DOWNLOAD_DIR: z.string().default('/downloads'),

  // ListenBrainz / exploration
  LB_PLAYLIST: z.string().default('weekly-exploration'),

  // Internal API key for the exploration webhook endpoints
  EXPLO_API_KEY: z.string().optional(),
})

export const config = schema.parse(process.env)
