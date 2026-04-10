import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const shared = {
  root: __dirname,
  globals: true,
  environment: 'node' as const,
  globalSetup: './setup/global-setup.ts',
  hookTimeout: 60_000,
  pool: 'forks' as const,
  sequence: { concurrent: false },
};

export default defineConfig({
  test: {
    ...shared,
    projects: [
      {
        test: {
          ...shared,
          name: 'api',
          include: ['server/**/*.test.ts'],
          testTimeout: 30_000,
          fileParallelism: false,
        },
      },
      {
        test: {
          ...shared,
          name: 'e2e',
          include: ['e2e/**/*.test.ts'],
          testTimeout: 600_000,
        },
      },
    ],
  },
});
