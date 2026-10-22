import type { FastifyInstance } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createTestApp, resetDb } from '../../test/helpers';
import type { PrismaClient } from '../generated/prisma/client';
import {
  createGoogleVerifier,
  GoogleUnavailableError,
  type GoogleProfile,
  type GoogleVerifier,
} from './google';

type AuthBody = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string | null;
    hasPassword: boolean;
    hasGoogle: boolean;
    language: string;
  };
};
type ErrorBody = { error: { code: string; message: string } };

const profile: GoogleProfile = {
  googleId: 'g-1',
  email: 'ana@example.com',
  emailVerified: true,
  name: 'Ana Google',
};

describe('POST /auth/google', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let current: GoogleProfile;
  const verifier: GoogleVerifier = (idToken) => {
    if (idToken === 'outage') {
      return Promise.reject(new GoogleUnavailableError('certs unreachable'));
    }
    if (idToken !== 'valid') return Promise.reject(new Error('bad token'));
    return Promise.resolve(current);
  };

  const google = (payload: unknown, target: FastifyInstance = app) =>
    target.inject({
      method: 'POST',
      url: '/auth/google',
      payload: JSON.stringify(payload),
      headers: { 'content-type': 'application/json' },
    });

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({
      googleVerifier: verifier,
      googleClientIds: ['client-id'],
    }));
  });
  beforeEach(async () => {
    await resetDb(prisma);
    current = profile;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('creates a new Google user', async () => {
    const res = await google({ idToken: 'valid' });
    expect(res.statusCode).toBe(200);
    const body = res.json<AuthBody>();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.user).toMatchObject({
      name: 'Ana Google',
      email: 'ana@example.com',
      hasGoogle: true,
      hasPassword: false,
      language: 'en',
    });
  });

  it('uses the body name and language for a new user', async () => {
    const res = await google({
      idToken: 'valid',
      name: 'Nome Corpo',
      language: 'pt-BR',
    });
    expect(res.json<AuthBody>().user).toMatchObject({
      name: 'Nome Corpo',
      language: 'pt-BR',
    });
  });

  it('falls back to the email local part when no name is available', async () => {
    current = { ...profile, name: null };
    const res = await google({ idToken: 'valid' });
    expect(res.json<AuthBody>().user.name).toBe('ana');
  });

  it('logs the same Google id into the same user', async () => {
    const first = (await google({ idToken: 'valid' })).json<AuthBody>();
    const second = (await google({ idToken: 'valid' })).json<AuthBody>();
    expect(second.user.id).toBe(first.user.id);
    expect(await prisma.user.count()).toBe(1);
  });

  it('links a verified email to a password user and drops the password', async () => {
    const registered = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        name: 'Ana',
        email: 'ana@example.com',
        password: 'correct horse',
      },
    });
    const before = registered.json<AuthBody>();
    const res = await google({ idToken: 'valid' });
    const body = res.json<AuthBody>();
    expect(body.user.id).toBe(before.user.id);
    expect(body.user).toMatchObject({ hasPassword: false, hasGoogle: true });
    expect(await prisma.user.count()).toBe(1);

    const refresh = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: before.refreshToken },
    });
    expect(refresh.statusCode).toBe(401);
    expect(refresh.json<ErrorBody>().error.code).toBe('invalid_refresh_token');

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'ana@example.com', password: 'correct horse' },
    });
    expect(login.statusCode).toBe(401);
    expect(login.json<ErrorBody>().error.code).toBe('invalid_credentials');
  });

  it('rejects a second Google subject with the same verified email', async () => {
    const existing = await prisma.user.create({
      data: { name: 'Ana', email: 'ana@example.com', googleId: 'G1' },
    });
    current = { ...profile, googleId: 'G2' };
    const res = await google({ idToken: 'valid' });
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().error.code).toBe('google_account_conflict');
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: existing.id },
    });
    expect(row.googleId).toBe('G1');
  });

  it('does not link an unverified matching email', async () => {
    const existing = await prisma.user.create({
      data: { name: 'Ana', email: 'ana@example.com', passwordHash: 'x' },
    });
    current = { ...profile, emailVerified: false };
    const res = await google({ idToken: 'valid' });
    expect(res.statusCode).toBe(200);
    const body = res.json<AuthBody>();
    expect(body.user.id).not.toBe(existing.id);
    expect(body.user).toMatchObject({ hasGoogle: true, hasPassword: false });
    expect(await prisma.user.count()).toBe(2);
  });

  it('creates a new user with email null when the Google email is unverified', async () => {
    current = { ...profile, emailVerified: false };
    const res = await google({ idToken: 'valid' });
    expect(res.statusCode).toBe(200);
    expect(res.json<AuthBody>().user.email).toBeNull();
    const row = await prisma.user.findFirstOrThrow({
      where: { googleId: profile.googleId },
    });
    expect(row.email).toBeNull();
  });

  it('returns 401 invalid_google_token when verification fails', async () => {
    const res = await google({ idToken: 'forged' });
    expect(res.statusCode).toBe(401);
    expect(res.json<ErrorBody>().error.code).toBe('invalid_google_token');
  });

  it('returns 502 google_unavailable when Google cannot be reached', async () => {
    const res = await google({ idToken: 'outage' });
    expect(res.statusCode).toBe(502);
    expect(res.json<ErrorBody>().error.code).toBe('google_unavailable');
  });

  it('returns 400 for a missing idToken', async () => {
    expect((await google({})).statusCode).toBe(400);
  });

  it('returns 503 google_not_configured without client ids', async () => {
    const unconfigured = await createTestApp({
      googleVerifier: verifier,
      googleClientIds: [],
    });
    try {
      const res = await google({ idToken: 'valid' }, unconfigured.app);
      expect(res.statusCode).toBe(503);
      expect(res.json<ErrorBody>().error.code).toBe('google_not_configured');
    } finally {
      await unconfigured.app.close();
    }
  });
});

describe('createGoogleVerifier', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('wraps a certificate fetch failure in GoogleUnavailableError', async () => {
    vi.spyOn(
      OAuth2Client.prototype,
      'getFederatedSignonCertsAsync',
    ).mockRejectedValue(new Error('network down'));
    const verify = createGoogleVerifier(['client-id']);
    await expect(verify('any-token')).rejects.toBeInstanceOf(
      GoogleUnavailableError,
    );
  });
});
