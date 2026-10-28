import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDiskStorage } from './storage';

describe('disk storage', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'plantcare-storage-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('creates the directory, saves, reads and removes', async () => {
    const dir = path.join(root, 'nested', 'uploads');
    const storage = createDiskStorage(dir);
    await storage.save('abc.png', Buffer.from('hello'));
    expect((await storage.read('abc.png'))?.toString()).toBe('hello');
    await storage.remove('abc.png');
    expect(await storage.read('abc.png')).toBeNull();
    expect(await readdir(dir)).toEqual([]);
  });

  it('removing a missing key is a no-op', async () => {
    await expect(
      createDiskStorage(root).remove('missing.jpg'),
    ).resolves.toBeUndefined();
  });

  it('accepts species, proposal and check-up keys', async () => {
    const storage = createDiskStorage(root);
    for (const key of [
      'species/abc.webp',
      'proposals/p1.jpg',
      'checkups/c1.jpg',
    ]) {
      await storage.save(key, Buffer.from('x'));
      expect(await storage.read(key)).toEqual(Buffer.from('x'));
    }
    await expect(
      storage.save('species/../x.webp', Buffer.from('x')),
    ).rejects.toThrow('Invalid storage key');
  });

  it('rejects keys that could escape the directory', async () => {
    const storage = createDiskStorage(root);
    await expect(storage.save('../evil.png', Buffer.from('x'))).rejects.toThrow(
      'Invalid storage key',
    );
    await expect(storage.read('a/b.png')).rejects.toThrow(
      'Invalid storage key',
    );
    await expect(storage.remove('notes.txt')).rejects.toThrow(
      'Invalid storage key',
    );
  });
});
