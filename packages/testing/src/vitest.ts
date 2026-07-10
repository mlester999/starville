import { defineConfig } from 'vitest/config';

export interface StarvilleVitestOptions {
  readonly environment?: 'node' | 'jsdom';
  readonly setupFiles?: readonly string[];
}

export function createVitestConfig(options: StarvilleVitestOptions = {}) {
  return defineConfig({
    test: {
      environment: options.environment ?? 'node',
      clearMocks: true,
      mockReset: true,
      restoreMocks: true,
      passWithNoTests: false,
      setupFiles: options.setupFiles === undefined ? [] : [...options.setupFiles],
    },
  });
}
