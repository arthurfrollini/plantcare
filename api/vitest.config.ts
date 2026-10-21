import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'prisma/**/*.test.ts'],
    fileParallelism: false,
    setupFiles: ['test/setup.ts'],
  },
});
