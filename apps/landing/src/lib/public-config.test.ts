import { describe, expect, it } from 'vitest';

import { parseLandingPublicConfig } from './public-config';

const validEnvironment = {
  NEXT_PUBLIC_APP_ENV: 'development',
  NEXT_PUBLIC_LANDING_URL: 'http://localhost:3000',
  NEXT_PUBLIC_GAME_URL: 'http://localhost:3001',
  NEXT_PUBLIC_API_URL: 'http://localhost:4000',
  NEXT_PUBLIC_REOWN_PROJECT_ID: 'starville-reown-test-project',
  NEXT_PUBLIC_STARVILLE_X_URL: 'https://x.com/starville',
  NEXT_PUBLIC_STARVILLE_DISCORD_URL: 'https://discord.gg/starville',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anonymous-key',
  SOLANA_NETWORK: 'mainnet-beta',
} as const;

describe('parseLandingPublicConfig', () => {
  it("maps only the landing application's browser-safe variables", () => {
    const config = parseLandingPublicConfig(validEnvironment);

    expect(config).toMatchObject({
      application: 'landing',
      environment: 'development',
      appUrl: 'http://localhost:3000',
      apiUrl: 'http://localhost:4000',
      gameUrl: 'http://localhost:3001',
      reownProjectId: 'starville-reown-test-project',
      network: 'solana:mainnet-beta',
      social: {
        xUrl: 'https://x.com/starville',
        discordUrl: 'https://discord.gg/starville',
      },
      supabase: {
        url: 'https://example.supabase.co',
        anonKey: 'test-anonymous-key',
      },
    });
    expect(config).not.toHaveProperty('serviceRoleKey');
  });

  it('rejects an empty public application URL', () => {
    expect(() =>
      parseLandingPublicConfig({
        ...validEnvironment,
        NEXT_PUBLIC_LANDING_URL: '',
      }),
    ).toThrow();
  });

  it('rejects a missing Reown project identifier before AppKit can initialize', () => {
    expect(() =>
      parseLandingPublicConfig({
        ...validEnvironment,
        NEXT_PUBLIC_REOWN_PROJECT_ID: '',
      }),
    ).toThrow(/NEXT_PUBLIC_REOWN_PROJECT_ID/);
  });

  it('allows social destinations to remain unconfigured without inventing links', () => {
    const config = parseLandingPublicConfig({
      ...validEnvironment,
      NEXT_PUBLIC_STARVILLE_X_URL: '',
      NEXT_PUBLIC_STARVILLE_DISCORD_URL: '',
    });

    expect(config.social).toEqual({ xUrl: undefined, discordUrl: undefined });
  });

  it('rejects insecure or credential-bearing social destinations', () => {
    expect(() =>
      parseLandingPublicConfig({
        ...validEnvironment,
        NEXT_PUBLIC_STARVILLE_X_URL: 'http://x.com/starville',
      }),
    ).toThrow(/public HTTPS URL/);
    expect(() =>
      parseLandingPublicConfig({
        ...validEnvironment,
        NEXT_PUBLIC_STARVILLE_DISCORD_URL: 'https://user:password@discord.gg/starville',
      }),
    ).toThrow(/public HTTPS URL/);
  });
});
