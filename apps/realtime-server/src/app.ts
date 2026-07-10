import websocket from '@fastify/websocket';
import type { ServiceHealth } from '@starville/shared-types';
import Fastify, { type FastifyInstance } from 'fastify';
import { ConnectionRegistry } from './connections/connection-registry.js';
import type { RealtimeRuntimeConfig, ServiceLogger } from './contracts.js';
import { isAllowedRealtimeOrigin } from './origins.js';
import { RoomRegistry } from './rooms/room-registry.js';

const SERVICE_VERSION = '0.1.0';

interface WebSocketVerificationInfo {
  readonly origin?: string;
}

type WebSocketVerificationCallback = (
  accepted: boolean,
  statusCode?: number,
  message?: string,
) => void;

export interface RealtimeApp {
  readonly app: FastifyInstance;
  readonly connections: ConnectionRegistry;
  readonly rooms: RoomRegistry;
}

export interface BuildRealtimeAppOptions {
  readonly config: RealtimeRuntimeConfig;
  readonly logger: ServiceLogger;
}

export function buildRealtimeApp({ config, logger }: BuildRealtimeAppOptions): RealtimeApp {
  const app = Fastify({ logger: false });
  const allowedOrigins = new Set(config.allowedOrigins);
  const connections = new ConnectionRegistry(config.connectionLimit);
  const rooms = new RoomRegistry();

  void app.register(websocket, {
    options: {
      maxPayload: 16 * 1024,
      verifyClient(info: WebSocketVerificationInfo, callback: WebSocketVerificationCallback) {
        if (!isAllowedRealtimeOrigin(info.origin, allowedOrigins)) {
          callback(false, 403, 'Origin is not allowed');
          return;
        }

        if (connections.isFull) {
          callback(false, 503, 'Connection limit reached');
          return;
        }

        callback(true);
      },
    },
  });

  app.get('/health', async (): Promise<ServiceHealth> => ({
    service: 'realtime-server',
    environment: config.environment,
    status: 'ok',
    version: SERVICE_VERSION,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  }));

  app.get('/ready', async () => ({
    service: 'realtime-server' as const,
    environment: config.environment,
    status: 'ok' as const,
    version: SERVICE_VERSION,
    timestamp: new Date().toISOString(),
    connections: {
      active: connections.size,
      limit: connections.limit,
    },
  }));

  app.get('/connect', { websocket: true }, (socket, request) => {
    const registration = connections.register();

    if (registration === undefined) {
      socket.close(1013, 'Connection limit reached');
      return;
    }

    const { connectionId } = registration;
    const connectionLogger = logger.child({ connectionId, requestId: request.id });
    let released = false;

    connectionLogger.info('realtime.connection.opened');

    const release = () => {
      if (released) {
        return;
      }

      released = true;
      rooms.removeConnection(connectionId);
      connections.release(connectionId);
      connectionLogger.info('realtime.connection.closed');
    };

    socket.once('close', release);
    socket.once('error', (error: Error) => {
      connectionLogger.warn('realtime.connection.error', { error });
      release();
    });
  });

  return { app, connections, rooms };
}
