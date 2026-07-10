import type { FastifyInstance } from 'fastify';
import { buildRealtimeApp } from './app.js';
import type { RealtimeRuntimeConfig, ServiceLogger } from './contracts.js';

export interface RealtimeService {
  readonly app: FastifyInstance;
  start(): Promise<string>;
  stop(): Promise<void>;
}

export interface CreateRealtimeServiceOptions {
  readonly config: RealtimeRuntimeConfig;
  readonly logger: ServiceLogger;
}

export function createRealtimeService({
  config,
  logger,
}: CreateRealtimeServiceOptions): RealtimeService {
  const { app } = buildRealtimeApp({ config, logger });

  return {
    app,
    async start() {
      const address = await app.listen({ host: config.host, port: config.port });
      logger.info('realtime.started', {
        address,
        connectionLimit: config.connectionLimit,
        host: config.host,
        port: config.port,
      });
      return address;
    },
    async stop() {
      await app.close();
      logger.info('realtime.stopped');
    },
  };
}
