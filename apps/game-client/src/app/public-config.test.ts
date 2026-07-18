import { describe, expect, it } from 'vitest';

import { parseGameClientPublicConfig } from './public-config';

const validEnvironment = {
  NEXT_PUBLIC_APP_ENV: 'development',
  NEXT_PUBLIC_LANDING_URL: 'http://localhost:3000',
  NEXT_PUBLIC_GAME_URL: 'http://localhost:3001',
  NEXT_PUBLIC_ADMIN_URL: 'http://localhost:3002',
  NEXT_PUBLIC_API_URL: 'http://localhost:4000',
  NEXT_PUBLIC_REALTIME_URL: 'ws://localhost:4001',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anonymous-key',
  NEXT_PUBLIC_GAME_BUILD_ID: 'game-client:test-build',
} as const;

describe('parseGameClientPublicConfig', () => {
  it('maps the browser-safe game and real-time endpoints', () => {
    const config = parseGameClientPublicConfig(validEnvironment);

    expect(config).toMatchObject({
      application: 'game-client',
      environment: 'development',
      appUrl: 'http://localhost:3001',
      landingUrl: 'http://localhost:3000',
      adminUrl: 'http://localhost:3002',
      apiUrl: 'http://localhost:4000',
      buildId: 'game-client:test-build',
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

  it('validates the optional collision-development flag', () => {
    expect(
      parseGameClientPublicConfig({
        ...validEnvironment,
        NEXT_PUBLIC_GAME_COLLISION_DEBUG: 'true',
      }).collisionDebug,
    ).toBe(true);
    expect(() =>
      parseGameClientPublicConfig({
        ...validEnvironment,
        NEXT_PUBLIC_GAME_COLLISION_DEBUG: 'yes',
      }),
    ).toThrow(/must be true or false/u);
  });

  it('requires an explicit safe build identifier in production', () => {
    expect(() =>
      parseGameClientPublicConfig({
        ...validEnvironment,
        NEXT_PUBLIC_APP_ENV: 'production',
        NEXT_PUBLIC_LANDING_URL: 'https://starville.example',
        NEXT_PUBLIC_GAME_URL: 'https://game.starville.example',
        NEXT_PUBLIC_ADMIN_URL: 'https://admin.starville.example',
        NEXT_PUBLIC_API_URL: 'https://api.starville.example',
        NEXT_PUBLIC_REALTIME_URL: 'wss://realtime.starville.example',
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        NEXT_PUBLIC_GAME_BUILD_ID: '',
      }),
    ).toThrow(/required in production/u);
  });
});
