import { createVitestConfig } from '@starville/testing/vitest';
import { mergeConfig } from 'vitest/config';

export default mergeConfig(
  createVitestConfig({
    environment: 'node',
  }),
  {
    oxc: {
      jsx: {
        runtime: 'automatic',
      },
    },
    test: {
      hookTimeout: 20_000,
      maxWorkers: 2,
      testTimeout: 20_000,
    },
  },
);
