import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Identification } from '@plantcare/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seed } from '../../prisma/seed';
import { createTestApp, resetDb } from '../../test/helpers';
import { JPEG, multipart } from '../../test/multipart';
import type { PrismaClient } from '../generated/prisma/client';
import { createDiskStorage } from '../storage';
import { AiAnswerError } from './anthropic-plant-ai';
import { createFakePlantAi } from './plant-ai';
import type { AiConfig } from './usage';

const monstera: Identification = {
  isPlant: true,
  confidence: 'high',
  scientificName: 'Monstera deliciosa',
  names: { en: 'Swiss cheese plant', 'pt-BR': 'Costela-de-adão' },
  about: { en: 'Big split leaves.', 'pt-BR': 'Folhas grandes e recortadas.' },
  waterTips: {
    en: 'Water when the top dries.',
    'pt-BR': 'Regue quando o topo secar.',
  },
  light: 'partial_shade',
  difficulty: 'easy',
  frequency: { times: 1, per: 'week' },
};
const notAPlant: Identification = { ...monstera, isPlant: false };
const zz: Identification = {
  ...monstera,
  scientificName: 'zamioculcas ZAMIIFOLIA',
};
const schedule = {
  reminderTime: '08:00',
  timeZone: 'America/Sao_Paulo',
  wateringDays: [1],
};
const on: AiConfig = { enabled: true, dailySpendLimitUsd: 0.5 };

type Fake = ReturnType<typeof createFakePlantAi>;

