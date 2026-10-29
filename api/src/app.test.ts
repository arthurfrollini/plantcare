import type { FastifyInstance } from 'fastify';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { createTestApp } from '../test/helpers';
import { AiAnswerError } from './ai/anthropic-plant-ai';
import type { PrismaClient } from './generated/prisma/client';

type ErrorBody = { error: { code: string; message: string } };

const aiFailure = new Error(
  '400 output_config.format.schema: oneOf is not supported',
);
const logged: MockInstance[] = [];

describe('error handler', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({
      extraRoutes: (instance) => {
        instance.get('/boom', () => {
          throw new Error('secret database detail');
        });
        instance.post('/echo', (request) => ({ ok: request.body }));
        instance.get('/ai-boom', (request) => {
          logged.push(vi.spyOn(request.log, 'error'));
          throw new AiAnswerError(null, aiFailure);
        });
      },
    }));
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('answers 500 internal_error without leaking the thrown message', async () => {
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json<ErrorBody>().error).toEqual({
      code: 'internal_error',
      message: 'Internal server error',
    });
    expect(res.body).not.toContain('secret database detail');
  });

  it('names the first invalid field in the validation message', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/me/plants',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${app.jwt.sign({ sub: 'someone' })}`,
      },
      payload: JSON.stringify({
        catalogPlantId: 'x',
        reminderTime: '25:00',
        timeZone: 'UTC',
      }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().error).toEqual({
      code: 'validation_error',
      message: 'Invalid request: body.reminderTime',
    });
  });

  it('names a bad query parameter too', async () => {
    const res = await app.inject({ method: 'GET', url: '/plants?page=0' });
    expect(res.json<ErrorBody>().error.message).toBe(
      'Invalid request: querystring.page',
    );
  });

  it('maps 413 to payload_too_large', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ blob: 'x'.repeat(2 * 1024 * 1024) }),
    });
    expect(res.statusCode).toBe(413);
    expect(res.json<ErrorBody>().error.code).toBe('payload_too_large');
  });

  it('maps 415 to unsupported_media_type', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/x-unknown' },
      payload: 'hello',
    });
    expect(res.statusCode).toBe(415);
    expect(res.json<ErrorBody>().error.code).toBe('unsupported_media_type');
  });

  it('keeps bad_request for other client errors', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().error.code).toBe('bad_request');
  });
  it('logs why the AI failed, while the client only sees ai_unavailable', async () => {
    const res = await app.inject({ method: 'GET', url: '/ai-boom' });

    expect(res.statusCode).toBe(502);
    expect(res.json<ErrorBody>().error.code).toBe('ai_unavailable');
    expect(JSON.stringify(logged[0]?.mock.calls)).toContain(
      'oneOf is not supported',
    );
  });
});

describe('CORS', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('allows PATCH and DELETE in the preflight response', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/me/plants/x',
      headers: {
        origin: 'http://localhost:8081',
        'access-control-request-method': 'PATCH',
      },
    });
    const methods = String(res.headers['access-control-allow-methods']);
    expect(methods).toContain('PATCH');
    expect(methods).toContain('DELETE');
  });
});
