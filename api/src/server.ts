import './load-env';
import { buildApp } from './app';
import { prisma } from './db';
import { env } from './env';

const app = await buildApp({ logger: true });

async function shutdown(): Promise<void> {
  await app.close();
  await prisma.$disconnect();
}
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

await app.listen({ port: env.PORT, host: '0.0.0.0' });