describe('AI identification', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let dir: string;
  let ai: Fake;
  let token: string;

  async function start(
    script: Parameters<typeof createFakePlantAi>[0],
    config: AiConfig = on,
    commonsFetch?: typeof fetch,
  ) {
    if (app) await app.close();
    ai = createFakePlantAi(script);
    ({ app, prisma } = await createTestApp({
      plantAi: ai,
      aiConfig: config,
      photoStorage: createDiskStorage(dir),
      ...(commonsFetch ? { commonsFetch } : {}),
    }));
    await resetDb(prisma);
    await seed(prisma);
    token = await register('ana@example.com');
  }

  async function register(email: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { name: 'Ana', email, password: 'correct horse' },
    });
    return res.json<{ accessToken: string }>().accessToken;
  }

  const byName = (name: string, as = token) =>
    app.inject({
      method: 'POST',
      url: '/ai/identify/name',
      headers: { authorization: `Bearer ${as}`, 'accept-language': 'pt-BR' },
      payload: { name },
    });

  const byPhoto = (data: Buffer = JPEG) => {
    const body = multipart({}, { data });
    return app.inject({
      method: 'POST',
      url: '/ai/identify/photo',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': body.contentType,
      },
      payload: body.payload,
    });
  };

  const add = (proposalId: string, as = token) =>
    app.inject({
      method: 'POST',
      url: `/ai/proposals/${proposalId}/add`,
      headers: { authorization: `Bearer ${as}` },
      payload: schedule,
    });

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'plantcare-ai-'));
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it('answers a name already in the catalog without calling the AI or counting usage', async () => {
    await start({});
    const res = await byName('zamioculca');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      kind: 'catalog',
      plant: { scientificName: 'Zamioculcas zamiifolia' },
    });
    expect(ai.calls).toHaveLength(0);
    expect(await prisma.aiUsage.count()).toBe(0);
  });

  it('asks the AI for an unknown name and returns a proposal', async () => {
    await start({ identify: [monstera] });
    const res = await byName('costela de adao');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      kind: 'proposal',
      proposal: { scientificName: 'Monstera deliciosa' },
    });
    expect(ai.calls).toEqual([{ name: 'costela de adao', locale: 'pt-BR' }]);
    expect(await prisma.aiUsage.count()).toBe(1);
  });

  it('identifies a photo and keeps it with the proposal', async () => {
    await start({ identify: [monstera] });
    const res = await byPhoto();
    expect(res.statusCode).toBe(200);
    const { proposalId } = res.json<{ proposalId: string }>();
    const proposal = await prisma.aiProposal.findUniqueOrThrow({
      where: { id: proposalId },
    });
    expect(proposal.photoKey).toBe(`proposals/${proposalId}.jpg`);
  });

  it('says so when the photo shows no plant, and keeps nothing', async () => {
    await start({ identify: [notAPlant] });
    const res = await byPhoto();
    expect(res.json()).toEqual({ kind: 'none', reason: 'not_a_plant' });
    expect(await prisma.aiProposal.count()).toBe(0);
  });

  it('returns the catalog species when the AI names one already there', async () => {
    await start({ identify: [zz] });
    const res = await byName('planta zz');
    expect(res.json()).toMatchObject({
      kind: 'catalog',
      plant: { scientificName: 'Zamioculcas zamiifolia' },
    });
    expect(await prisma.aiProposal.count()).toBe(0);
  });

  it('adds a new species and the user plant, with the proposal photo', async () => {
    await start({ identify: [monstera] });
    const { proposalId } = (await byPhoto()).json<{ proposalId: string }>();

    const res = await add(proposalId);

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      scientificName: 'Monstera deliciosa',
      hasPhoto: true,
      reminderTime: '08:00',
    });
    const species = await prisma.plant.findUniqueOrThrow({
      where: { scientificName: 'Monstera deliciosa' },
      include: { translations: true, aliases: true },
    });
    expect(species.source).toBe('ai');
    expect(species.translations.map((t) => t.locale).sort()).toEqual([
      'en',
      'pt-BR',
    ]);
    expect(species.aliases.map((a) => a.name).sort()).toEqual([
      'Costela-de-adão',
      'Swiss cheese plant',
    ]);
  });

  it('answers the add before the species photo arrives from Commons', async () => {
    let commonsCalled = false;
    // Commons never answers here; the add must not wait for it.
    const hanging = () => {
      commonsCalled = true;
      return new Promise<Response>(() => {});
    };
    await start({ identify: [monstera] }, on, hanging);
    const { proposalId } = (await byName('costela')).json<{
      proposalId: string;
    }>();

    const res = await add(proposalId);

    expect(res.statusCode).toBe(201);
    expect(commonsCalled).toBe(true);
    const species = await prisma.plant.findUniqueOrThrow({
      where: { scientificName: 'Monstera deliciosa' },
    });
    expect(species.imageKey).toBeNull();
  });

  it('adds a proposal once, even with two taps at the same time', async () => {
    await start({ identify: [monstera] });
    const { proposalId } = (await byName('costela')).json<{
      proposalId: string;
    }>();
    const [first, second] = await Promise.all([
      add(proposalId),
      add(proposalId),
    ]);
    expect([first.statusCode, second.statusCode].sort()).toEqual([201, 409]);
    expect(await prisma.userPlant.count()).toBe(1);
    expect((await add(proposalId)).json()).toMatchObject({
      error: { code: 'proposal_used' },
    });
  });

  it("hides another user's proposal and refuses an expired one", async () => {
    await start({ identify: [monstera, monstera] });
    const { proposalId } = (await byName('costela')).json<{
      proposalId: string;
    }>();
    const other = await register('bia@example.com');
    expect((await add(proposalId, other)).statusCode).toBe(404);

    await prisma.aiProposal.update({
      where: { id: proposalId },
      data: { expiresAt: new Date(0) },
    });
    expect((await add(proposalId)).statusCode).toBe(410);
  });

  it('refuses when the daily limit is reached, and when the AI is off', async () => {
    await start({ identify: Array.from({ length: 10 }, () => monstera) });
    for (let i = 0; i < 10; i++)
      expect((await byName(`planta ${i}`)).statusCode).toBe(200);
    expect((await byName('mais uma')).json()).toMatchObject({
      error: { code: 'ai_daily_limit' },
    });

    await start({}, { enabled: true, dailySpendLimitUsd: 0 });
    expect((await byPhoto()).statusCode).toBe(503);
    // A catalog hit still works with the AI off.
    expect((await byName('zamioculca')).statusCode).toBe(200);
  });

  it('counts a paid answer the AI could not use', async () => {
    await start({
      identify: [
        new AiAnswerError(
          { inputTokens: 1000, outputTokens: 200 },
          new Error('bad'),
        ),
      ],
    });
    expect((await byName('costela')).statusCode).toBe(502);
    const status = await app.inject({
      method: 'GET',
      url: '/ai/status',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(status.json()).toMatchObject({ identifyLeft: 9 });
  });

  it('keeps care text that names something harmful out of the catalog', async () => {
    await start({
      identify: [
        {
          ...monstera,
          waterTips: { en: 'Add a pinch of salt.', 'pt-BR': 'Coloque sal.' },
        },
      ],
    });
    expect((await byName('costela')).json()).toEqual({
      kind: 'none',
      reason: 'unsure',
    });
    expect(await prisma.aiProposal.count()).toBe(0);
  });

  it('clears expired proposals and their photos on the next identification', async () => {
    await start({ identify: [monstera] });
    const user = await prisma.user.findFirstOrThrow();
    const storage = createDiskStorage(dir);
    await storage.save('proposals/old.jpg', JPEG);
    await prisma.aiProposal.create({
      data: {
        userId: user.id,
        payload: {},
        photoKey: 'proposals/old.jpg',
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    await byName('costela');

    expect(await storage.read('proposals/old.jpg')).toBeNull();
    expect(
      await prisma.aiProposal.count({
        where: { expiresAt: { lt: new Date() } },
      }),
    ).toBe(0);
  });

  it('reports the status', async () => {
    await start({ identify: [monstera] });
    await byName('costela');
    const res = await app.inject({
      method: 'GET',
      url: '/ai/status',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.json()).toEqual({
      enabled: true,
      identifyLeft: 9,
      checkupLeft: 5,
    });
  });
});
