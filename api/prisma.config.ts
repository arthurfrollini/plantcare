import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

if (!process.env.DATABASE_URL && existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
