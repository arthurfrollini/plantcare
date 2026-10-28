import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// api/ (next to src/ and dist/), as in load-env.ts.
const apiRoot = fileURLToPath(new URL('..', import.meta.url));

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().min(1).default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  GOOGLE_CLIENT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    ),
  UPLOADS_DIR: z
    .string()
    .min(1)
    .default('uploads')
    .transform((dir) => path.resolve(apiRoot, dir)),
  PORT: z.coerce.number().int().positive().default(3333),
  CORS_ORIGIN: z.string().min(1).default('*'),
  /** Without a key the AI features are off. */
  ANTHROPIC_API_KEY: z
    .string()
    .optional()
    .transform((key) => (key && key.trim() !== '' ? key.trim() : undefined)),
  AI_MODEL: z.string().min(1).default('claude-haiku-5-5'),
  /** Spend ceiling for all users together, per UTC day. 0 turns the AI off. */
  AI_DAILY_SPEND_LIMIT_USD: z.coerce.number().min(0).default(0.5),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${problems}`);
  }
  return result.data;
}

export const env = parseEnv(process.env);
