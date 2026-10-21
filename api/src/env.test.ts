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
});
