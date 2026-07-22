import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    hookTimeout: 15_000,
    maxWorkers: 1,
    testTimeout: 15_000,
  },
});
