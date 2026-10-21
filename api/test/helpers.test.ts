import { describe, expect, it } from 'vitest';
import { createPrisma } from '../src/db';
import { resetDb } from './helpers';

describe('resetDb', () => {
  it('refuses to truncate a database whose name does not end in _test', async () => {
    const dev = createPrisma(
      'postgresql://postgres:postgres@localhost:5433/plantcare',
    );
    try {
      await expect(resetDb(dev)).rejects.toThrow(/_test/);
    } finally {
      await dev.$disconnect();
    }
  });
});
