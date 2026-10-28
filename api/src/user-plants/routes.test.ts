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

  it('returns the species frequency, light and difficulty and the default lead', async () => {
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
      difficulty: species.difficulty,
      reminderTime: '08:30',
      reminderLeadMinutes: 15,
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

  it('carries the species photo credit, or null without one', async () => {
    expect((await create(tokenA)).imageCredit).toBeNull();

    await prisma.plant.update({
      where: { id: catalogId },
      data: {
        imageKey: `species/${catalogId}.webp`,
        imageSource: 'https://commons.wikimedia.org/wiki/File:X.jpg',
        imageAuthor: 'Jane Doe',
        imageLicense: 'CC0',
      },
    });
    const list = await call('GET', '/me/plants', tokenA);
    expect(list.json<UserPlant[]>()[0]).toMatchObject({
      imageUrl: `/plants/${catalogId}/image`,
      imageCredit: {
        author: 'Jane Doe',
        license: 'CC0',
        source: 'https://commons.wikimedia.org/wiki/File:X.jpg',
      },
    });
  });

  it('rejects wateringDays of the wrong length', async () => {
    await prisma.plant.update({
      where: { id: catalogId },
      data: { frequencyTimes: 3, frequencyPer: 'week' },
    });
    const res = await call('POST', '/me/plants', tokenA, {
      ...valid(),
      wateringDays: [1, 4],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().error.code).toBe('invalid_watering_days');
    const plant = await create(tokenA);
    const patch = await call('PATCH', `/me/plants/${plant.id}`, tokenA, {
      wateringDays: [1, 4],
    });
    expect(patch.statusCode).toBe(400);
    expect(patch.json<ErrorBody>().error.code).toBe('invalid_watering_days');
  });

  it('saves days, time and lead', async () => {
    await prisma.plant.update({
      where: { id: catalogId },
      data: { frequencyTimes: 2, frequencyPer: 'week' },
    });
    const plant = await create(tokenA, {
      wateringDays: [2, 5],
      reminderLeadMinutes: 30,
    });
    expect(plant).toMatchObject({
      wateringDays: [2, 5],
      reminderLeadMinutes: 30,
      scheduleStartsOn: null,
      scheduleNeedsReview: false,
    });
    const res = await call('PATCH', `/me/plants/${plant.id}`, tokenA, {
      wateringDays: [1, 3],
      reminderTime: '07:30',
      reminderLeadMinutes: 10,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<UserPlant>()).toMatchObject({
      wateringDays: [1, 3],
      reminderTime: '07:30',
      reminderLeadMinutes: 10,
    });
  });

  it('rejects a reminder time off the half hour', async () => {
    const res = await call('POST', '/me/plants', tokenA, {
      ...valid(),
      reminderTime: '08:15',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().error.code).toBe('validation_error');
  });

  /** ISO weekday (1 = Monday) of a YYYY-MM-DD anchor. */
  const anchorWeekday = (date: string | null) => {
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const day = new Date(`${date ?? ''}T00:00:00Z`).getUTCDay();
    return day === 0 ? 7 : day;
  };
  /** Whole days from today (UTC) to a YYYY-MM-DD anchor. */
  const daysAhead = (date: string | null) =>
    Math.round(
      (Date.parse(`${date ?? ''}T00:00:00Z`) -
        Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) /
        86_400_000,
    );

  it('sets scheduleStartsOn for a monthly species on the chosen weekday', async () => {
    await prisma.plant.update({
      where: { id: catalogId },
      data: { frequencyTimes: 1, frequencyPer: 'month' },
    });
    const plant = await create(tokenA, { wateringDays: [3] });
    expect(plant.wateringDays).toEqual([3]);
    expect(anchorWeekday(plant.scheduleStartsOn)).toBe(3);
    expect(daysAhead(plant.scheduleStartsOn)).toBeGreaterThanOrEqual(-1);
    expect(daysAhead(plant.scheduleStartsOn)).toBeLessThanOrEqual(8);

    const patched = await call('PATCH', `/me/plants/${plant.id}`, tokenA, {
      wateringDays: [5],
    });
    const moved = patched.json<UserPlant>().scheduleStartsOn;
    expect(anchorWeekday(moved)).toBe(5);
    expect(daysAhead(moved)).toBeGreaterThanOrEqual(-1);
    expect(daysAhead(moved)).toBeLessThanOrEqual(8);
    const row = await prisma.userPlant.findUniqueOrThrow({
      where: { id: plant.id },
    });
    expect(row.scheduleStartsOn?.toISOString().slice(0, 10)).toBe(moved);
  });

  it('anchors a time-only change on the default day while the days need a review', async () => {
    await prisma.plant.update({
      where: { id: catalogId },
      data: { frequencyTimes: 2, frequencyPer: 'week' },
    });
    const plant = await create(tokenA, { wateringDays: [2, 5] });
    await prisma.plant.update({
      where: { id: catalogId },
      data: { frequencyTimes: 1, frequencyPer: 'month' },
    });

    const timed = await call('PATCH', `/me/plants/${plant.id}`, tokenA, {
      reminderTime: '07:00',
    });
    expect(timed.statusCode).toBe(200);
    expect(timed.json<UserPlant>()).toMatchObject({
      wateringDays: [],
      scheduleNeedsReview: true,
    });
    // The reminders water on the default Monday, so the anchor is a Monday, not the stale Tuesday.
    expect(anchorWeekday(timed.json<UserPlant>().scheduleStartsOn)).toBe(1);

    const picked = await call('PATCH', `/me/plants/${plant.id}`, tokenA, {
      wateringDays: [4],
    });
    expect(picked.json<UserPlant>()).toMatchObject({
      wateringDays: [4],
      scheduleNeedsReview: false,
    });
    expect(anchorWeekday(picked.json<UserPlant>().scheduleStartsOn)).toBe(4);
  });

  it('asks for a review when a date-based plant has no anchor, until a day is picked', async () => {
    await prisma.plant.update({
      where: { id: catalogId },
      data: { frequencyTimes: 1, frequencyPer: 'week' },
    });
    const plant = await create(tokenA, { wateringDays: [3] });
    expect(plant.scheduleStartsOn).toBeNull();
    await prisma.plant.update({
      where: { id: catalogId },
      data: { frequencyTimes: 1, frequencyPer: 'twoWeeks' },
    });

    const list = await call('GET', '/me/plants', tokenA);
    expect(list.json<UserPlant[]>()[0]).toMatchObject({
      wateringDays: [],
      scheduleStartsOn: null,
      scheduleNeedsReview: true,
      frequency: { times: 1, per: 'twoWeeks' },
    });

    const picked = await call('PATCH', `/me/plants/${plant.id}`, tokenA, {
      wateringDays: [3],
    });
    expect(picked.json<UserPlant>()).toMatchObject({
      wateringDays: [3],
      scheduleNeedsReview: false,
    });
    expect(anchorWeekday(picked.json<UserPlant>().scheduleStartsOn)).toBe(3);
  });

  it('flags scheduleNeedsReview when the species frequency changed', async () => {
    await prisma.plant.update({
      where: { id: catalogId },
      data: { frequencyTimes: 2, frequencyPer: 'week' },
    });
    await create(tokenA, { wateringDays: [1, 4] });
    await prisma.plant.update({
      where: { id: catalogId },
      data: { frequencyTimes: 3, frequencyPer: 'week' },
    });
    const list = await call('GET', '/me/plants', tokenA);
    expect(list.json<UserPlant[]>()[0]).toMatchObject({
      wateringDays: [],
      scheduleNeedsReview: true,
      frequency: { times: 3, per: 'week' },
    });
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

  it('rejects an offset time zone and stores a canonical name', async () => {
    const offset = await call('POST', '/me/plants', tokenA, {
      ...valid(),
      timeZone: '+03:00',
    });
    expect(offset.statusCode).toBe(400);
    expect(offset.json<ErrorBody>().error.code).toBe('validation_error');

    const lower = await call('POST', '/me/plants', tokenA, {
      ...valid(),
      timeZone: 'america/sao_paulo',
    });
    expect(lower.statusCode).toBe(201);
    expect(lower.json<UserPlant>().timeZone).toBe('America/Sao_Paulo');
    const row = await prisma.userPlant.findFirstOrThrow();
    expect(row.timeZone).toBe('America/Sao_Paulo');
  });

  it('answers 401 when the token user no longer exists', async () => {
    const user = await prisma.user.findFirstOrThrow({
      where: { email: 'ana@example.com' },
    });
    await prisma.user.delete({ where: { id: user.id } });
    const res = await call('POST', '/me/plants', tokenA, valid());
    expect(res.statusCode).toBe(401);
    expect(res.json<ErrorBody>().error.code).toBe('unauthorized');
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
    ['a frequency key', { frequency: { times: 2, per: 'week' } }],
    ['a light key', { light: 'shade' }],
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

  it('clears the nickname with null', async () => {
    const plant = await create(tokenA, { nickname: 'Pikachu' });
    const res = await call('PATCH', `/me/plants/${plant.id}`, tokenA, {
      nickname: null,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<UserPlant>()).toMatchObject({
      id: plant.id,
      nickname: null,
      reminderTime: '08:30',
    });
  });

  it('rejects frequency and light in a PATCH', async () => {
    const plant = await create(tokenA);
    for (const body of [
      { frequency: { times: 3, per: 'week' } },
      { light: 'shade' },
    ]) {
      const res = await call('PATCH', `/me/plants/${plant.id}`, tokenA, body);
      expect(res.statusCode).toBe(400);
    }
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

  it('orders by reminder time of day, then species name', async () => {
    const species = await prisma.plant.findMany({
      include: { translations: true },
      orderBy: { slug: 'asc' },
      take: 2,
    });
    const named = species
      .map((plant) => ({
        id: plant.id,
        name: plant.translations.find((t) => t.locale === 'en')?.name ?? '',
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'en'));
    const [first, second] = named;
    if (!first || !second) throw new Error('need two species');
    await create(tokenA, {
      catalogPlantId: second.id,
      nickname: 'Aaa',
      reminderTime: '09:00',
    });
    await create(tokenA, {
      catalogPlantId: first.id,
      nickname: 'Zzz',
      reminderTime: '09:00',
    });
    await create(tokenA, {
      catalogPlantId: second.id,
      reminderTime: '07:00',
    });
    const list = await call('GET', '/me/plants', tokenA);
    expect(
      list.json<UserPlant[]>().map((p) => [p.reminderTime, p.speciesName]),
    ).toEqual([
      ['07:00', second.name],
      ['09:00', first.name],
      ['09:00', second.name],
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
