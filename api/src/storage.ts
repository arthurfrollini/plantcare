import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface PhotoStorage {
  save(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}

const SAFE_KEY = /^[A-Za-z0-9_-]+\.(jpg|png|webp)$/;

function assertSafeKey(key: string): void {
  if (!SAFE_KEY.test(key)) {
    throw new Error(`Invalid storage key: ${key}`);
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export function createDiskStorage(dir: string): PhotoStorage {
  const root = path.resolve(dir);
  const fileFor = (key: string): string => {
    assertSafeKey(key);
    return path.join(root, key);
  };
  return {
    async save(key, data) {
      const file = fileFor(key);
      await mkdir(root, { recursive: true });
      await writeFile(file, data);
    },
    async read(key) {
      try {
        return await readFile(fileFor(key));
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
    },
    async remove(key) {
      await rm(fileFor(key), { force: true });
    },
  };
}
