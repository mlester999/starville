import type { OperationsHealthConfig } from '@starville/config/server';

import type { OperationsHealthReader, OperationsServiceStatus } from './contracts.js';

type HealthFetch = typeof fetch;

function operationStatus(
  service: OperationsServiceStatus['service'],
  status: OperationsServiceStatus['status'],
  checkedAt: string,
  responseTimeMs: number | null,
): OperationsServiceStatus {
  return { service, status, checkedAt, responseTimeMs };
}

async function checkService(
  service: 'realtime-server' | 'worker',
  url: string,
  timeoutMs: number,
  requestId: string,
  fetchImplementation: HealthFetch,
): Promise<OperationsServiceStatus> {
  const startedAt = performance.now();
  const checkedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImplementation(url, {
      method: 'GET',
      headers: { accept: 'application/json', 'x-request-id': requestId },
      signal: controller.signal,
    });
    const elapsed = Math.max(0, Math.round(performance.now() - startedAt));

    if (!response.ok) return operationStatus(service, 'unavailable', checkedAt, elapsed);
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return operationStatus(service, 'unknown', checkedAt, elapsed);
    }
    if (typeof payload !== 'object' || payload === null) {
      return operationStatus(service, 'unknown', checkedAt, elapsed);
    }

    const readinessValue = Reflect.get(
      payload,
      service === 'realtime-server' ? 'status' : 'readiness',
    );
    if (typeof readinessValue !== 'string') {
      return operationStatus(service, 'unknown', checkedAt, elapsed);
    }
    const ready = readinessValue === (service === 'realtime-server' ? 'ok' : 'ready');
    return operationStatus(service, ready ? 'healthy' : 'degraded', checkedAt, elapsed);
  } catch {
    return operationStatus(service, 'unavailable', checkedAt, null);
  } finally {
    clearTimeout(timeout);
  }
}

export function createOperationsHealthReader(
  config: OperationsHealthConfig,
  fetchImplementation: HealthFetch = fetch,
): OperationsHealthReader {
  let cached:
    { readonly expiresAt: number; readonly value: readonly OperationsServiceStatus[] } | undefined;

  return {
    async read(requestId) {
      if (cached !== undefined && cached.expiresAt > Date.now()) return cached.value;

      const checkedAt = new Date().toISOString();
      const [realtime, worker] = await Promise.all([
        config.realtimeProvider === 'custom'
          ? checkService(
              'realtime-server',
              config.realtimeReadyUrl!,
              config.timeoutMs,
              requestId,
              fetchImplementation,
            )
          : operationStatus('realtime-server', 'degraded', checkedAt, null),
        config.backgroundJobsProvider === 'custom'
          ? checkService(
              'worker',
              config.workerReadyUrl!,
              config.timeoutMs,
              requestId,
              fetchImplementation,
            )
          : operationStatus('worker', 'degraded', checkedAt, null),
      ]);
      const value = [operationStatus('api', 'healthy', checkedAt, null), realtime, worker] as const;
      cached = { expiresAt: Date.now() + 5_000, value };
      return value;
    },
  };
}
