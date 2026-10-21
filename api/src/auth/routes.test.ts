import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetDb } from '../../test/helpers';
import type { PrismaClient } from '../generated/prisma/client';

type AuthBody = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string | null;
    hasPassword: boolean;
    hasGoogle: boolean;
    language: string;
  };
};
type ErrorBody = { error: { code: string; message: string } };

const credentials = {
  name: 'Ana',
  email: 'ana@example.com',
  password: 'correct horse',
};

describe('auth routes', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;

  const post = (url: string, payload: unknown) =>
    app.inject({
      method: 'POST',
      url,
      payload: JSON.stringify(payload),
      headers: { 'content-type': 'application/json' },
    });

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  beforeEach(async () => {
    await resetDb(prisma);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('registers a user and returns tokens', async () => {
    const res = await post('/auth/register', credentials);
    expect(res.statusCode).toBe(201);
    const body = res.json<AuthBody>();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.user).toMatchObject({
      email: 'ana@example.com',
      hasPassword: true,
      hasGoogle: false,
      language: 'en',
    });
  });

  it('stores the language when given', async () => {
    const res = await post('/auth/register', {
      ...credentials,
      language: 'pt-BR',
    });
    expect(res.json<AuthBody>().user.language).toBe('pt-BR');
  });

  it('rejects invalid input with 400', async () => {
    expect(
      (await post('/auth/register', { ...credentials, password: 'short' }))
        .statusCode,
    ).toBe(400);
    expect(
      (await post('/auth/register', { ...credentials, email: 'nope' }))
        .statusCode,
    ).toBe(400);
    expect(
      (await post('/auth/register', { ...credentials, name: '' })).statusCode,
    ).toBe(400);
  });

  it('treats emails as case-insensitive and trimmed', async () => {
    const first = await post('/auth/register', {
      ...credentials,
      email: ' Ana@Example.com ',
    });
    expect(first.statusCode).toBe(201);
    expect(first.json<AuthBody>().user.email).toBe('ana@example.com');

    const login = await post('/auth/login', {
      email: 'ana@example.com',
      password: credentials.password,
    });
    expect(login.statusCode).toBe(200);

    const again = await post('/auth/register', credentials);
    expect(again.statusCode).toBe(409);
    expect(again.json<ErrorBody>().error.code).toBe('email_taken');
  });

  it('gives the same 401 for wrong password and unknown email', async () => {
    await post('/auth/register', credentials);
    const wrongPassword = await post('/auth/login', {
      email: credentials.email,
      password: 'wrong password',
    });
    const unknownEmail = await post('/auth/login', {
      email: 'nobody@example.com',
      password: credentials.password,
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json<ErrorBody>().error.code).toBe(
      'invalid_credentials',
    );
    expect(unknownEmail.json<ErrorBody>()).toEqual(
      wrongPassword.json<ErrorBody>(),
    );
  });

  it('does not log in a Google-only account with a password', async () => {
    await prisma.user.create({
      data: { name: 'G', email: 'g@example.com', googleId: 'g-1' },
    });
    const res = await post('/auth/login', {
      email: 'g@example.com',
      password: 'anything long',
    });
    expect(res.statusCode).toBe(401);
    expect(res.json<ErrorBody>().error.code).toBe('invalid_credentials');
  });

  it('never stores the raw refresh token', async () => {
    const { refreshToken } = (
      await post('/auth/register', credentials)
    ).json<AuthBody>();
    const rows = await prisma.refreshToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).not.toBe(refreshToken);
    expect(rows[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rotates refresh tokens and rejects reuse', async () => {
    const first = (await post('/auth/register', credentials)).json<AuthBody>();
    const res = await post('/auth/refresh', {
      refreshToken: first.refreshToken,
    });
    expect(res.statusCode).toBe(200);
    const second = res.json<AuthBody>();
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.user.id).toBe(first.user.id);

    const reuse = await post('/auth/refresh', {
      refreshToken: first.refreshToken,
    });
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json<ErrorBody>().error.code).toBe('invalid_refresh_token');
    expect(await prisma.refreshToken.count()).toBe(1);
  });

  it('rejects unknown and expired refresh tokens, deleting the expired row', async () => {
    const unknown = await post('/auth/refresh', { refreshToken: 'nope' });
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json<ErrorBody>().error.code).toBe('invalid_refresh_token');

    const { refreshToken } = (
      await post('/auth/register', credentials)
    ).json<AuthBody>();
    await prisma.refreshToken.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await post('/auth/refresh', { refreshToken });
    expect(expired.statusCode).toBe(401);
    expect(expired.json<ErrorBody>().error.code).toBe('invalid_refresh_token');
    expect(await prisma.refreshToken.count()).toBe(0);
  });

  it('logout invalidates the refresh token and is idempotent', async () => {
    const { refreshToken } = (
      await post('/auth/register', credentials)
    ).json<AuthBody>();
    expect((await post('/auth/logout', { refreshToken })).statusCode).toBe(204);
    expect((await post('/auth/logout', { refreshToken })).statusCode).toBe(204);
    expect((await post('/auth/refresh', { refreshToken })).statusCode).toBe(
      401,
    );
  });

  describe('app.authenticate', () => {
    let guarded: FastifyInstance;
    let guardedPrisma: PrismaClient;

    beforeAll(async () => {
      ({ app: guarded, prisma: guardedPrisma } = await createTestApp({
        extraRoutes: (instance) => {
          instance.get(
            '/test/protected',
            { preHandler: instance.authenticate },
            (request) => ({ userId: request.userId }),
          );
        },
      }));
    });
    afterAll(async () => {
      await guarded.close();
      await guardedPrisma.$disconnect();
    });

    const get = (token?: string) =>
      guarded.inject({
        method: 'GET',
        url: '/test/protected',
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });

    it('returns 401 without a token', async () => {
      const res = await get();
      expect(res.statusCode).toBe(401);
      expect(res.json<ErrorBody>().error.code).toBe('unauthorized');
    });

    it('returns 401 with a garbage token', async () => {
      const res = await get('not.a.jwt');
      expect(res.statusCode).toBe(401);
      expect(res.json<ErrorBody>().error.code).toBe('unauthorized');
    });

    it('returns 401 with an expired token', async () => {
      const token = guarded.jwt.sign({ sub: 'u1' }, { expiresIn: '-1s' });
      const res = await get(token);
      expect(res.statusCode).toBe(401);
      expect(res.json<ErrorBody>().error.code).toBe('unauthorized');
    });

    it('returns 200 with a valid token and sets request.userId', async () => {
      const token = guarded.jwt.sign({ sub: 'u1' });
      const res = await get(token);
      expect(res.statusCode).toBe(200);
      expect(res.json<{ userId: string }>().userId).toBe('u1');
    });
  });

  it('rate limits logins to 10 per minute per IP by default', async () => {
    const limited = await createTestApp({ authRateLimitMax: 10 });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 11; i += 1) {
        const res = await limited.app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { email: 'x@example.com', password: 'whatever long' },
        });
        statuses.push(res.statusCode);
        if (i === 10)
          expect(res.json<ErrorBody>().error.code).toBe('rate_limited');
      }
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses[10]).toBe(429);
    } finally {
      await limited.app.close();
    }
  });
});
