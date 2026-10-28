import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { CheckupAdvice } from '@plantcare/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seed } from '../../prisma/seed';
import { createTestApp, resetDb } from '../../test/helpers';
import { JPEG, multipart } from '../../test/multipart';
import type { PrismaClient } from '../generated/prisma/client';
import { createDiskStorage } from '../storage';
import { createFakePlantAi } from './plant-ai';
import type { AiConfig } from './usage';

const advice: CheckupAdvice = {
  isPlant: true,
  matchesSpecies: true,
  problem: 'Água demais.',
  steps: ['Deixe a terra secar.', 'Esvazie o pratinho.'],
  whenToWorry: 'Se os caules ficarem moles.',
};
const on: AiConfig = { enabled: true, dailySpendLimitUsd: 0.5 };

type Fake = ReturnType<typeof createFakePlantAi>;

describe('AI check-ups', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let dir: string;
  let ai: Fake;
  let token: string;
  let plantId: string;

  async function register(email: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { name: 'Ana', email, password: 'correct horse' },
    });
    return res.json<{ accessToken: string }>().accessToken;
  }

  async function start(checkup: CheckupAdvice[], config: AiConfig = on) {
    if (app) await app.close();
    ai = createFakePlantAi({ checkup });
    ({ app, prisma } = await createTestApp({
      plantAi: ai,
      aiConfig: config,
      photoStorage: createDiskStorage(dir),
    }));
    await resetDb(prisma);
    await seed(prisma);
    token = await register('ana@example.com');
    const zz = await prisma.plant.findUniqueOrThrow({
      where: { scientificName: 'Zamioculcas zamiifolia' },
    });
    const created = await app.inject({
      method: 'POST',
      url: '/me/plants',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        catalogPlantId: zz.id,
        reminderTime: '08:00',
        timeZone: 'America/Sao_Paulo',
        wateringDays: [1],
      },
    });
    plantId = created.json<{ id: string }>().id;
  }

  const ask = (
    fields: Record<string, string>,
    photo: Buffer | null = JPEG,
    as = token,
  ) => {
    const body = multipart(fields, photo ? { data: photo } : undefined);
    return app.inject({
      method: 'POST',
      url: `/me/plants/${plantId}/checkups`,
      headers: {
        authorization: `Bearer ${as}`,
        'accept-language': 'pt-BR',
        'content-type': body.contentType,
      },
      payload: body.payload,
    });
  };

  const list = () =>
    app.inject({
      method: 'GET',
      url: `/me/plants/${plantId}/checkups`,
      headers: { authorization: `Bearer ${token}` },
    });

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'plantcare-checkups-'));
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it('requires a photo and takes an optional description', async () => {
    await start([advice, advice]);
    expect((await ask({}, null)).statusCode).toBe(400);

    const withoutText = await ask({});
    expect(withoutText.statusCode).toBe(201);
    expect(withoutText.json()).toMatchObject({
      description: null,
      status: 'open',
    });

    const withText = await ask({ description: 'folhas amarelas' });
    expect(withText.json()).toMatchObject({
      description: 'folhas amarelas',
      problem: 'Água demais.',
    });
    const call = ai.calls.at(-1);
    expect(call).toMatchObject({
      description: 'folhas amarelas',
      locale: 'pt-BR',
    });
    expect(call && 'species' in call ? call.species : '').toContain(
      'Zamioculcas zamiifolia',
    );
  });

  it('refuses a photo with no plant, or of another species, and keeps nothing', async () => {
    await start([
      { ...advice, isPlant: false },
      { ...advice, matchesSpecies: false },
    ]);
    expect((await ask({})).json()).toMatchObject({
      error: { code: 'not_a_plant' },
    });
    expect((await ask({})).json()).toMatchObject({
      error: { code: 'species_mismatch' },
    });
    expect(await prisma.checkup.count()).toBe(0);
  });

  it('replaces harmful advice with safe advice, and never stores the harmful text', async () => {
    await start([{ ...advice, steps: ['Coloque sal na terra.'] }]);
    const res = await ask({});
    expect(res.statusCode).toBe(201);
    const stored = await prisma.checkup.findFirstOrThrow();
    expect(JSON.stringify(stored)).not.toMatch(/\bsal\b/i);
    expect(JSON.stringify(res.json())).not.toMatch(/\bsal\b/i);
  });

  it('keeps the open check-up on the plant until it is marked healed', async () => {
    await start([advice, advice]);
    const first = (await ask({})).json<{ id: string }>();
    const second = (await ask({})).json<{ id: string }>();

    const plant = await app.inject({
      method: 'GET',
      url: '/me/plants',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(
      plant.json<{ openCheckup: { id: string } | null }[]>()[0]?.openCheckup
        ?.id,
    ).toBe(second.id);
    expect((await list()).json<{ id: string }[]>().map((c) => c.id)).toEqual([
      second.id,
      first.id,
    ]);

    const healed = await app.inject({
      method: 'PATCH',
      url: `/me/plants/${plantId}/checkups/${second.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: 'healed' },
    });
    const body = healed.json<{ status: string; healedAt: string | null }>();
    expect(body.status).toBe('healed');
    expect(body.healedAt).not.toBeNull();
  });

  it('serves the check-up photo to its owner only', async () => {
    await start([advice]);
    const { id, photoUrl } = (await ask({})).json<{
      id: string;
      photoUrl: string;
    }>();
    expect(photoUrl).toBe(`/me/plants/${plantId}/checkups/${id}/photo`);
    const photo = await app.inject({
      method: 'GET',
      url: photoUrl,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(photo.statusCode).toBe(200);
    expect(photo.rawPayload).toEqual(JPEG);

    const other = await register('bia@example.com');
    expect(
      (
        await app.inject({
          method: 'GET',
          url: photoUrl,
          headers: { authorization: `Bearer ${other}` },
        })
      ).statusCode,
    ).toBe(404);
    expect((await ask({}, JPEG, other)).statusCode).toBe(404);
  });

  it('refuses when the daily limit is reached, and when the AI is off', async () => {
    await start(Array.from({ length: 5 }, () => advice));
    for (let i = 0; i < 5; i++) expect((await ask({})).statusCode).toBe(201);
    expect((await ask({})).json()).toMatchObject({
      error: { code: 'ai_daily_limit' },
    });

    await start([], { enabled: true, dailySpendLimitUsd: 0 });
    expect((await ask({})).statusCode).toBe(503);
  });
});
