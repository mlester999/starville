import { describe, expect, it } from 'vitest';

import { parseLandingPublicConfig } from './public-config';

const validEnvironment = {
  NEXT_PUBLIC_APP_ENV: 'development',
  NEXT_PUBLIC_LANDING_URL: 'http://localhost:3000',
  NEXT_PUBLIC_API_URL: 'http://localhost:4000',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anonymous-key',
} as const;

describe('parseLandingPublicConfig', () => {
  it("maps only the landing application's browser-safe variables", () => {
    const config = parseLandingPublicConfig(validEnvironment);

    expect(config).toMatchObject({
      application: 'landing',
      environment: 'development',
      appUrl: 'http://localhost:3000',
      apiUrl: 'http://localhost:4000',
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
});
