import type { UserPlant } from '@plantcare/shared';
import type { FastifyInstance } from 'fastify';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seed } from '../../prisma/seed';
import { createTestApp, resetDb } from '../../test/helpers';
import type { PrismaClient } from '../generated/prisma/client';
import { createDiskStorage } from '../storage';

type ErrorBody = { error: { code: string; message: string } };

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('png body'),
]);
const jpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from('jpeg body'),
]);
const webp = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x10, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
]);

describe('plant photo routes', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let dir: string;
  let tokenA: string;
  let tokenB: string;
  let plantId: string;

  const register = async (name: string, email: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: JSON.stringify({ name, email, password: 'correct horse' }),
      headers: { 'content-type': 'application/json' },
    });
    return res.json<{ accessToken: string }>().accessToken;
  };

  const upload = (
    id: string,
    token: string,
    file?: { data: Buffer; filename: string; type: string; field?: string },
    fields: Record<string, string> = {},
  ) => {
    const boundary = '----plantcareboundary';
    const parts: Buffer[] = Object.entries(fields).map(([name, value]) =>
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
    if (file) {
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${file.field ?? 'photo'}"; filename="${file.filename}"\r\nContent-Type: ${file.type}\r\n\r\n`,
        ),
        file.data,
        Buffer.from('\r\n'),
      );
    } else {
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="other"\r\n\r\nvalue\r\n`,
        ),
      );
    }
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    return app.inject({
      method: 'POST',
      url: `/me/plants/${id}/photo`,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: Buffer.concat(parts),
    });
  };

  const download = (id: string, token: string) =>
    app.inject({
      method: 'GET',
      url: `/me/plants/${id}/photo`,
      headers: { authorization: `Bearer ${token}` },
    });

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'plantcare-photos-'));
    ({ app, prisma } = await createTestApp({
      photoStorage: createDiskStorage(dir),
    }));
  });
  beforeEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await resetDb(prisma);
    await seed(prisma);
    tokenA = await register('Ana', 'ana@example.com');
    tokenB = await register('Bia', 'bia@example.com');
    const species = await prisma.plant.findFirstOrThrow();
    const res = await app.inject({
      method: 'POST',
      url: '/me/plants',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        catalogPlantId: species.id,
        reminderTime: '08:30',
        timeZone: 'America/Sao_Paulo',
      }),
    });
    plantId = res.json<UserPlant>().id;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it('stores a PNG and serves the same bytes privately', async () => {
    const res = await upload(plantId, tokenA, {
      data: png,
      filename: 'a.png',
      type: 'image/png',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<UserPlant>()).toMatchObject({
      id: plantId,
      hasPhoto: true,
    });

    const got = await download(plantId, tokenA);
    expect(got.statusCode).toBe(200);
    expect(got.headers['content-type']).toBe('image/png');
    expect(got.headers['cache-control']).toBe('private');
    expect(got.rawPayload.equals(png)).toBe(true);
  });

  it('detects JPEG and WebP from the bytes, not the client type', async () => {
    await upload(plantId, tokenA, {
      data: jpeg,
      filename: 'a.bin',
      type: 'application/octet-stream',
    });
    expect((await download(plantId, tokenA)).headers['content-type']).toBe(
      'image/jpeg',
    );
    await upload(plantId, tokenA, {
      data: webp,
      filename: 'a.jpg',
      type: 'image/jpeg',
    });
    expect((await download(plantId, tokenA)).headers['content-type']).toBe(
      'image/webp',
    );
  });

  it('rejects a text file named .png with 415', async () => {
    const res = await upload(plantId, tokenA, {
      data: Buffer.from('definitely not an image'),
      filename: 'fake.png',
      type: 'image/png',
    });
    expect(res.statusCode).toBe(415);
    expect(res.json<ErrorBody>().error.code).toBe('unsupported_photo_type');
    expect(await readdir(dir).catch(() => [])).toEqual([]);
  });

  it('rejects a 6 MB file with 413', async () => {
    const res = await upload(plantId, tokenA, {
      data: Buffer.concat([png, Buffer.alloc(6 * 1024 * 1024)]),
      filename: 'big.png',
      type: 'image/png',
    });
    expect(res.statusCode).toBe(413);
    expect(res.json<ErrorBody>().error.code).toBe('photo_too_large');
    expect(await readdir(dir).catch(() => [])).toEqual([]);
  });

  it('rejects a missing photo field or non-multipart body with 400', async () => {
    const none = await upload(plantId, tokenA);
    expect(none.statusCode).toBe(400);
    expect(none.json<ErrorBody>().error.code).toBe('photo_missing');
    const wrongField = await upload(plantId, tokenA, {
      data: png,
      filename: 'a.png',
      type: 'image/png',
      field: 'file',
    });
    expect(wrongField.statusCode).toBe(400);
    const json = await app.inject({
      method: 'POST',
      url: `/me/plants/${plantId}/photo`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
      },
      payload: '{}',
    });
    expect(json.statusCode).toBe(400);
    expect(json.json<ErrorBody>().error.code).toBe('photo_missing');
  });

  it('rejects too many form fields before the photo part', async () => {
    const fields = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [`f${i}`, 'x']),
    );
    const res = await upload(
      plantId,
      tokenA,
      { data: png, filename: 'a.png', type: 'image/png' },
      fields,
    );
    expect(res.statusCode).toBe(413);
    expect(res.json<ErrorBody>().error.code).toBe('photo_too_large');
    expect(await readdir(dir).catch(() => [])).toEqual([]);
  });

  it('rejects an oversized form field before the photo part', async () => {
    const res = await upload(
      plantId,
      tokenA,
      { data: png, filename: 'a.png', type: 'image/png' },
      { note: 'x'.repeat(2048) },
    );
    expect(res.statusCode).toBe(413);
    expect(res.json<ErrorBody>().error.code).toBe('photo_too_large');
    expect(await readdir(dir).catch(() => [])).toEqual([]);
  });

  it('requires authentication', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/me/plants/${plantId}/photo`,
    });
    expect(res.statusCode).toBe(401);
  });

  it("answers 404 for another user's plant, on upload and download", async () => {
    await upload(plantId, tokenA, {
      data: png,
      filename: 'a.png',
      type: 'image/png',
    });
    const up = await upload(plantId, tokenB, {
      data: jpeg,
      filename: 'b.jpg',
      type: 'image/jpeg',
    });
    expect(up.statusCode).toBe(404);
    expect(up.json<ErrorBody>().error.code).toBe('user_plant_not_found');
    const down = await download(plantId, tokenB);
    expect(down.statusCode).toBe(404);
    expect(down.json<ErrorBody>().error.code).toBe('user_plant_not_found');
    expect(await readdir(dir)).toEqual([`${plantId}.png`]);
  });

  it('answers 404 photo_not_found when the plant has no photo', async () => {
    const res = await download(plantId, tokenA);
    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorBody>().error.code).toBe('photo_not_found');
  });

  it('keeps a single file when uploading twice, even across types', async () => {
    await upload(plantId, tokenA, {
      data: png,
      filename: 'a.png',
      type: 'image/png',
    });
    await upload(plantId, tokenA, {
      data: png,
      filename: 'a.png',
      type: 'image/png',
    });
    expect(await readdir(dir)).toEqual([`${plantId}.png`]);
    await upload(plantId, tokenA, {
      data: jpeg,
      filename: 'a.jpg',
      type: 'image/jpeg',
    });
    expect(await readdir(dir)).toEqual([`${plantId}.jpg`]);
    const got = await download(plantId, tokenA);
    expect(got.rawPayload.equals(jpeg)).toBe(true);
  });

  it('removes the photo file when the plant is deleted', async () => {
    await upload(plantId, tokenA, {
      data: png,
      filename: 'a.png',
      type: 'image/png',
    });
    expect(await readdir(dir)).toHaveLength(1);
    const res = await app.inject({
      method: 'DELETE',
      url: `/me/plants/${plantId}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(res.statusCode).toBe(204);
    expect(await readdir(dir)).toEqual([]);
  });
});
