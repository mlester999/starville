import { afterEach, describe, expect, it } from 'vitest';
import { buildRealtimeApp } from './app.js';
import { ConnectionRegistry } from './connections/connection-registry.js';
import type { LogContext, ServiceLogger } from './contracts.js';
import { isAllowedRealtimeOrigin } from './origins.js';
import { createRealtimeService } from './service.js';

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

const closeTasks: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closeTasks.splice(0).map(async (close) => close()));
});

describe('real-time service foundation', () => {
  it('reports health and configured connection capacity', async () => {
    const realtime = buildRealtimeApp({
      config: {
        environment: 'test',
        host: '127.0.0.1',
        port: 4001,
        allowedOrigins: ['http://localhost:3001'],
        connectionLimit: 25,
      },
      logger: new SilentLogger(),
    });
    closeTasks.push(async () => realtime.app.close());

    const health = await realtime.app.inject({ method: 'GET', url: '/health' });
    const readiness = await realtime.app.inject({ method: 'GET', url: '/ready' });

    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({
      service: 'realtime-server',
      environment: 'test',
      status: 'ok',
    });
    expect(readiness.json()).toMatchObject({
      connections: { active: 0, limit: 25 },
    });
  });

  it('enforces the configured connection limit in the registry', () => {
    const registry = new ConnectionRegistry(1);
    const first = registry.register();

    expect(first).toBeDefined();
    if (first === undefined) {
      throw new Error('Expected the first connection to be registered.');
    }
    expect(registry.register()).toBeUndefined();
    expect(registry.size).toBe(1);

    registry.release(first.connectionId);
    expect(registry.size).toBe(0);
  });

  it('requires an exact configured WebSocket origin', () => {
    const origins = new Set(['http://localhost:3001']);

    expect(isAllowedRealtimeOrigin('http://localhost:3001', origins)).toBe(true);
    expect(isAllowedRealtimeOrigin('https://untrusted.example', origins)).toBe(false);
    expect(isAllowedRealtimeOrigin(undefined, origins)).toBe(false);
  });

  it('starts on configured host and an ephemeral test port', async () => {
    const service = createRealtimeService({
      config: {
        environment: 'test',
        host: '127.0.0.1',
        port: 0,
        allowedOrigins: ['http://localhost:3001'],
        connectionLimit: 10,
      },
      logger: new SilentLogger(),
    });
    closeTasks.push(async () => service.stop());

    const address = await service.start();
    const response = await fetch(`${address}/health`);

    expect(address).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
    expect(response.status).toBe(200);
  });
});
