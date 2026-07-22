import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  sourcemap: process.env['NODE_ENV'] !== 'production',
  clean: true,
  splitting: false,
  dts: false,
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  noExternal: [/^@starville\//u],
});
