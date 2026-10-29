import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

describe('parseEnv', () => {
  it('throws listing every bad key', () => {
    expect(() => parseEnv({ JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    expect(() => parseEnv({ JWT_SECRET: 'short' })).toThrow(/DATABASE_URL/);
  });

  it('applies defaults and splits Google client ids', () => {
    const env = parseEnv({
      DATABASE_URL: 'postgresql://u:p@localhost:5433/db',
      JWT_SECRET: 'x'.repeat(32),
      GOOGLE_CLIENT_IDS: 'a, b',
    });
    expect(env.PORT).toBe(3333);
    expect(env.ACCESS_TOKEN_TTL).toBe('15m');
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(30);
    expect(env.GOOGLE_CLIENT_IDS).toEqual(['a', 'b']);
  });

  it('applies the AI defaults', () => {
    const base = {
      DATABASE_URL: 'postgresql://u:p@localhost:5433/db',
      JWT_SECRET: 'x'.repeat(32),
    };
    const env = parseEnv(base);
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.AI_MODEL).toBe('claude-haiku-5-5');
    expect(env.AI_DAILY_SPEND_LIMIT_USD).toBe(0.5);
    expect(
      parseEnv({ ...base, AI_DAILY_SPEND_LIMIT_USD: '0' })
        .AI_DAILY_SPEND_LIMIT_USD,
    ).toBe(0);
  });

  it('resolves a relative UPLOADS_DIR against the api folder, not the cwd', () => {
    const apiRoot = fileURLToPath(new URL('..', import.meta.url));
    const base = {
      DATABASE_URL: 'postgresql://u:p@localhost:5433/db',
      JWT_SECRET: 'x'.repeat(32),
    };
    const relative = parseEnv({ ...base, UPLOADS_DIR: 'uploads-test' });
    expect(path.isAbsolute(relative.UPLOADS_DIR)).toBe(true);
    expect(relative.UPLOADS_DIR).toBe(path.join(apiRoot, 'uploads-test'));
    expect(parseEnv(base).UPLOADS_DIR).toBe(path.join(apiRoot, 'uploads'));
    expect(parseEnv({ ...base, UPLOADS_DIR: '/var/photos' }).UPLOADS_DIR).toBe(
      '/var/photos',
    );
  });
});
