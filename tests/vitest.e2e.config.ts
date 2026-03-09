import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    root: __dirname,
    globals: true,
    environment: 'node',
    globalSetup: './setup/global-setup.ts',
    include: ['e2e/**/*.test.ts'],
    testTimeout: 600_000,
    hookTimeout: 60_000,
    pool: 'forks',
    sequence: {
      concurrent: false,
    },
  },
});
