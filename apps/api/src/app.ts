import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AdminAuthGateway, ApiRuntimeConfig, ServiceLogger } from './contracts.js';
import { formatApiError, formatNotFoundError } from './errors.js';
import { resolveRequestId } from './request-id.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerStatusRoutes } from './routes/status.js';

export interface BuildApiAppOptions {
  readonly config: ApiRuntimeConfig;
  readonly logger: ServiceLogger;
  readonly adminAuthGateway: AdminAuthGateway;
  readonly adminSessionTtlMinutes: number;
}

function requestPath(url: string): string {
  return url.split('?', 1)[0] ?? '/';
}

export function buildApiApp({
  config,
  logger,
  adminAuthGateway,
  adminSessionTtlMinutes,
}: BuildApiAppOptions): FastifyInstance {
  const allowedOrigins = new Set(config.corsAllowedOrigins);
  const app = Fastify({
    logger: false,
    genReqId: resolveRequestId,
  });

  void app.register(cors, {
    credentials: false,
    methods: ['GET', 'POST', 'DELETE', 'HEAD', 'OPTIONS'],
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
      path: requestPath(request.url),
      statusCode: reply.statusCode,
    });
  });

  app.setErrorHandler((error, request, reply) => {
    const details = formatApiError(error, request.id);
    const requestLogger = logger.child({ requestId: request.id });
    const requestContext = {
      method: request.method,
      path: requestPath(request.url),
      statusCode: details.statusCode,
    };

    if (details.statusCode >= 500) {
      requestLogger.error('api.request.failed', { ...requestContext, error });
    } else {
      requestLogger.warn('api.request.rejected', requestContext);
    }

    void reply.status(details.statusCode).send(details.body);
  });

  app.setNotFoundHandler((request, reply) => {
    void reply.status(404).send(formatNotFoundError(request.id));
  });

  registerHealthRoutes(app, config);
  registerStatusRoutes(app);
  registerAdminRoutes(app, {
    gateway: adminAuthGateway,
    logger,
    sessionTtlMinutes: adminSessionTtlMinutes,
  });

  return app;
}
