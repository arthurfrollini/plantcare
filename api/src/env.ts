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
