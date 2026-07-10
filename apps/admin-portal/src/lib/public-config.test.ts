import { describe, expect, it } from 'vitest';

import { parseAdminPublicConfig } from './public-config';

const validEnvironment = {
  NEXT_PUBLIC_APP_ENV: 'development',
  NEXT_PUBLIC_ADMIN_URL: 'http://localhost:3002',
  NEXT_PUBLIC_API_URL: 'http://localhost:4000',
  NEXT_PUBLIC_GAME_URL: 'http://localhost:3001',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anonymous-key',
} as const;

describe('parseAdminPublicConfig', () => {
  it("maps only the admin portal's browser-safe variables", () => {
    const config = parseAdminPublicConfig(validEnvironment);

    expect(config).toMatchObject({
      application: 'admin-portal',
      environment: 'development',
      appUrl: 'http://localhost:3002',
      apiUrl: 'http://localhost:4000',
      gameUrl: 'http://localhost:3001',
      supabase: {
        url: 'https://example.supabase.co',
        anonKey: 'test-anonymous-key',
      },
    });
    expect(config).not.toHaveProperty('serviceRoleKey');
  });

  it('rejects an invalid API URL', () => {
    expect(() =>
      parseAdminPublicConfig({
        ...validEnvironment,
        NEXT_PUBLIC_API_URL: 'not-a-url',
      }),
    ).toThrow();
  });

  it('rejects a game URL that contains credentials', () => {
    expect(() =>
      parseAdminPublicConfig({
        ...validEnvironment,
        NEXT_PUBLIC_GAME_URL: 'https://user:password@example.com',
      }),
    ).toThrow(/NEXT_PUBLIC_GAME_URL/);
  });
});
