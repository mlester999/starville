import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ServiceHealth } from '@starville/shared-types';
import type { ServiceLogger, WorkerRuntimeConfig } from './contracts.js';
import { executeJobWithRetry } from './jobs/executor.js';
import { FoundationNoopJob } from './jobs/foundation-noop-job.js';
import type { WorkerJob } from './jobs/job.js';
import { resolveRequestId } from './request-id.js';

const SERVICE_VERSION = '0.1.0';

type RuntimeState = 'idle' | 'starting' | 'ready' | 'stopping' | 'stopped';

export interface WorkerRuntime {
  readonly state: RuntimeState;
  start(): Promise<string>;
  stop(): Promise<void>;
}

export interface CreateWorkerRuntimeOptions {
  readonly config: WorkerRuntimeConfig;
  readonly logger: ServiceLogger;
  readonly jobs?: readonly WorkerJob[];
}

function assertRuntimeConfig(config: WorkerRuntimeConfig): void {
  if (!Number.isInteger(config.concurrency) || config.concurrency < 1) {
    throw new RangeError('Worker concurrency must be a positive integer.');
  }
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function runJobs(
  jobs: readonly WorkerJob[],
  config: WorkerRuntimeConfig,
  logger: ServiceLogger,
): Promise<void> {
  let nextJobIndex = 0;
  const runnerCount = Math.min(config.concurrency, jobs.length);

  await Promise.all(
    Array.from({ length: runnerCount }, async () => {
      while (nextJobIndex < jobs.length) {
        const job = jobs[nextJobIndex];
        nextJobIndex += 1;

        if (job !== undefined) {
          await executeJobWithRetry(job, config.retry, logger);
        }
      }
    }),
  );
}

function listen(server: Server, host: string, port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      const address = server.address() as AddressInfo;
      const addressHost = address.family === 'IPv6' ? `[${address.address}]` : address.address;
      resolve(`http://${addressHost}:${address.port}`);
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve();
    });
    server.closeIdleConnections();
  });
}

export function createWorkerRuntime({
  config,
  logger,
  jobs = [new FoundationNoopJob()],
}: CreateWorkerRuntimeOptions): WorkerRuntime {
  assertRuntimeConfig(config);
  let state: RuntimeState = 'idle';
  let healthServer: Server | undefined;

  const handleRequest = (request: IncomingMessage, response: ServerResponse) => {
    const requestId = resolveRequestId(request.headers['x-request-id']);
    const requestLogger = logger.child({ requestId });
    const path = new URL(request.url ?? '/', 'http://worker.local').pathname;
    response.setHeader('x-request-id', requestId);

    if (request.method === 'GET' && path === '/health') {
      const health: ServiceHealth = {
        service: 'worker',
        environment: config.environment,
        status: 'ok',
        version: SERVICE_VERSION,
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
      };
      sendJson(response, 200, health);
      requestLogger.info('worker.health.completed', { statusCode: 200 });
      return;
    }

    if (request.method === 'GET' && path === '/ready') {
      const isReady = state === 'ready';
      sendJson(response, isReady ? 200 : 503, {
        service: 'worker',
        environment: config.environment,
        status: isReady ? 'ok' : 'degraded',
        version: SERVICE_VERSION,
        timestamp: new Date().toISOString(),
        readiness: isReady ? 'ready' : 'not-ready',
        registeredJobs: jobs.length,
      });
      requestLogger.info('worker.readiness.completed', {
        statusCode: isReady ? 200 : 503,
      });
      return;
    }

    sendJson(response, 404, {
      success: false,
      error: { code: 'NOT_FOUND', message: 'The requested resource was not found.' },
      requestId,
    });
    requestLogger.info('worker.health.not_found', { statusCode: 404 });
  };

  return {
    get state() {
      return state;
    },
    async start() {
      if (state !== 'idle') {
        throw new Error(`Worker cannot start from the ${state} state.`);
      }

      state = 'starting';
      const server = createServer(handleRequest);
      healthServer = server;

      try {
        const address = await listen(server, config.host, config.healthPort);
        await runJobs(jobs, config, logger);
        state = 'ready';
        logger.info('worker.started', {
          address,
          concurrency: config.concurrency,
          healthPort: config.healthPort,
          registeredJobs: jobs.length,
        });
        return address;
      } catch (error) {
        state = 'stopping';
        if (server.listening) {
          await close(server);
        }
        healthServer = undefined;
        state = 'stopped';
        throw error;
      }
    },
    async stop() {
      if (state === 'idle' || state === 'stopped') {
        state = 'stopped';
        return;
      }

      state = 'stopping';
      if (healthServer !== undefined && healthServer.listening) {
        await close(healthServer);
      }
      healthServer = undefined;
      state = 'stopped';
      logger.info('worker.stopped');
    },
  };
}
