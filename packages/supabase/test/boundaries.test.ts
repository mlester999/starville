import { describe, expect, it } from 'vitest';

import * as browserEntry from '../src/browser';
import * as ssrEntry from '../src/ssr';
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
  parseServiceRoleSupabaseConfig,
} from '../src/server';
import { createSupabaseSsrServerClient } from '../src/ssr';

const serviceRoleJwt = 'eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.unsigned-placeholder';
const anonymousJwt = 'eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYW5vbiJ9.unsigned-placeholder';

describe('Supabase browser boundary', () => {
  it('does not export a privileged client helper', () => {
    expect('createSupabaseServiceRoleClient' in browserEntry).toBe(false);
    expect('parseServiceRoleSupabaseConfig' in browserEntry).toBe(false);
    expect('createSupabaseServiceRoleClient' in ssrEntry).toBe(false);
    expect('parseServiceRoleSupabaseConfig' in ssrEntry).toBe(false);
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

  it('creates an SSR client through cookie methods without exposing privileged keys', () => {
    const client = createSupabaseSsrServerClient(
      { url: 'https://example.supabase.co', anonKey: anonymousJwt },
      { getAll: () => [], setAll: () => undefined },
    );

    expect(client.auth).toBeDefined();
  });

  it('allows server test clients to use a bounded instrumented transport', async () => {
    const requestedPaths: string[] = [];
    const instrumentedFetch: typeof globalThis.fetch = async (input) => {
      const url =
        typeof input === 'string'
          ? new URL(input)
          : input instanceof URL
            ? input
            : new URL(input.url);
      requestedPaths.push(url.pathname);
      return new Response('[]', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const serverClient = createSupabaseServerClient(
      { url: 'https://example.supabase.co', anonKey: anonymousJwt },
      { fetch: instrumentedFetch },
    );
    const ssrClient = createSupabaseSsrServerClient(
      { url: 'https://example.supabase.co', anonKey: anonymousJwt },
      { getAll: () => [], setAll: () => undefined },
      { fetch: instrumentedFetch },
    );

    const serverResult = await serverClient.from('world_maps').select('id').limit(1);
    const ssrResult = await ssrClient.from('world_maps').select('id').limit(1);

    expect(serverResult.error).toBeNull();
    expect(ssrResult.error).toBeNull();
    expect(requestedPaths).toEqual(['/rest/v1/world_maps', '/rest/v1/world_maps']);
  });

  it('rejects an anonymous JWT at the service-role boundary', () => {
    expect(() =>
      parseServiceRoleSupabaseConfig({
        url: 'https://example.supabase.co',
        serviceRoleKey: anonymousJwt,
      }),
    ).toThrow('anonymous key cannot be used as a service-role key');
  });

  it('accepts modern secret keys only at the explicit service-role boundary', () => {
    expect(
      parseServiceRoleSupabaseConfig({
        url: 'https://example.supabase.co',
        serviceRoleKey: 'sb_secret_server-only-placeholder',
      }),
    ).toMatchObject({ serviceRoleKey: 'sb_secret_server-only-placeholder' });
    expect(() =>
      parseServiceRoleSupabaseConfig({
        url: 'https://example.supabase.co',
        serviceRoleKey: 'sb_publishable_browser-placeholder',
      }),
    ).toThrow();
  });
});
