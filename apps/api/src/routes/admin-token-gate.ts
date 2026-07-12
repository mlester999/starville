import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { walletAddressSchema, walletNetworkSchema } from '@starville/wallet-access';

import { authorizeAdminRequest } from '../admin-authorization.js';
import type { AdminAuthGateway, ServiceLogger } from '../contracts.js';
import { PublicApiError } from '../errors.js';
import type { TokenAccessService } from '../token-access/contracts.js';
import { disableResponseCaching } from '../token-access/http.js';

interface RegisterAdminTokenGateRoutesOptions {
  readonly adminGateway: AdminAuthGateway;
  readonly service: TokenAccessService;
  readonly logger: ServiceLogger;
}

const validateSchema = z
  .object({
    network: walletNetworkSchema,
    mintAddress: walletAddressSchema,
    commitment: z.enum(['confirmed', 'finalized']),
  })
  .strict();

const updateSchema = z
  .object({
    expectedConfigVersion: z.number().int().positive(),
    enabled: z.boolean(),
    network: walletNetworkSchema,
    mintAddress: walletAddressSchema,
    symbol: z
      .string()
      .trim()
      .regex(/^[A-Z0-9]{1,16}$/u),
    requiredAmount: z
      .string()
      .trim()
      .regex(/^\d+(?:\.\d+)?$/u),
    commitment: z.enum(['confirmed', 'finalized']).default('confirmed'),
    sessionTtlSeconds: z.number().int().min(60).max(3_600),
    recheckIntervalSeconds: z.number().int().min(30).max(1_800),
    reason: z.string().trim().min(3).max(500),
  })
  .strict()
  .refine((value) => value.recheckIntervalSeconds <= value.sessionTtlSeconds, {
    path: ['recheckIntervalSeconds'],
    message: 'Recheck interval must not exceed session TTL',
  });

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    throw new PublicApiError(400, 'INVALID_REQUEST');
  }

  return parsed.data;
}

export function registerAdminTokenGateRoutes(
  app: FastifyInstance,
  options: RegisterAdminTokenGateRoutesOptions,
): void {
  const { adminGateway, service, logger } = options;

  app.get('/api/v1/admin/token-gate', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(request, adminGateway, logger, 'token_gate.read');
    return {
      success: true,
      data: await service.getAdminConfig(identity),
      requestId: request.id,
    };
  });

  app.post('/api/v1/admin/token-gate/validate', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      adminGateway,
      logger,
      'token_gate.configure',
    );

    const input = parseBody(validateSchema, request.body);
    return {
      success: true,
      data: await service.validateAdminMint(
        identity,
        input.mintAddress,
        input.commitment,
        request.id,
      ),
      requestId: request.id,
    };
  });

  app.patch('/api/v1/admin/token-gate', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      adminGateway,
      logger,
      'token_gate.configure',
    );
    const input = parseBody(updateSchema, request.body);
    return {
      success: true,
      data: await service.updateAdminConfig(identity, input, request.id),
      requestId: request.id,
    };
  });
}
