import { nodeConfig, reactConfig } from '@starville/eslint-config';

const defaultCodePatterns = ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'];

function scope(configurations, roots) {
  return configurations.map((configuration) => {
    if (configuration.ignores && configuration.files === undefined) {
      return configuration;
    }

    const patterns = configuration.files ?? defaultCodePatterns;

    return {
      ...configuration,
      files: roots.flatMap((root) => patterns.map((pattern) => `${root}/${pattern}`)),
    };
  });
}

const nodeRoots = ['apps/api', 'apps/realtime-server', 'apps/worker', 'packages', 'scripts'];
const browserRoots = ['apps/landing', 'apps/game-client', 'apps/admin-portal'];
const nodeGlobals = nodeConfig.findLast(
  (configuration) => configuration.languageOptions?.globals !== undefined,
)?.languageOptions;

export default [
  ...scope(nodeConfig, nodeRoots),
  ...scope(reactConfig, browserRoots),
  {
    files: [
      'apps/landing/next.config.ts',
      'apps/landing/vitest.config.ts',
      'apps/landing/scripts/**/*.mjs',
      'apps/game-client/vite.config.ts',
      'apps/game-client/vitest.config.ts',
      'apps/admin-portal/next.config.ts',
      'apps/admin-portal/vitest.config.ts',
      'apps/admin-portal/scripts/**/*.mjs',
    ],
    languageOptions: nodeGlobals,
  },
];
