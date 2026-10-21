import './load-env';
import { buildApp } from './app';
import { deleteExpiredRefreshTokens } from './auth/tokens';
import { prisma } from './db';
import { env } from './env';

const app = await buildApp({ logger: true });

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

async function cleanupRefreshTokens(): Promise<void> {
  try {
    const removed = await deleteExpiredRefreshTokens(prisma);
    app.log.info({ removed }, 'deleted expired refresh tokens');
  } catch (error) {
    app.log.error(error, 'refresh token cleanup failed');
  }
}
await cleanupRefreshTokens();
const cleanupTimer = setInterval(
  () => void cleanupRefreshTokens(),
  CLEANUP_INTERVAL_MS,
);
cleanupTimer.unref();

async function shutdown(): Promise<void> {
  clearInterval(cleanupTimer);
  await app.close();
  await prisma.$disconnect();
}
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

await app.listen({ port: env.PORT, host: '0.0.0.0' });
