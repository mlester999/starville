import { describe, expect, it, vi } from 'vitest';

import { createOperationsHealthReader } from './health.js';

const config = {
  realtimeProvider: 'custom',
  backgroundJobsProvider: 'custom',
  realtimeReadyUrl: 'http://127.0.0.1:4001/ready',
  workerReadyUrl: 'http://127.0.0.1:4002/ready',
  timeoutMs: 250,
  playerActionRateLimit: 20,
  operationsReadRateLimit: 120,
} as const;

describe('operations health reader', () => {
  it('reports real readiness without failing the whole summary on partial degradation', async () => {
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('4001')) return Response.json({ status: 'ok', connections: { active: 0 } });
      throw new Error('worker unavailable');
    }) as typeof fetch;

    const statuses = await createOperationsHealthReader(config, fetchImplementation).read(
      'health-request',
    );

    expect(statuses).toMatchObject([
      { service: 'api', status: 'healthy' },
      { service: 'realtime-server', status: 'healthy' },
      { service: 'worker', status: 'unavailable' },
    ]);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(statuses)).not.toContain('127.0.0.1');
  });

  it('uses a short cache to avoid aggressive readiness polling', async () => {
    const fetchImplementation = vi.fn(async () => Response.json({ status: 'ok' })) as typeof fetch;
    const reader = createOperationsHealthReader(config, fetchImplementation);
    await reader.read('first');
    await reader.read('second');
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it('distinguishes an unrecognized readiness payload from a degraded response', async () => {
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      return String(input).includes('4001')
        ? Response.json({ unexpected: true })
        : Response.json({ readiness: 'starting' });
    }) as typeof fetch;

    const statuses = await createOperationsHealthReader(config, fetchImplementation).read(
      'unknown-health-request',
    );
    expect(statuses).toMatchObject([
      { service: 'api', status: 'healthy' },
      { service: 'realtime-server', status: 'unknown' },
      { service: 'worker', status: 'degraded' },
    ]);
  });

  it('does not parse or fetch legacy service URLs in Supabase foundation mode', async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch;
    const statuses = await createOperationsHealthReader(
      {
        realtimeProvider: 'supabase',
        backgroundJobsProvider: 'supabase',
        timeoutMs: config.timeoutMs,
        playerActionRateLimit: config.playerActionRateLimit,
        operationsReadRateLimit: config.operationsReadRateLimit,
      },
      fetchImplementation,
    ).read('supabase-foundation');
    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(statuses).toMatchObject([
      { service: 'api', status: 'healthy' },
      { service: 'realtime-server', status: 'degraded' },
      { service: 'worker', status: 'degraded' },
    ]);
  });
});
