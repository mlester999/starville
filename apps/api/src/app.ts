import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ApiRuntimeConfig, ServiceLogger } from './contracts.js';
import { formatApiError, formatNotFoundError } from './errors.js';
import { resolveRequestId } from './request-id.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerStatusRoutes } from './routes/status.js';

export interface BuildApiAppOptions {
  readonly config: ApiRuntimeConfig;
  readonly logger: ServiceLogger;
}

export function buildApiApp({ config, logger }: BuildApiAppOptions): FastifyInstance {
  const allowedOrigins = new Set(config.corsAllowedOrigins);
  const app = Fastify({
    logger: false,
    genReqId: resolveRequestId,
  });

  void app.register(cors, {
    credentials: false,
    methods: ['GET', 'HEAD', 'OPTIONS'],
    origin(origin, callback) {
      callback(null, origin === undefined || allowedOrigins.has(origin));
    },
  });

  app.addHook('onRequest', async (request, reply) => {
    void reply.header('x-request-id', request.id);
  });

  app.addHook('onResponse', async (request, reply) => {
    logger.child({ requestId: request.id }).info('api.request.completed', {
      method: request.method,
      path: request.url,
      statusCode: reply.statusCode,
    });
  });

  app.setErrorHandler((error, request, reply) => {
    const details = formatApiError(error, request.id);

    logger.child({ requestId: request.id }).error('api.request.failed', {
      error,
      method: request.method,
      path: request.url,
      statusCode: details.statusCode,
    });

    void reply.status(details.statusCode).send(details.body);
  });

  app.setNotFoundHandler((request, reply) => {
    void reply.status(404).send(formatNotFoundError(request.id));
  });

  registerHealthRoutes(app, config);
  registerStatusRoutes(app);

  return app;
}
