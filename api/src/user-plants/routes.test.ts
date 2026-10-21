import type { UserPlant } from '@plantcare/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seed } from '../../prisma/seed';
import { createTestApp, resetDb } from '../../test/helpers';
import type { PrismaClient } from '../generated/prisma/client';

type ErrorBody = { error: { code: string; message: string } };

describe('user plants routes', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tokenA: string;
  let tokenB: string;
  let catalogId: string;
  let catalogEn: string;
  let catalogPt: string;

  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    token: string,
    payload?: unknown,
    language?: string,
  ) =>
    app.inject({
      method,
      url,
      headers: {
        ...(payload === undefined
          ? {}
          : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(language ? { 'accept-language': language } : {}),
      },
      ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
    });

  const register = async (name: string, email: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: JSON.stringify({ name, email, password: 'correct horse' }),
      headers: { 'content-type': 'application/json' },
    });
    return res.json<{ accessToken: string }>().accessToken;
  };

  const valid = () => ({
    catalogPlantId: catalogId,
    reminderTime: '08:30',
    timeZone: 'America/Sao_Paulo',
  });

  const create = async (token: string, extra: object = {}) => {
    const res = await call('POST', '/me/plants', token, {
      ...valid(),
      ...extra,
    });
    expect(res.statusCode).toBe(201);
    return res.json<UserPlant>();
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  beforeEach(async () => {
    await resetDb(prisma);
    await seed(prisma);
    tokenA = await register('Ana', 'ana@example.com');
    tokenB = await register('Bia', 'bia@example.com');
    const plant = await prisma.plant.findFirstOrThrow({
      include: { translations: true },
      orderBy: { slug: 'asc' },
    });
    catalogId = plant.id;
    catalogEn = plant.translations.find((t) => t.locale === 'en')?.name ?? '';
    catalogPt =
      plant.translations.find((t) => t.locale === 'pt-BR')?.name ?? '';
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('copies frequency and light from the species and localizes the name', async () => {
    const species = await prisma.plant.findUniqueOrThrow({
      where: { id: catalogId },
    });
    const en = await create(tokenA);
    expect(en).toMatchObject({
      catalogPlantId: catalogId,
      nickname: null,
      speciesName: catalogEn,
      frequency: {
        times: species.frequencyTimes,
        per: species.frequencyPer,
      },
      light: species.light,
      reminderTime: '08:30',
      timeZone: 'America/Sao_Paulo',
      hasPhoto: false,
    });
    expect(catalogPt).not.toBe(catalogEn);
    const pt = await call(
      'GET',
      '/me/plants',
      tokenA,
      undefined,
      'pt-BR,pt;q=0.9,en;q=0.8',
    );
    expect(pt.json<UserPlant[]>()[0]?.speciesName).toBe(catalogPt);
  });

  it('keeps the nickname in both locales while the species name follows the locale', async () => {
    const created = await call(
      'POST',
      '/me/plants',
      tokenA,
      { ...valid(), nickname: 'Pikachu' },
      'pt-BR',
    );
    expect(created.statusCode).toBe(201);
    expect(created.json<UserPlant>()).toMatchObject({
      nickname: 'Pikachu',
      speciesName: catalogPt,
    });
    const en = await call('GET', '/me/plants', tokenA);
    expect(en.json<UserPlant[]>()[0]).toMatchObject({
      nickname: 'Pikachu',
      speciesName: catalogEn,
    });
  });

  it('rejects a create without catalogPlantId', async () => {
    const { catalogPlantId: _omit, ...body } = valid();
    const res = await call('POST', '/me/plants', tokenA, body);
    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().error.code).toBe('validation_error');
  });

  it.each([
    ['reminderTime 25:00', { reminderTime: '25:00' }],
    ['reminderTime 9:5', { reminderTime: '9:5' }],
    ['timeZone Mars/Olympus', { timeZone: 'Mars/Olympus' }],
    ['2 times per day', { frequency: { times: 2, per: 'day' } }],
    ['8 times per week', { frequency: { times: 8, per: 'week' } }],
  ])('rejects malformed input: %s', async (_label, extra) => {
    const res = await call('POST', '/me/plants', tokenA, {
      ...valid(),
      ...extra,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().error.code).toBe('validation_error');
    const list = await call('GET', '/me/plants', tokenA);
    expect(list.json<UserPlant[]>()).toEqual([]);
  });

  it('rejects malformed input on update too', async () => {
    const plant = await create(tokenA);
    const res = await call('PATCH', `/me/plants/${plant.id}`, tokenA, {
      reminderTime: '25:00',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().error.code).toBe('validation_error');
  });

  it('rejects an unknown catalogPlantId', async () => {
    const res = await call('POST', '/me/plants', tokenA, {
      ...valid(),
      catalogPlantId: 'nope',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().error.code).toBe('plant_not_found');
  });

  it('updates frequency and clears the nickname with null', async () => {
    const plant = await create(tokenA, { nickname: 'Pikachu' });
    const res = await call('PATCH', `/me/plants/${plant.id}`, tokenA, {
      frequency: { times: 3, per: 'week' },
      nickname: null,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<UserPlant>()).toMatchObject({
      id: plant.id,
      nickname: null,
      frequency: { times: 3, per: 'week' },
      reminderTime: '08:30',
    });
  });

  it('rejects catalogPlantId in a PATCH', async () => {
    const plant = await create(tokenA);
    const res = await call('PATCH', `/me/plants/${plant.id}`, tokenA, {
      catalogPlantId: catalogId,
    });
    expect(res.statusCode).toBe(400);
  });

  it('answers 404 user_plant_not_found for another user, never their data', async () => {
    const plant = await create(tokenA, { nickname: 'Secret' });

    const list = await call('GET', '/me/plants', tokenB);
    expect(list.json<UserPlant[]>()).toEqual([]);

    const patch = await call('PATCH', `/me/plants/${plant.id}`, tokenB, {
      nickname: 'Hacked',
    });
    expect(patch.statusCode).toBe(404);
    expect(patch.json<ErrorBody>().error.code).toBe('user_plant_not_found');

    const del = await call('DELETE', `/me/plants/${plant.id}`, tokenB);
    expect(del.statusCode).toBe(404);
    expect(del.json<ErrorBody>().error.code).toBe('user_plant_not_found');

    const mine = await call('GET', '/me/plants', tokenA);
    expect(mine.json<UserPlant[]>()[0]?.nickname).toBe('Secret');
  });

  it('answers 404 for a missing id', async () => {
    const res = await call('DELETE', '/me/plants/missing', tokenA);
    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorBody>().error.code).toBe('user_plant_not_found');
  });

  it('deletes a plant', async () => {
    const plant = await create(tokenA);
    const del = await call('DELETE', `/me/plants/${plant.id}`, tokenA);
    expect(del.statusCode).toBe(204);
    const list = await call('GET', '/me/plants', tokenA);
    expect(list.json<UserPlant[]>()).toEqual([]);
  });

  it('orders by reminder time of day, then name', async () => {
    await create(tokenA, { nickname: 'Zed', reminderTime: '07:00' });
    await create(tokenA, { nickname: 'Bob', reminderTime: '09:00' });
    await create(tokenA, { nickname: 'Amy', reminderTime: '09:00' });
    const list = await call('GET', '/me/plants', tokenA);
    expect(list.json<UserPlant[]>().map((p) => p.nickname)).toEqual([
      'Zed',
      'Amy',
      'Bob',
    ]);
  });

  it('answers 401 before body validation without a token', async () => {
    for (const [method, url] of [
      ['PATCH', '/me'],
      ['POST', '/me/plants'],
    ] as const) {
      const res = await call(method, url, '', { reminderTime: 'bad' });
      expect(res.statusCode).toBe(401);
      expect(res.json<ErrorBody>().error.code).toBe('unauthorized');
    }
    const bad = await call('POST', '/me/plants', 'garbage', {});
    expect(bad.statusCode).toBe(401);
    expect(bad.json<ErrorBody>().error.code).toBe('unauthorized');
  });
});
