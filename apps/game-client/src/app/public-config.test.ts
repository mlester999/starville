import { describe, expect, it } from 'vitest';

import { parseGameClientPublicConfig } from './public-config';

const validEnvironment = {
  NEXT_PUBLIC_APP_ENV: 'development',
  NEXT_PUBLIC_LANDING_URL: 'http://localhost:3000',
  NEXT_PUBLIC_GAME_URL: 'http://localhost:3001',
  NEXT_PUBLIC_API_URL: 'http://localhost:4000',
  NEXT_PUBLIC_REALTIME_URL: 'ws://localhost:4001',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anonymous-key',
} as const;

describe('parseGameClientPublicConfig', () => {
  it('maps the browser-safe game and real-time endpoints', () => {
    const config = parseGameClientPublicConfig(validEnvironment);

    expect(config).toMatchObject({
      application: 'game-client',
      environment: 'development',
      appUrl: 'http://localhost:3001',
      landingUrl: 'http://localhost:3000',
      apiUrl: 'http://localhost:4000',
      realtimeUrl: 'ws://localhost:4001',
      supabase: {
        url: 'https://example.supabase.co',
        anonKey: 'test-anonymous-key',
      },
    });
    expect(config).not.toHaveProperty('serviceRoleKey');
  });

  it('rejects an invalid real-time endpoint', () => {
    expect(() =>
      parseGameClientPublicConfig({
        ...validEnvironment,
        NEXT_PUBLIC_REALTIME_URL: 'not-a-url',
      }),
    ).toThrow();
  });

  it('rejects a credential-bearing landing URL', () => {
    expect(() =>
      parseGameClientPublicConfig({
        ...validEnvironment,
        NEXT_PUBLIC_LANDING_URL: 'https://user:password@example.com',
      }),
    ).toThrow();
  });
});
