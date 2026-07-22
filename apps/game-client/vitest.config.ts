import { createVitestConfig } from '@starville/testing/vitest';
import { mergeConfig } from 'vitest/config';

export default mergeConfig(
  createVitestConfig({
    environment: 'jsdom',
  }),
  {
    test: {
      hookTimeout: 15_000,
      maxWorkers: 4,
      testTimeout: 15_000,
    },
  },
);
