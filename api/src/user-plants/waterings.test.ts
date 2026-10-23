import type { UserPlant } from '@plantcare/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seed } from '../../prisma/seed';
import { createTestApp, resetDb } from '../../test/helpers';
import type { PrismaClient } from '../generated/prisma/client';
import { todayInZone } from './schedule-start';

type ErrorBody = { error: { code: string; message: string } };

const ZONE = 'Pacific/Kiritimati';

function shift(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

describe('waterings routes', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let tokenA: string;
  let tokenB: string;
  let catalogId: string;
  let plantId: string;
  let today: string;

  const call = (
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    token: string,
    payload?: unknown,
  ) =>
    app.inject({
      method,
      url,
      headers: {
        ...(payload === undefined
          ? {}
          : { 'content-type': 'application/json' }),
        authorization: `Bearer ${token}`,
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

  const water = (date: string, token = tokenA, id = plantId) =>
    call('POST', `/me/plants/${id}/waterings`, token, { wateredOn: date });
  const unwater = (date: string, token = tokenA, id = plantId) =>
    call('DELETE', `/me/plants/${id}/waterings/${date}`, token);

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(prisma);
    await seed(prisma);
    tokenA = await register('Ana', 'ana@example.com');
    tokenB = await register('Bia', 'bia@example.com');
    const species = await prisma.plant.findFirstOrThrow();
    catalogId = species.id;
    const res = await call('POST', '/me/plants', tokenA, {
      catalogPlantId: catalogId,
      reminderTime: '08:30',
      timeZone: ZONE,
    });
    plantId = res.json<UserPlant>().id;
    today = todayInZone(ZONE, new Date());
  });

  it('marks a day, repeating is a no-op 200, one row', async () => {
    const first = await water(today);
    expect(first.statusCode).toBe(201);
    expect(first.json<UserPlant>().lastWateredOn).toBe(today);
    const again = await water(today);
    expect(again.statusCode).toBe(200);
    expect(again.json<UserPlant>().lastWateredOn).toBe(today);
    expect(
      await prisma.watering.count({ where: { userPlantId: plantId } }),
    ).toBe(1);
  });

  it('lastWateredOn is the latest day', async () => {
    await water(shift(today, -1));
    await water(today);
    await unwater(today);
    const res = await call('GET', '/me/plants', tokenA);
    expect(res.json<UserPlant[]>()[0]?.lastWateredOn).toBe(shift(today, -1));
  });

  it('undo clears the day and undoing nothing is a 200', async () => {
    await water(today);
    const undone = await unwater(today);
    expect(undone.statusCode).toBe(200);
    expect(undone.json<UserPlant>().lastWateredOn).toBeNull();
    const again = await unwater(today);
    expect(again.statusCode).toBe(200);
    expect(again.json<UserPlant>().lastWateredOn).toBeNull();
  });

  it('the list carries lastWateredOn', async () => {
    const before = await call('GET', '/me/plants', tokenA);
    expect(before.json<UserPlant[]>()[0]?.lastWateredOn).toBeNull();
    await water(today);
    const after = await call('GET', '/me/plants', tokenA);
    expect(after.json<UserPlant[]>()[0]?.lastWateredOn).toBe(today);
  });

  it("404s for another user's plant on both routes", async () => {
    const post = await water(today, tokenB);
    expect(post.statusCode).toBe(404);
    expect(post.json<ErrorBody>().error.code).toBe('user_plant_not_found');
    const del = await unwater(today, tokenB);
    expect(del.statusCode).toBe(404);
    expect(await prisma.watering.count()).toBe(0);
  });

  it("accepts yesterday and tomorrow in the plant's zone, rejects three days off", async () => {
    expect((await water(shift(today, -1))).statusCode).toBe(201);
    expect((await water(shift(today, 1))).statusCode).toBe(201);
    for (const offset of [-3, 3]) {
      const res = await water(shift(today, offset));
      expect(res.statusCode).toBe(400);
      expect(res.json<ErrorBody>().error.code).toBe('invalid_watering_date');
    }
  });

  it('400s for a malformed date', async () => {
    expect((await unwater('2026-02-30')).statusCode).toBe(400);
    expect((await unwater('nope')).statusCode).toBe(400);
    expect((await water('2026-2-3')).statusCode).toBe(400);
  });

  it('deleting the plant deletes its waterings', async () => {
    await water(today);
    const res = await call('DELETE', `/me/plants/${plantId}`, tokenA);
    expect(res.statusCode).toBe(204);
    expect(await prisma.watering.count()).toBe(0);
  });
});
