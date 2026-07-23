import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

import { assertProductionRuntimeSafetyGatesClosed } from '@starville/config/server';

import { parseGameClientPublicConfig } from './src/app/public-config';
import { starvilleBundledAssetsPlugin } from './vite-bundled-assets';

const DEFAULT_GAME_CLIENT_PORT = 3001;

export function parseGameClientPort(value: string | undefined): number {
  if (value === undefined || value.trim() === '') {
    return DEFAULT_GAME_CLIENT_PORT;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      `GAME_CLIENT_PORT must be an integer between 1 and 65535; received '${value}'.`,
    );
  }

  return port;
}

export default defineConfig(({ mode }) => {
  const environment = {
    ...loadEnv(mode, process.cwd(), ''),
    ...process.env,
  };
  assertProductionRuntimeSafetyGatesClosed(environment);
  parseGameClientPublicConfig(environment);
  const port = parseGameClientPort(environment['GAME_CLIENT_PORT']);
  const developmentApiProxy = environment['GAME_CLIENT_DEV_API_PROXY_TARGET'];
  const developmentRealtimeProxy = environment['GAME_CLIENT_DEV_REALTIME_PROXY_TARGET'];

  return {
    plugins: [react(), starvilleBundledAssetsPlugin()],
    publicDir: 'public',
    envPrefix: ['NEXT_PUBLIC_'],
    build: {
      chunkSizeWarningLimit: 1_600,
      sourcemap: false,
    },
    server: {
      port,
      strictPort: true,
      proxy: {
        ...(developmentApiProxy === undefined
          ? {}
          : {
              '/api': {
                target: developmentApiProxy,
                changeOrigin: false,
              },
            }),
        ...(developmentRealtimeProxy === undefined
          ? {}
          : {
              '/realtime': {
                target: developmentRealtimeProxy,
                ws: true,
                rewrite: (path: string) => path.replace(/^\/realtime/u, ''),
              },
            }),
      },
    },
    preview: {
      port,
      strictPort: true,
    },
  };
});
