import { afterEach, describe, expect, it } from 'vitest';
import { buildApiApp } from './app.js';
import type { LogContext, ServiceLogger } from './contracts.js';

class SilentLogger implements ServiceLogger {
  child(_bindings: LogContext): ServiceLogger {
    return this;
  }

  debug(_message: string, _context?: LogContext): void {}

  trace(_message: string, _context?: LogContext): void {}

  info(_message: string, _context?: LogContext): void {}

  warn(_message: string, _context?: LogContext): void {}

  error(_message: string, _context?: LogContext): void {}

  fatal(_message: string, _context?: LogContext): void {}
}

const apps: ReturnType<typeof buildApiApp>[] = [];

function createApp() {
  const app = buildApiApp({
    config: {
      environment: 'test',
      host: '127.0.0.1',
      port: 4000,
      corsAllowedOrigins: ['http://localhost:3000'],
    },
    logger: new SilentLogger(),
  });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('API foundation', () => {
  it('returns a healthy response without exposing configuration', async () => {
    const response = await createApp().inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      service: 'api',
      environment: 'test',
      status: 'ok',
    });
    expect(response.body).not.toContain('SUPABASE');
  });

  it('propagates a safe request ID through the versioned status response', async () => {
    const response = await createApp().inject({
      method: 'GET',
      url: '/api/v1/status',
      headers: { 'x-request-id': 'phase-1-request' },
    });

    expect(response.headers['x-request-id']).toBe('phase-1-request');
    expect(response.json()).toMatchObject({
      success: true,
      requestId: 'phase-1-request',
      data: { apiVersion: 'v1', status: 'operational' },
    });
  });

  it('formats uncaught route failures without leaking the original error', async () => {
    const app = createApp();
    app.get('/test-only/error', async () => {
      throw new Error('sensitive implementation detail');
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test-only/error',
      headers: { 'x-request-id': 'error-request' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
      },
      requestId: 'error-request',
    });
    expect(response.body).not.toContain('sensitive implementation detail');
  });

  it('uses the shared error envelope for unknown routes', async () => {
    const response = await createApp().inject({ method: 'GET', url: '/missing' });
    const body = response.json<{ requestId: string }>();

    expect(response.statusCode).toBe(404);
    expect(body).toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(body.requestId).toEqual(expect.any(String));
  });

  it('only reflects configured CORS origins', async () => {
    const app = createApp();
    const allowed = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:3000' },
    });
    const denied = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://untrusted.example' },
    });

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
