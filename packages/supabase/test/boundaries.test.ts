import { describe, expect, it } from 'vitest';

import * as browserEntry from '../src/browser';
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
  parseServiceRoleSupabaseConfig,
} from '../src/server';

const serviceRoleJwt = 'eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.unsigned-placeholder';
const anonymousJwt = 'eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYW5vbiJ9.unsigned-placeholder';

describe('Supabase browser boundary', () => {
  it('does not export a privileged client helper', () => {
    expect('createSupabaseServiceRoleClient' in browserEntry).toBe(false);
    expect('parseServiceRoleSupabaseConfig' in browserEntry).toBe(false);
  });

  it('rejects known service-role key formats', () => {
    expect(() =>
      browserEntry.parseAnonymousSupabaseConfig({
        url: 'https://example.supabase.co',
        anonKey: serviceRoleJwt,
      }),
    ).toThrow('service-role key cannot be used by a browser client');

    expect(() =>
      browserEntry.parseAnonymousSupabaseConfig({
        url: 'https://example.supabase.co',
        anonKey: 'sb_secret_not-for-browsers',
      }),
    ).toThrow();
  });

  it('accepts anonymous configuration without making an external request', () => {
    const client = browserEntry.createSupabaseBrowserClient({
      url: 'https://example.supabase.co',
      anonKey: anonymousJwt,
    });

    expect(client.auth).toBeDefined();
  });
});

describe('Supabase server boundary', () => {
  it('keeps anonymous and privileged constructors explicit', () => {
    const anonymousClient = createSupabaseServerClient({
      url: 'https://example.supabase.co',
      anonKey: anonymousJwt,
    });
    const privilegedClient = createSupabaseServiceRoleClient({
      url: 'https://example.supabase.co',
      serviceRoleKey: serviceRoleJwt,
    });

    expect(anonymousClient.auth).toBeDefined();
    expect(privilegedClient.auth).toBeDefined();
  });

  it('rejects an anonymous JWT at the service-role boundary', () => {
    expect(() =>
      parseServiceRoleSupabaseConfig({
        url: 'https://example.supabase.co',
        serviceRoleKey: anonymousJwt,
      }),
    ).toThrow('anonymous key cannot be used as a service-role key');
  });
});
