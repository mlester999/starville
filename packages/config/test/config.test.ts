import { describe, expect, it } from 'vitest';

import { parsePublicBrowserConfig } from '../src/browser';
import {
  loadApiConfig,
  loadPrivateSupabaseConfig,
  loadRealtimeConfig,
  loadWorkerConfig,
} from '../src/server';

const validBrowserInput = {
  application: 'game-client',
  environment: 'development',
  appUrl: 'http://localhost:3001',
  apiUrl: 'http://localhost:4000',
  realtimeUrl: 'ws://localhost:4001',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'public-anonymous-placeholder',
} as const;

describe('public browser configuration', () => {
  it('returns only browser-safe normalized fields', () => {
    expect(parsePublicBrowserConfig(validBrowserInput)).toEqual({
      application: 'game-client',
      environment: 'development',
      appUrl: 'http://localhost:3001',
      apiUrl: 'http://localhost:4000',
      realtimeUrl: 'ws://localhost:4001',
      supabase: {
        url: 'https://example.supabase.co',
        anonKey: 'public-anonymous-placeholder',
      },
    });
  });

  it('rejects unknown fields so server secrets cannot leak into the public object', () => {
    expect(() =>
      parsePublicBrowserConfig({
        ...validBrowserInput,
        serviceRoleKey: 'must-not-be-public',
      } as typeof validBrowserInput),
    ).toThrow();
  });

  it('rejects invalid required public URLs', () => {
    expect(() => parsePublicBrowserConfig({ ...validBrowserInput, apiUrl: 'not-a-url' })).toThrow();
  });
});

describe('service configuration', () => {
  it('loads deterministic development defaults', () => {
    expect(loadApiConfig({})).toEqual({
      application: 'api',
      environment: 'development',
      host: '127.0.0.1',
      port: 4000,
      corsAllowedOrigins: [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
      ],
      logLevel: 'debug',
    });

    expect(loadRealtimeConfig({}).connectionLimit).toBe(100);
    expect(loadWorkerConfig({}).retry).toEqual({ maxAttempts: 3, baseDelayMs: 1000 });
  });

  it('rejects invalid application ports', () => {
    expect(() => loadApiConfig({ API_PORT: '0' })).toThrow();
    expect(() => loadRealtimeConfig({ REALTIME_PORT: '65536' })).toThrow();
    expect(() => loadWorkerConfig({ WORKER_HEALTH_PORT: 'not-a-port' })).toThrow();
  });

  it('requires an explicit production origin allowlist', () => {
    expect(() => loadApiConfig({ NODE_ENV: 'production' })).toThrow(
      'CORS_ALLOWED_ORIGINS is required in production',
    );
  });

  it('rejects invalid real-time and worker limits', () => {
    expect(() => loadRealtimeConfig({ REALTIME_MAX_CONNECTIONS: '0' })).toThrow();
    expect(() => loadWorkerConfig({ WORKER_CONCURRENCY: '-1' })).toThrow();
  });

  it('validates bind hosts and accepts explicit deployment hosts', () => {
    expect(loadApiConfig({ API_HOST: '0.0.0.0' }).host).toBe('0.0.0.0');
    expect(() => loadRealtimeConfig({ REALTIME_HOST: 'http://localhost' })).toThrow();
  });
});

describe('private server configuration', () => {
  it('loads privileged Supabase fields only through the server entry', () => {
    expect(
      loadPrivateSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'server-only-placeholder',
        SUPABASE_DATABASE_URL: 'postgresql://localhost/starville',
      }),
    ).toEqual({
      url: 'https://example.supabase.co',
      serviceRoleKey: 'server-only-placeholder',
      databaseUrl: 'postgresql://localhost/starville',
    });
  });
});
