import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LogContext, ServiceLogger } from './contracts.js';
import { executeJobWithRetry } from './jobs/executor.js';
import type { WorkerJob } from './jobs/job.js';
import { createWorkerRuntime, type WorkerRuntime } from './runtime.js';
import { ChatRetentionCleanupJob } from './jobs/chat-retention-cleanup-job.js';
import { SocialInteractionCleanupJob } from './jobs/social-interaction-cleanup-job.js';
import { SocialGraphCleanupJob } from './jobs/social-graph-cleanup-job.js';
import { CooperativeActivityCleanupJob } from './jobs/cooperative-activity-cleanup-job.js';

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

const runtimes: WorkerRuntime[] = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(async (runtime) => runtime.stop()));
});

describe('worker foundation', () => {
  it('starts the health server and executes the registered startup job', async () => {
    let executions = 0;
    const startupJob: WorkerJob = {
      name: 'test-startup-job',
      async execute() {
        executions += 1;
      },
    };
    const runtime = createWorkerRuntime({
      config: {
        environment: 'test',
        host: '127.0.0.1',
        healthPort: 0,
        concurrency: 2,
        retry: { maxAttempts: 2, baseDelayMs: 0 },
      },
      jobs: [startupJob],
      logger: new SilentLogger(),
    });
    runtimes.push(runtime);

    const address = await runtime.start();
    const [health, readiness] = await Promise.all([
      fetch(`${address}/health`),
      fetch(`${address}/ready`),
    ]);

    expect(executions).toBe(1);
    expect(runtime.state).toBe('ready');
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({
      service: 'worker',
      environment: 'test',
      status: 'ok',
    });
    expect(Object.fromEntries(health.headers.entries())).toMatchObject({
      'cache-control': 'no-store',
      'content-security-policy': expect.stringContaining("default-src 'none'"),
      'permissions-policy': expect.stringContaining('camera=()'),
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
    });
    expect(health.headers.get('strict-transport-security')).toBeNull();
    expect(readiness.status).toBe(200);
    expect(await readiness.json()).toMatchObject({ readiness: 'ready', registeredJobs: 1 });
  });

  it('uses the configured retry policy without external infrastructure', async () => {
    let executions = 0;
    const job: WorkerJob<string> = {
      name: 'retry-test-job',
      async execute() {
        executions += 1;
        if (executions === 1) {
          throw new Error('transient test failure');
        }
        return 'completed';
      },
    };

    const result = await executeJobWithRetry(
      job,
      { maxAttempts: 3, baseDelayMs: 10 },
      new SilentLogger(),
      async () => undefined,
    );

    expect(result).toEqual({
      attempts: 2,
      jobName: 'retry-test-job',
      value: 'completed',
    });
  });

  it('rejects an invalid concurrency before opening a health port', () => {
    expect(() =>
      createWorkerRuntime({
        config: {
          environment: 'test',
          host: '127.0.0.1',
          healthPort: 4002,
          concurrency: 0,
          retry: { maxAttempts: 3, baseDelayMs: 100 },
        },
        logger: new SilentLogger(),
      }),
    ).toThrow('Worker concurrency must be a positive integer.');
  });

  it('runs bounded chat retention through the protected cleanup gateway', async () => {
    const cleanup = vi.fn(async () => ({ removedMessages: 12, expiredMutes: 2 }));
    const job = new ChatRetentionCleanupJob({ cleanup }, 500);
    await expect(job.execute()).resolves.toEqual({ removedMessages: 12, expiredMutes: 2 });
    expect(cleanup).toHaveBeenCalledWith(500);
    expect(() => new ChatRetentionCleanupJob({ cleanup }, 10_001)).toThrow(
      'Chat cleanup batch limit',
    );
  });

  it('expires social requests and releases reservations through one protected job', async () => {
    const cleanup = vi.fn(async () => ({ processed: 4, reservationsReleased: 2 }));
    const job = new SocialInteractionCleanupJob({ cleanup }, 250);
    await expect(job.execute()).resolves.toEqual({ processed: 4, reservationsReleased: 2 });
    expect(cleanup).toHaveBeenCalledWith(250);
    expect(() => new SocialInteractionCleanupJob({ cleanup }, 0)).toThrow(
      'Social interaction cleanup batch size',
    );
  });

  it('runs bounded friendship, invitation, ready, leader, and retention cleanup', async () => {
    const result = {
      expiredFriendRequests: 2,
      expiredInvitations: 3,
      expiredReadyChecks: 1,
      leadersTransferred: 1,
      partiesExpired: 0,
      notificationsRemoved: 4,
      idempotencyRemoved: 5,
      auditRemoved: 0,
    };
    const cleanup = vi.fn(async () => result);
    const job = new SocialGraphCleanupJob({ cleanup }, 300);
    await expect(job.execute()).resolves.toEqual(result);
    expect(cleanup).toHaveBeenCalledWith(300);
    expect(() => new SocialGraphCleanupJob({ cleanup }, 10_001)).toThrow(
      'Social graph cleanup batch size',
    );
  });

  it('runs bounded activity expiry, reconnect, temporary state, and pending reward cleanup', async () => {
    const result = {
      processed: 5,
      failed: 2,
      reconnectsExpired: 1,
      pendingRewardsClaimed: 2,
    };
    const cleanup = vi.fn(async () => result);
    const job = new CooperativeActivityCleanupJob({ cleanup }, 200);
    await expect(job.execute()).resolves.toEqual(result);
    expect(cleanup).toHaveBeenCalledWith(200);
    expect(() => new CooperativeActivityCleanupJob({ cleanup }, 501)).toThrow(
      'Cooperative activity cleanup batch size',
    );
  });
});
