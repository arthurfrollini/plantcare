import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Identification } from '@plantcare/shared';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
const commonsSearch: unknown = JSON.parse(
  readFileSync(
    path.join(import.meta.dirname, 'fixtures/commons-zamioculcas.json'),
    'utf8',
  ),
);

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
      speciesPhotoWaitMs: 500,
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

  /** Commons with the fixture search and a real photo for every download. */
  async function commonsWithPhotos() {
    const photo = await sharp({
      create: { width: 1000, height: 1000, channels: 3, background: '#3a7' },
    })
      .jpeg()
      .toBuffer();
    return vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(commonsSearch), { status: 200 }),
      )
      .mockImplementation(() =>
        Promise.resolve(new Response(photo, { status: 200 })),
      );
  }
  const approved = { suitable: true, reason: 'A clear photo of the plant.' };
  const rejected = { suitable: false, reason: 'A coin, not a plant.' };

  it('waits for the species photo, so the new plant comes back with it', async () => {
    await start(
      { identify: [monstera], speciesPhoto: [approved] },
      on,
      await commonsWithPhotos(),
    );
    const { proposalId } = (await byName('costela')).json<{
      proposalId: string;
    }>();

    const res = await add(proposalId);

    expect(res.statusCode).toBe(201);
    const species = await prisma.plant.findUniqueOrThrow({
      where: { scientificName: 'Monstera deliciosa' },
    });
    expect(res.json()).toMatchObject({
      imageUrl: `/plants/${species.id}/image?v=${species.updatedAt.getTime()}`,
    });
  });

  it('has the AI check the photo, and counts its cost but not against the daily limits', async () => {
    await start(
      { identify: [monstera], speciesPhoto: [approved] },
      on,
      await commonsWithPhotos(),
    );
    const { proposalId } = (await byName('costela')).json<{
      proposalId: string;
    }>();

    await add(proposalId);

    expect(ai.calls.at(-1)).toMatchObject({
      scientificName: 'Monstera deliciosa',
    });
    const usage = await prisma.aiUsage.findMany({
      orderBy: { kind: 'asc' },
    });
    expect(usage.map((row) => [row.kind, row.count])).toEqual([
      ['identify', 1],
      ['speciesPhoto', 1],
    ]);
    const status = await app.inject({
      method: 'GET',
      url: '/ai/status',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(status.json()).toMatchObject({ identifyLeft: 9, checkupLeft: 5 });
  });

  it('keeps the placeholder when the AI rejects every candidate photo', async () => {
    await start(
      { identify: [monstera], speciesPhoto: [rejected, rejected, rejected] },
      on,
      await commonsWithPhotos(),
    );
    const { proposalId } = (await byName('costela')).json<{
      proposalId: string;
    }>();

    const res = await add(proposalId);

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ imageUrl: null });
    const species = await prisma.plant.findUniqueOrThrow({
      where: { scientificName: 'Monstera deliciosa' },
    });
    expect(species.imageKey).toBeNull();
  });

  it('answers the add without the species photo when Commons is slow', async () => {
    let commonsCalled = false;
    // Commons never answers here; the add waits only briefly for it.
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

  type Answer = 'fixture' | 'empty' | 'down';

  /** Commons and iNaturalist answering as asked, with a real photo for every download. */
  async function sources(commons: Answer, inat: Answer = 'empty') {
    const photo = await sharp({
      create: { width: 1000, height: 1000, channels: 3, background: '#3a7' },
    })
      .jpeg()
      .toBuffer();
    return vi.fn<typeof fetch>((input) => {
      const url = typeof input === 'string' ? input : '';
      const answer = (kind: Answer, body: unknown, empty: unknown) =>
        Promise.resolve(
          kind === 'down'
            ? new Response('', { status: 503 })
            : new Response(JSON.stringify(kind === 'fixture' ? body : empty), {
                status: 200,
              }),
        );
      if (url.startsWith('https://commons.wikimedia.org/'))
        return answer(commons, commonsSearch, { batchcomplete: '' });
      if (url.startsWith('https://api.inaturalist.org/'))
        return answer(inat, { results: [] }, { results: [] });
      return Promise.resolve(new Response(photo, { status: 200 }));
    });
  }

  const referencePhoto = (proposalId: string, as = token) =>
    app.inject({
      method: 'POST',
      url: `/ai/proposals/${proposalId}/reference-photo`,
      headers: { authorization: `Bearer ${as}` },
    });

  const referenceImage = (proposalId: string, as = token) =>
    app.inject({
      method: 'GET',
      url: `/ai/proposals/${proposalId}/reference-photo/image`,
      headers: { authorization: `Bearer ${as}` },
    });

  async function proposalFor(name = 'costela', as = token): Promise<string> {
    return (await byName(name, as)).json<{ proposalId: string }>().proposalId;
  }

  describe('reference photo', () => {
    it('finds a checked photo with its credit and serves it, counted as a species photo check', async () => {
      await start(
        { identify: [monstera], speciesPhoto: [approved] },
        on,
        await sources('fixture'),
      );
      const proposalId = await proposalFor();

      const res = await referencePhoto(proposalId);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        photo: {
          url: `/ai/proposals/${proposalId}/reference-photo/image`,
          credit: {
            license: 'CC BY-SA 3.0',
            source:
              'https://commons.wikimedia.org/wiki/File:Zamioculcas_zamiifolia_1.jpg',
          },
        },
      });
      const image = await referenceImage(proposalId);
      expect(image.statusCode).toBe(200);
      expect(image.headers['content-type']).toBe('image/webp');
      const meta = await sharp(image.rawPayload).metadata();
      expect([meta.width, meta.height]).toEqual([800, 800]);
      const usage = await prisma.aiUsage.findMany({ orderBy: { kind: 'asc' } });
      expect(usage.map((row) => [row.kind, row.count])).toEqual([
        ['identify', 1],
        ['speciesPhoto', 1],
      ]);
      const status = await app.inject({
        method: 'GET',
        url: '/ai/status',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(status.json()).toMatchObject({ identifyLeft: 9 });
    });

    it('answers again from what it stored, without searching', async () => {
      const fetchImpl = await sources('fixture');
      await start(
        { identify: [monstera], speciesPhoto: [approved] },
        on,
        fetchImpl,
      );
      const proposalId = await proposalFor();
      const first = (await referencePhoto(proposalId)).json<unknown>();
      expect(first).toHaveProperty('photo.url');
      const calls = [ai.calls.length, fetchImpl.mock.calls.length];

      const again = await referencePhoto(proposalId);

      expect(again.json()).toEqual(first);
      expect([ai.calls.length, fetchImpl.mock.calls.length]).toEqual(calls);
    });

    it('searches once when asked twice at the same time', async () => {
      await start(
        { identify: [monstera], speciesPhoto: [approved, approved] },
        on,
        await sources('fixture'),
      );
      const proposalId = await proposalFor();
      const before = ai.calls.length;

      const [a, b] = await Promise.all([
        referencePhoto(proposalId),
        referencePhoto(proposalId),
      ]);

      expect(a.json()).toEqual(b.json());
      expect(ai.calls.length - before).toBe(1);
    });

    it('stores that no photo passed, and does not search again', async () => {
      const fetchImpl = await sources('fixture');
      await start(
        { identify: [monstera], speciesPhoto: [rejected, rejected] },
        on,
        fetchImpl,
      );
      const proposalId = await proposalFor();

      expect((await referencePhoto(proposalId)).json()).toEqual({
        photo: null,
      });
      const calls = fetchImpl.mock.calls.length;
      expect((await referencePhoto(proposalId)).json()).toEqual({
        photo: null,
      });
      expect(fetchImpl.mock.calls.length).toBe(calls);
      expect((await referenceImage(proposalId)).statusCode).toBe(404);
    });

    it('stores nothing when the sources are down, so a later call searches again', async () => {
      const fetchImpl = await sources('down', 'down');
      await start({ identify: [monstera] }, on, fetchImpl);
      const proposalId = await proposalFor();

      expect((await referencePhoto(proposalId)).json()).toEqual({
        photo: null,
      });
      const proposal = await prisma.aiProposal.findUniqueOrThrow({
        where: { id: proposalId },
      });
      expect(proposal.referenceStatus).toBe('none');
      const calls = fetchImpl.mock.calls.length;
      await referencePhoto(proposalId);
      expect(fetchImpl.mock.calls.length).toBeGreaterThan(calls);
    });

    it("hides another user's proposal, and refuses a used or expired one", async () => {
      await start(
        { identify: [monstera, monstera] },
        on,
        await sources('empty'),
      );
      const proposalId = await proposalFor();
      const other = await register('bia@example.com');
      expect((await referencePhoto(proposalId, other)).statusCode).toBe(404);
      expect((await referenceImage(proposalId, other)).statusCode).toBe(404);

      await prisma.aiProposal.update({
        where: { id: proposalId },
        data: { expiresAt: new Date(0) },
      });
      expect((await referencePhoto(proposalId)).statusCode).toBe(410);

      const used = await proposalFor('outra');
      expect((await add(used)).statusCode).toBe(201);
      expect((await referencePhoto(used)).statusCode).toBe(409);
    });

    it('carries the stored photo into the catalog on add, without searching again', async () => {
      const fetchImpl = await sources('fixture');
      await start(
        { identify: [monstera], speciesPhoto: [approved] },
        on,
        fetchImpl,
      );
      const proposalId = await proposalFor();
      await referencePhoto(proposalId);
      const shown = (await referenceImage(proposalId)).rawPayload;
      const calls = [ai.calls.length, fetchImpl.mock.calls.length];

      const res = await add(proposalId);

      expect(res.statusCode).toBe(201);
      expect([ai.calls.length, fetchImpl.mock.calls.length]).toEqual(calls);
      const species = await prisma.plant.findUniqueOrThrow({
        where: { scientificName: 'Monstera deliciosa' },
      });
      expect(species).toMatchObject({
        imageKey: `species/${species.id}.webp`,
        imageLicense: 'CC BY-SA 3.0',
      });
      const storage = createDiskStorage(dir);
      expect(await storage.read(`species/${species.id}.webp`)).toEqual(shown);
      expect(await storage.read(`proposals/${proposalId}-ref.webp`)).toBeNull();
    });

    it('adds without a photo, and without searching, when none passed', async () => {
      const fetchImpl = await sources('fixture');
      await start(
        { identify: [monstera], speciesPhoto: [rejected, rejected] },
        on,
        fetchImpl,
      );
      const proposalId = await proposalFor();
      await referencePhoto(proposalId);
      const calls = fetchImpl.mock.calls.length;

      const res = await add(proposalId);

      expect(res.json()).toMatchObject({ imageUrl: null });
      expect(fetchImpl.mock.calls.length).toBe(calls);
    });

    it("leaves another user's species photo alone and drops the reference", async () => {
      await start(
        { identify: [monstera, monstera], speciesPhoto: [approved, approved] },
        on,
        await sources('fixture'),
      );
      const first = await proposalFor();
      await referencePhoto(first);
      await add(first);
      const species = await prisma.plant.findUniqueOrThrow({
        where: { scientificName: 'Monstera deliciosa' },
      });
      const storage = createDiskStorage(dir);
      const image = await storage.read(`species/${species.id}.webp`);
      // Bia's identification came in before Ana's add, as a proposal of her own.
      const bia = await register('bia@example.com');
      const second = (
        await prisma.aiProposal.create({
          data: {
            userId: (
              await prisma.user.findUniqueOrThrow({
                where: { email: 'bia@example.com' },
              })
            ).id,
            payload: monstera,
            expiresAt: new Date(Date.now() + 60_000),
            referenceStatus: 'found',
            referenceKey: 'proposals/bia-ref.webp',
            referenceAuthor: 'Someone else',
            referenceLicense: 'CC0',
            referenceSource: 'https://example.com/other',
          },
        })
      ).id;
      await storage.save('proposals/bia-ref.webp', Buffer.from('other'));

      expect((await add(second, bia)).statusCode).toBe(201);

      expect(await storage.read(`species/${species.id}.webp`)).toEqual(image);
      expect(
        (await prisma.plant.findUniqueOrThrow({ where: { id: species.id } }))
          .imageAuthor,
      ).not.toBe('Someone else');
      expect(await storage.read('proposals/bia-ref.webp')).toBeNull();
    });

    it('drops the reference photo of an expired proposal on the next identification', async () => {
      await start({ identify: [monstera] }, on, await sources('empty'));
      const user = await prisma.user.findFirstOrThrow();
      const storage = createDiskStorage(dir);
      await storage.save('proposals/old-ref.webp', JPEG);
      await prisma.aiProposal.create({
        data: {
          userId: user.id,
          payload: {},
          referenceStatus: 'found',
          referenceKey: 'proposals/old-ref.webp',
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      await byName('costela');

      expect(await storage.read('proposals/old-ref.webp')).toBeNull();
    });
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
