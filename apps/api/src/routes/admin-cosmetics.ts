import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  adminCosmeticGrantInputSchema,
  adminCosmeticRevocationInputSchema,
} from '@starville/cosmetics';

import { authorizeAdminRequest } from '../admin-authorization.js';
import type { AdminCosmeticGateway } from '../cosmetics/contracts.js';
import { CosmeticPersistenceError } from '../cosmetics/gateway.js';
import type { AdminAuthGateway, ServiceLogger } from '../contracts.js';
import { PublicApiError } from '../errors.js';
import { assertTrustedBrowserMutation, disableResponseCaching } from '../token-access/http.js';

const PREFIX = '/api/v1/admin/cosmetics';
const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.preprocess(
      (value) => value ?? 50,
      z.coerce.number().pipe(z.union([z.literal(20), z.literal(50), z.literal(100)])),
    ),
  })
  .strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new PublicApiError(400, 'INVALID_COSMETIC_ADMIN_REQUEST');
  return parsed.data;
}

async function operation<T>(invoke: () => Promise<T>): Promise<T> {
  try {
    const value = await invoke();
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const status = Reflect.get(value, 'status');
      if (status === 'request_conflict') {
        throw new PublicApiError(409, 'REQUEST_ALREADY_PROCESSED');
      }
      if (status === 'state_conflict') {
        throw new PublicApiError(409, 'COSMETIC_OWNERSHIP_CHANGED');
      }
      if (status === 'player_not_found') {
        throw new PublicApiError(404, 'PLAYER_NOT_FOUND');
      }
      if (status === 'not_found') {
        throw new PublicApiError(404, 'COSMETIC_NOT_FOUND');
      }
      if (status === 'invalid_request') {
        throw new PublicApiError(400, 'INVALID_COSMETIC_ADMIN_REQUEST');
      }
      if (status === 'maintenance') {
        throw new PublicApiError(503, 'COSMETICS_MAINTENANCE');
      }
    }
    return value;
  } catch (error) {
    if (error instanceof CosmeticPersistenceError) {
      throw new PublicApiError(503, 'COSMETICS_ADMIN_UNAVAILABLE');
    }
    throw error;
  }
}

export function registerAdminCosmeticRoutes(
  app: FastifyInstance,
  options: {
    readonly adminGateway: AdminAuthGateway;
    readonly cosmeticGateway: AdminCosmeticGateway;
    readonly logger: ServiceLogger;
    readonly allowedOrigins: ReadonlySet<string>;
  },
): void {
  app.get(`${PREFIX}/overview`, async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'cosmetics.read',
    );
    return {
      success: true,
      data: await operation(() => options.cosmeticGateway.overview(identity)),
      requestId: request.id,
    };
  });

  app.get(`${PREFIX}/audit`, async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'cosmetics.audit.read',
    );
    const query = parse(querySchema, request.query);
    return {
      success: true,
      data: await operation(() =>
        options.cosmeticGateway.audit(identity, query.page, query.pageSize),
      ),
      requestId: request.id,
    };
  });

  app.get(`${PREFIX}/settings`, async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'cosmetics.settings.read',
    );
    return {
      success: true,
      data: await operation(() => options.cosmeticGateway.settings(identity)),
      requestId: request.id,
    };
  });

  app.get(`${PREFIX}/shop`, async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'cosmetics.shop.read',
    );
    return {
      success: true,
      data: await operation(() => options.cosmeticGateway.shop(identity)),
      requestId: request.id,
    };
  });

  app.post(`${PREFIX}/grants`, { bodyLimit: 4_096 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'cosmetics.grant',
    );
    const input = parse(adminCosmeticGrantInputSchema, request.body);
    return {
      success: true,
      data: await operation(() =>
        options.cosmeticGateway.grant(
          identity,
          input.playerProfileId,
          input.cosmeticKey,
          input.reasonCategory,
          input.explanation,
          input.expectedState,
          input.requestId,
        ),
      ),
      requestId: request.id,
    };
  });

  app.post(`${PREFIX}/revocations`, { bodyLimit: 4_096 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'cosmetics.revoke',
    );
    const input = parse(adminCosmeticRevocationInputSchema, request.body);
    return {
      success: true,
      data: await operation(() =>
        options.cosmeticGateway.revoke(
          identity,
          input.playerProfileId,
          input.cosmeticKey,
          input.reasonCategory,
          input.explanation,
          input.expectedState,
          input.requestId,
        ),
      ),
      requestId: request.id,
    };
  });
}
