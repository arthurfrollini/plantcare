import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { resetDb } from '../../test/helpers';
import {
  aiStatus,
  assertAiAllowed,
  recordAiUsage,
  type AiConfig,
} from './usage';

const on: AiConfig = { enabled: true, dailySpendLimitUsd: 0.5 };
const noon = new Date('2026-10-28T12:00:00Z');
const nextDay = new Date('2026-10-29T00:30:00Z');
const usage = { inputTokens: 1000, outputTokens: 200 };

describe('AI usage', () => {
  let userId: string;

  beforeEach(async () => {
    await resetDb(prisma);
    userId = (await prisma.user.create({ data: { name: 'Ana' } })).id;
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('allows 10 identifications a day and refuses the 11th until the next UTC day', async () => {
    for (let i = 0; i < 10; i++) {
      await assertAiAllowed(prisma, userId, 'identify', on, noon);
      await recordAiUsage(prisma, userId, 'identify', usage, noon);
    }
    await expect(
      assertAiAllowed(prisma, userId, 'identify', on, noon),
    ).rejects.toMatchObject({
      statusCode: 429,
      code: 'ai_daily_limit',
    });
    await expect(
      assertAiAllowed(prisma, userId, 'identify', on, nextDay),
    ).resolves.toBeUndefined();
  });

  it('counts check-ups apart, with 5 a day', async () => {
    for (let i = 0; i < 5; i++)
      await recordAiUsage(prisma, userId, 'checkup', usage, noon);
    await expect(
      assertAiAllowed(prisma, userId, 'checkup', on, noon),
    ).rejects.toMatchObject({
      code: 'ai_daily_limit',
    });
    await expect(
      assertAiAllowed(prisma, userId, 'identify', on, noon),
    ).resolves.toBeUndefined();
  });

  it("turns the AI off for everyone once today's spend reaches the ceiling", async () => {
    const other = (await prisma.user.create({ data: { name: 'Bia' } })).id;
    await recordAiUsage(
      prisma,
      other,
      'checkup',
      { inputTokens: 5_000_000, outputTokens: 0 },
      noon,
    );
    await expect(
      assertAiAllowed(prisma, userId, 'identify', on, noon),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: 'ai_off',
    });
    await expect(
      assertAiAllowed(prisma, userId, 'identify', on, nextDay),
    ).resolves.toBeUndefined();
  });

  it('is off with a zero ceiling or without a key', async () => {
    for (const config of [
      { enabled: true, dailySpendLimitUsd: 0 },
      { enabled: false, dailySpendLimitUsd: 0.5 },
    ]) {
      await expect(
        assertAiAllowed(prisma, userId, 'identify', config, noon),
      ).rejects.toMatchObject({
        code: 'ai_off',
      });
      expect((await aiStatus(prisma, userId, config, noon)).enabled).toBe(
        false,
      );
    }
  });

  it('reports what is left today', async () => {
    await recordAiUsage(prisma, userId, 'identify', usage, noon);
    await recordAiUsage(prisma, userId, 'checkup', usage, noon);
    expect(await aiStatus(prisma, userId, on, noon)).toEqual({
      enabled: true,
      identifyLeft: 9,
      checkupLeft: 4,
    });
  });
});
