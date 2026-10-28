import type { AiStatus } from '@plantcare/shared';
import { env } from '../env';
import { AppError } from '../errors';
import type { PrismaClient } from '../generated/prisma/client';
import { costUsd, type AiUsageTokens } from './cost';

export type AiKind = 'identify' | 'checkup';

/** Model calls each user may make per UTC day. A catalog hit doesn't count. */
export const DAILY_LIMITS: Record<AiKind, number> = {
  identify: 10,
  checkup: 5,
};

export type AiConfig = { enabled: boolean; dailySpendLimitUsd: number };

export function aiConfigFromEnv(): AiConfig {
  return {
    enabled: env.ANTHROPIC_API_KEY !== undefined,
    dailySpendLimitUsd: env.AI_DAILY_SPEND_LIMIT_USD,
  };
}

function utcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

async function spentToday(prisma: PrismaClient, day: Date): Promise<number> {
  const total = await prisma.aiUsage.aggregate({
    where: { day },
    _sum: { costUsd: true },
  });
  return total._sum.costUsd?.toNumber() ?? 0;
}

async function usedToday(
  prisma: PrismaClient,
  userId: string,
  day: Date,
): Promise<Record<AiKind, number>> {
  const rows = await prisma.aiUsage.findMany({ where: { userId, day } });
  const used: Record<AiKind, number> = { identify: 0, checkup: 0 };
  for (const row of rows) {
    if (row.kind === 'identify' || row.kind === 'checkup')
      used[row.kind] = row.count;
  }
  return used;
}

async function isOn(
  prisma: PrismaClient,
  config: AiConfig,
  day: Date,
): Promise<boolean> {
  if (!config.enabled || config.dailySpendLimitUsd <= 0) return false;
  return (await spentToday(prisma, day)) < config.dailySpendLimitUsd;
}

export async function aiStatus(
  prisma: PrismaClient,
  userId: string,
  config: AiConfig,
  now: Date = new Date(),
): Promise<AiStatus> {
  const day = utcDay(now);
  const used = await usedToday(prisma, userId, day);
  return {
    enabled: await isOn(prisma, config, day),
    identifyLeft: Math.max(0, DAILY_LIMITS.identify - used.identify),
    checkupLeft: Math.max(0, DAILY_LIMITS.checkup - used.checkup),
  };
}

/** Throws 503 ai_off or 429 ai_daily_limit when this call can't go to the model. */
export async function assertAiAllowed(
  prisma: PrismaClient,
  userId: string,
  kind: AiKind,
  config: AiConfig,
  now: Date = new Date(),
): Promise<void> {
  const day = utcDay(now);
  if (!(await isOn(prisma, config, day))) {
    throw new AppError(503, 'ai_off', 'The AI is unavailable right now');
  }
  const used = await usedToday(prisma, userId, day);
  if (used[kind] >= DAILY_LIMITS[kind]) {
    throw new AppError(429, 'ai_daily_limit', 'Daily AI limit reached');
  }
}

export async function recordAiUsage(
  prisma: PrismaClient,
  userId: string,
  kind: AiKind,
  usage: AiUsageTokens,
  now: Date = new Date(),
): Promise<void> {
  const day = utcDay(now);
  const cost = costUsd(usage);
  await prisma.aiUsage.upsert({
    where: { userId_day_kind: { userId, day, kind } },
    create: { userId, day, kind, count: 1, costUsd: cost },
    update: { count: { increment: 1 }, costUsd: { increment: cost } },
  });
}
