import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

import { parseGameClientPublicConfig } from './src/app/public-config';

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
  parseGameClientPublicConfig(environment);
  const port = parseGameClientPort(environment['GAME_CLIENT_PORT']);

  return {
    plugins: [react()],
    envPrefix: ['NEXT_PUBLIC_'],
    build: {
      chunkSizeWarningLimit: 1_600,
    },
    server: {
      port,
      strictPort: true,
    },
    preview: {
      port,
      strictPort: true,
    },
  };
});
