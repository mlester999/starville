import { describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

import type { ServiceLogger } from '../contracts.js';
import { createWorkerRuntime } from '../runtime.js';
import { EconomyMaintenanceJob } from './economy-maintenance-job.js';
import { createEconomyMaintenanceGateway } from './economy-maintenance-persistence.js';

function createRpc(activation: Record<string, unknown>) {
  return vi.fn(async (operation: string, parameters: Record<string, unknown>) => {
    const requestId = parameters['p_request_id'];
    const responses: Record<string, unknown> = {
      run_economy_reconciliation_worker: {
        runId: '11111111-1111-4111-8111-111111111111',
        checkedCount: 4,
        mismatchCount: 0,
        autoCorrected: false,
      },
      scan_economy_risk_signals: {
        signalsCreated: 0,
        automaticPlayerActions: 0,
      },
      refresh_economy_daily_metrics: {
        metricDate: '2026-07-22',
        dustCreated: 10,
        dustDestroyed: 2,
        transactionCount: 3,
        activePlayerCount: 2,
        calculatedAt: '2026-07-23T00:00:00Z',
      },
      activate_approved_economy_versions: {
        ...activation,
        requestId,
      },
      run_shop_restock_worker: {
        status: 'processed',
        restocked: 1,
        requestId,
      },
      reconcile_shop_transactions: {
        status: 'processed',
        processed: 1,
        resolved: 1,
        manualReview: 0,
        requestId,
      },
    };

    return { data: responses[operation], error: null };
  });
}

function createTestLogger() {
  const startupError = vi.fn();
  const logger: ServiceLogger = {
    child: () => logger,
    debug: vi.fn(),
    trace: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: startupError,
    fatal: vi.fn(),
  };
  return { logger, startupError };
}

describe('economy maintenance persistence', () => {
  it('completes the approved-activation worker job with a literal published-only result', async () => {
    const rpc = createRpc({ policiesActivated: 1, shopsActivated: 2 });
    const job = new EconomyMaintenanceJob(
      createEconomyMaintenanceGateway({ rpc } as never),
      500,
      100,
    );

    await expect(job.execute()).resolves.toMatchObject({
      activation: {
        policiesActivated: 1,
        shopsActivated: 2,
        publishedOnly: true,
      },
    });
    expect(rpc).toHaveBeenCalledWith('activate_approved_economy_versions', {
      p_batch_size: 100,
      p_request_id: expect.stringMatching(/^worker-economy:/u),
    });
  });

  it('starts the local worker with one approved-activation execution and no startup error', async () => {
    const rpc = createRpc({ policiesActivated: 1, shopsActivated: 2 });
    const { logger, startupError } = createTestLogger();
    const runtime = createWorkerRuntime({
      config: {
        environment: 'test',
        host: '127.0.0.1',
        healthPort: 0,
        concurrency: 1,
        retry: { maxAttempts: 3, baseDelayMs: 0 },
      },
      jobs: [
        new EconomyMaintenanceJob(createEconomyMaintenanceGateway({ rpc } as never), 500, 100),
      ],
      logger,
    });

    try {
      await expect(runtime.start()).resolves.toMatch(/^http:\/\/127\.0\.0\.1:/u);
      expect(runtime.state).toBe('ready');
      expect(
        rpc.mock.calls.filter(([operation]) => operation === 'activate_approved_economy_versions'),
      ).toHaveLength(1);
      expect(startupError).not.toHaveBeenCalled();
    } finally {
      await runtime.stop();
    }
  });

  it('accepts the legacy approved-activation response when it attests published-only', async () => {
    const rpc = createRpc({
      policiesActivated: 1,
      shopsActivated: 0,
      publishedOnly: true,
    });
    const gateway = createEconomyMaintenanceGateway({ rpc } as never);

    await expect(gateway.execute(10, 10)).resolves.toMatchObject({
      activation: {
        policiesActivated: 1,
        shopsActivated: 0,
        publishedOnly: true,
      },
    });
  });

  it.each([false, 'true'])(
    'rejects the conflicting published-only attestation %j',
    async (publishedOnly) => {
      const rpc = createRpc({
        policiesActivated: 0,
        shopsActivated: 0,
        publishedOnly,
      });
      const gateway = createEconomyMaintenanceGateway({ rpc } as never);

      await expect(gateway.execute(10, 10)).rejects.toBeInstanceOf(ZodError);
    },
  );
});
