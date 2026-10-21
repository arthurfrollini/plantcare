import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetDb } from '../../test/helpers';
import type { PrismaClient } from '../generated/prisma/client';

type UserBody = { id: string; name: string; language: string };
type ErrorBody = { error: { code: string; message: string } };

describe('me routes', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let token: string;
  let userId: string;

  const send = (method: 'GET' | 'PATCH', payload?: unknown, auth = token) =>
    app.inject({
      method,
      url: '/me',
      headers: {
        'content-type': 'application/json',
        ...(auth ? { authorization: `Bearer ${auth}` } : {}),
      },
      ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
    });

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  beforeEach(async () => {
    await resetDb(prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: JSON.stringify({
        name: 'Ana',
        email: 'ana@example.com',
        password: 'correct horse',
      }),
      headers: { 'content-type': 'application/json' },
    });
    const body = res.json<{ accessToken: string; user: UserBody }>();
    token = body.accessToken;
    userId = body.user.id;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('returns the signed-in user', async () => {
    const res = await send('GET');
    expect(res.statusCode).toBe(200);
    expect(res.json<UserBody>()).toMatchObject({
      id: userId,
      name: 'Ana',
      language: 'en',
    });
  });

  it('persists a language change', async () => {
    const patch = await send('PATCH', { language: 'pt-BR' });
    expect(patch.statusCode).toBe(200);
    expect(patch.json<UserBody>().language).toBe('pt-BR');
    expect((await send('GET')).json<UserBody>().language).toBe('pt-BR');
  });

  it('trims and persists a name change', async () => {
    const patch = await send('PATCH', { name: '  Ana Maria ' });
    expect(patch.json<UserBody>().name).toBe('Ana Maria');
  });

  it('rejects a blank name', async () => {
    const res = await send('PATCH', { name: '   ' });
    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().error.code).toBe('validation_error');
  });

  it('rejects an unsupported language', async () => {
    const res = await send('PATCH', { language: 'es' });
    expect(res.statusCode).toBe(400);
  });

  it('requires a token', async () => {
    for (const method of ['GET', 'PATCH'] as const) {
      const res = await send(method, method === 'PATCH' ? {} : undefined, '');
      expect(res.statusCode).toBe(401);
      expect(res.json<ErrorBody>().error.code).toBe('unauthorized');
    }
  });

  it('answers 401 when the user no longer exists', async () => {
    await prisma.user.delete({ where: { id: userId } });
    for (const method of ['GET', 'PATCH'] as const) {
      const res = await send(
        method,
        method === 'PATCH' ? { name: 'Bia' } : undefined,
      );
      expect(res.statusCode).toBe(401);
      expect(res.json<ErrorBody>().error.code).toBe('unauthorized');
    }
  });
});
