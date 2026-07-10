import { afterEach, describe, expect, it } from 'vitest';
import type { LogContext, ServiceLogger } from './contracts.js';
import { executeJobWithRetry } from './jobs/executor.js';
import type { WorkerJob } from './jobs/job.js';
import { createWorkerRuntime, type WorkerRuntime } from './runtime.js';

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
});
