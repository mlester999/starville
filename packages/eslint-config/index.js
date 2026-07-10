import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import typescriptEslint from 'typescript-eslint';

const typescriptFiles = ['**/*.{ts,tsx,mts,cts}'];

const typescriptRecommended = typescriptEslint.configs.recommended.map((config) => ({
  ...config,
  files: typescriptFiles,
}));

const reactHooksRecommended = reactHooks.configs['flat/recommended'].map((config) => ({
  ...config,
  files: ['**/*.{jsx,tsx}'],
}));

export const baseConfig = [
  {
    ignores: [
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/vite.config.timestamp-*',
    ],
  },
  eslint.configs.recommended,
  ...typescriptRecommended,
  {
    files: typescriptFiles,
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports', prefer: 'type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-console': 'error',
    },
  },
  prettier,
];

export const browserConfig = [
  ...baseConfig,
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'],
    languageOptions: { globals: globals.browser },
  },
];

export const nodeConfig = [
  ...baseConfig,
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },
];

export const reactConfig = [
  ...browserConfig,
  ...reactHooksRecommended,
  {
    files: ['**/*.{jsx,tsx}'],
    plugins: {
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactRefresh.configs.vite.rules,
    },
  },
];

export default baseConfig;
