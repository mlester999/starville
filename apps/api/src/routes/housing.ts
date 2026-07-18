import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  layoutDraftRequestSchema,
  openDecorationSessionRequestSchema,
  purchaseHomeUpgradeRequestSchema,
  saveLayoutRequestSchema,
  storageTransferRequestSchema,
} from '@starville/housing';
import { housingSimulationInputSchema } from '@starville/housing-simulation';
import { authorizeAdminRequest } from '../admin-authorization.js';
import type { AdminAuthGateway, ServiceLogger } from '../contracts.js';
import { PublicApiError, type SafeApiErrorCode } from '../errors.js';
import {
  HousingPersistenceError,
  adminHousingQuerySchema,
  housingCorrectionApplySchema,
  housingCorrectionRequestSchema,
  housingLiveOpsUpdateSchema,
  housingReconciliationRequestSchema,
  housingUpgradeSuccessorSchema,
  housingUpgradeTransitionSchema,
  type HousingGateway,
  type HousingPersistenceStatus,
} from '../housing/gateway.js';
import type { PlayerService } from '../player/contracts.js';
import { authorizePlayerRequest, requirePlayerEntry } from '../player/http-authorization.js';
import type { TokenAccessService } from '../token-access/contracts.js';
import {
  assertTrustedBrowserMutation,
  disableResponseCaching,
  type TokenAccessCookieOptions,
} from '../token-access/http.js';

const PLAYER_PREFIX = '/api/v1/token-access/player/housing';
const uuidParams = z.object({ id: z.uuid() }).strict();
const homeUuidParams = z.object({ homeId: z.uuid(), id: z.uuid() }).strict();
const storageOpenSchema = z
  .object({ homeId: z.uuid(), expectedStorageStateVersion: z.number().int().positive() })
  .strict();
const historyQuerySchema = z
  .object({
    before: z.preprocess(
      (value) => (value === undefined ? null : value),
      z.coerce.number().int().positive().nullable(),
    ),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new PublicApiError(400, 'INVALID_HOUSING_REQUEST');
  return parsed.data;
}
async function playerWallet(
  request: FastifyRequest,
  reply: FastifyReply,
  options: {
    playerService: PlayerService;
    tokenAccessService: TokenAccessService;
    cookie: TokenAccessCookieOptions;
  },
) {
  const wallet = await authorizePlayerRequest(
    request,
    reply,
    options.tokenAccessService,
    options.cookie,
  );
  if (
    (await requirePlayerEntry(options.playerService, wallet, request.id, false, false)) ===
    undefined
  )
    throw new PublicApiError(404, 'PLAYER_PROFILE_REQUIRED');
  return wallet;
}
function persistenceFailure(status: string): never {
  const mapping: Record<
    HousingPersistenceStatus,
    readonly [PublicApiError['statusCode'], SafeApiErrorCode]
  > = {
    home_not_found: [404, 'HOUSING_NOT_FOUND'],
    home_permission_denied: [403, 'HOUSING_PERMISSION_DENIED'],
    home_suspended: [403, 'PLAYER_SUSPENDED'],
    home_world_mismatch: [409, 'HOUSING_WORLD_MISMATCH'],
    bootstrap_required: [409, 'COZY_GAMEPLAY_BOOTSTRAP_REQUIRED'],
    rename_required: [409, 'PLAYER_RENAME_REQUIRED'],
    rate_limited: [429, 'RATE_LIMITED'],
    decoration_disabled: [503, 'HOUSING_DISABLED'],
    layout_save_disabled: [503, 'HOUSING_DISABLED'],
    layout_conflict: [409, 'HOUSING_CONFLICT'],
    home_conflict: [409, 'HOUSING_CONFLICT'],
    inventory_conflict: [409, 'INVENTORY_STATE_CONFLICT'],
    storage_conflict: [409, 'HOUSING_CONFLICT'],
    layout_invalid: [409, 'HOUSING_LAYOUT_INVALID'],
    layout_not_found: [404, 'HOUSING_NOT_FOUND'],
    furniture_not_owned: [409, 'HOUSING_FURNITURE_NOT_OWNED'],
    furniture_return_blocked: [409, 'HOUSING_FURNITURE_RETURN_BLOCKED'],
    request_already_processed: [409, 'REQUEST_ALREADY_PROCESSED'],
    storage_permission_denied: [403, 'HOUSING_PERMISSION_DENIED'],
    storage_unavailable: [503, 'HOUSING_DISABLED'],
    storage_deposit_disabled: [503, 'HOUSING_DISABLED'],
    storage_withdrawal_disabled: [503, 'HOUSING_DISABLED'],
    storage_capacity_reached: [409, 'HOUSING_STORAGE_FULL'],
    storage_item_not_owned: [404, 'HOUSING_STORAGE_ITEM_NOT_FOUND'],
    inventory_capacity_reached: [409, 'INVENTORY_FULL'],
    item_not_owned: [409, 'INVENTORY_QUANTITY_INSUFFICIENT'],
    item_not_storage_eligible: [409, 'ITEM_UNAVAILABLE'],
    upgrade_not_available: [404, 'HOUSING_UPGRADE_UNAVAILABLE'],
    upgrade_disabled: [503, 'HOUSING_DISABLED'],
    upgrade_already_owned: [409, 'HOUSING_UPGRADE_UNAVAILABLE'],
    upgrade_not_eligible: [409, 'UNLOCK_REQUIREMENT_NOT_MET'],
    insufficient_dust: [409, 'INSUFFICIENT_DUST'],
    dust_conflict: [409, 'GAMEPLAY_STATE_CONFLICT'],
    upgrade_settlement_failed: [503, 'ECONOMY_SETTLEMENT_FAILED'],
    furniture_not_found: [404, 'HOUSING_NOT_FOUND'],
    furniture_not_interactive: [409, 'INVALID_FURNITURE_PLACEMENT'],
  };
  const [statusCode, code] = mapping[status as HousingPersistenceStatus] ?? [
    503,
    'HOUSING_UNAVAILABLE',
  ];
  throw new PublicApiError(statusCode, code);
}
async function operation<T>(invoke: () => Promise<T>): Promise<T> {
  try {
    return await invoke();
  } catch (error) {
    if (error instanceof HousingPersistenceError)
      throw new PublicApiError(503, 'HOUSING_UNAVAILABLE');
    throw error;
  }
}

export function registerHousingRoutes(
  app: FastifyInstance,
  options: {
    gateway: HousingGateway;
    playerService: PlayerService;
    tokenAccessService: TokenAccessService;
    cookie: TokenAccessCookieOptions;
    adminGateway: AdminAuthGateway;
    logger: ServiceLogger;
    allowedOrigins: ReadonlySet<string>;
  },
): void {
  app.get(PLAYER_PREFIX, async (request, reply) => {
    disableResponseCaching(reply);
    const wallet = await playerWallet(request, reply, options);
    const result = await operation(() => options.gateway.workspace(wallet, request.id));
    if (typeof result === 'string') persistenceFailure(result);
    return { success: true, data: result, requestId: request.id };
  });
  app.get(`${PLAYER_PREFIX}/game-test`, async (request, reply) => {
    disableResponseCaching(reply);
    await playerWallet(request, reply, options);
    return { success: true, data: options.gateway.gameTest(), requestId: request.id };
  });
  app.post(`${PLAYER_PREFIX}/decoration-sessions`, { bodyLimit: 2_048 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const wallet = await playerWallet(request, reply, options);
    const input = parse(openDecorationSessionRequestSchema, request.body);
    const result = await operation(() =>
      options.gateway.openDecoration(
        wallet,
        input.homeId,
        input.expectedLayoutRevision,
        input.idempotencyKey,
        request.id,
      ),
    );
    if (typeof result === 'string') persistenceFailure(result);
    return { success: true, data: result, requestId: request.id };
  });
  app.post(`${PLAYER_PREFIX}/layouts/validate`, { bodyLimit: 262_144 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const wallet = await playerWallet(request, reply, options);
    const input = parse(layoutDraftRequestSchema, request.body);
    const result = await operation(() => options.gateway.validateLayout(wallet, input, request.id));
    if (typeof result === 'string') persistenceFailure(result);
    return { success: true, data: result, requestId: request.id };
  });
  app.post(`${PLAYER_PREFIX}/layouts`, { bodyLimit: 262_144 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const wallet = await playerWallet(request, reply, options);
    const input = parse(saveLayoutRequestSchema, request.body);
    const result = await operation(() => options.gateway.saveLayout(wallet, input, request.id));
    if (typeof result === 'string') persistenceFailure(result);
    return { success: true, data: result, requestId: request.id };
  });
  app.get(`${PLAYER_PREFIX}/homes/:homeId/layouts`, async (request, reply) => {
    disableResponseCaching(reply);
    const wallet = await playerWallet(request, reply, options);
    const { homeId } = parse(z.object({ homeId: z.uuid() }).strict(), request.params);
    const query = parse(historyQuerySchema, request.query);
    const result = await operation(() =>
      options.gateway.history(wallet, homeId, query.before, query.limit, request.id),
    );
    if (typeof result === 'string') persistenceFailure(result);
    return { success: true, data: result, requestId: request.id };
  });
  app.get(`${PLAYER_PREFIX}/homes/:homeId/layouts/:id`, async (request, reply) => {
    disableResponseCaching(reply);
    const wallet = await playerWallet(request, reply, options);
    const { homeId, id } = parse(homeUuidParams, request.params);
    const result = await operation(() => options.gateway.revision(wallet, homeId, id, request.id));
    if (typeof result === 'string') persistenceFailure(result);
    return { success: true, data: result, requestId: request.id };
  });
  app.post(`${PLAYER_PREFIX}/storage/open`, { bodyLimit: 1_024 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const wallet = await playerWallet(request, reply, options);
    const input = parse(storageOpenSchema, request.body);
    const result = await operation(() =>
      options.gateway.openStorage(
        wallet,
        input.homeId,
        input.expectedStorageStateVersion,
        request.id,
      ),
    );
    if (typeof result === 'string') persistenceFailure(result);
    return { success: true, data: result, requestId: request.id };
  });
  for (const storageOperation of ['deposit', 'withdrawal'] as const) {
    app.post(
      `${PLAYER_PREFIX}/storage/${storageOperation}`,
      { bodyLimit: 2_048 },
      async (request, reply) => {
        assertTrustedBrowserMutation(request, options.allowedOrigins);
        disableResponseCaching(reply);
        const wallet = await playerWallet(request, reply, options);
        const input = parse(storageTransferRequestSchema, request.body);
        const result = await operation(() =>
          options.gateway.transferStorage(wallet, storageOperation, input, request.id),
        );
        if (typeof result === 'string') persistenceFailure(result);
        return { success: true, data: result, requestId: request.id };
      },
    );
  }
  app.post(`${PLAYER_PREFIX}/upgrades/purchase`, { bodyLimit: 2_048 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const wallet = await playerWallet(request, reply, options);
    const input = parse(purchaseHomeUpgradeRequestSchema, request.body);
    const result = await operation(() =>
      options.gateway.purchaseUpgrade(wallet, input, request.id),
    );
    if (typeof result === 'string') persistenceFailure(result);
    return { success: true, data: result, requestId: request.id };
  });
  app.post(
    `${PLAYER_PREFIX}/homes/:homeId/interactions/:id`,
    { bodyLimit: 512 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const wallet = await playerWallet(request, reply, options);
      const { homeId, id } = parse(homeUuidParams, request.params);
      const result = await operation(() =>
        options.gateway.interact(wallet, homeId, id, request.id),
      );
      if (typeof result === 'string') persistenceFailure(result);
      return { success: true, data: result, requestId: request.id };
    },
  );

  app.get('/api/v1/admin/housing', async (request, reply) => {
    disableResponseCaching(reply);
    const query = parse(adminHousingQuerySchema, request.query);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      query.wallet === null ? 'housing.furniture.inspect' : 'housing.player_homes.inspect',
    );
    return {
      success: true,
      data: await operation(() =>
        options.gateway.adminWorkspace(
          identity,
          query.wallet,
          query.search,
          query.limit,
          query.offset,
          request.id,
        ),
      ),
      requestId: request.id,
    };
  });
  app.post('/api/v1/admin/housing/simulations', { bodyLimit: 8_192 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'housing.upgrades.inspect',
    );
    return {
      success: true,
      data: options.gateway.simulate(identity, parse(housingSimulationInputSchema, request.body)),
      requestId: request.id,
    };
  });
  app.post(
    '/api/v1/admin/housing/upgrades/:id/successors',
    { bodyLimit: 8_192 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'housing.upgrades.manage',
      );
      const { id } = parse(uuidParams, request.params);
      return {
        success: true,
        data: await operation(() =>
          options.gateway.upgradeSuccessor(
            identity,
            id,
            parse(housingUpgradeSuccessorSchema, request.body),
            request.id,
          ),
        ),
        requestId: request.id,
      };
    },
  );
  app.post(
    '/api/v1/admin/housing/upgrades/:id/transition',
    { bodyLimit: 2_048 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'housing.upgrades.manage',
      );
      const { id } = parse(uuidParams, request.params);
      return {
        success: true,
        data: await operation(() =>
          options.gateway.transitionUpgrade(
            identity,
            id,
            parse(housingUpgradeTransitionSchema, request.body),
            request.id,
          ),
        ),
        requestId: request.id,
      };
    },
  );
  app.patch('/api/v1/admin/housing/live-ops', { bodyLimit: 4_096 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'housing.live_ops.manage',
    );
    return {
      success: true,
      data: await operation(() =>
        options.gateway.liveOps(
          identity,
          parse(housingLiveOpsUpdateSchema, request.body),
          request.id,
        ),
      ),
      requestId: request.id,
    };
  });
  app.post('/api/v1/admin/housing/reconciliation', { bodyLimit: 4_096 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'housing.reconciliation.manage',
    );
    return {
      success: true,
      data: await operation(() =>
        options.gateway.reconcile(
          identity,
          parse(housingReconciliationRequestSchema, request.body),
          request.id,
        ),
      ),
      requestId: request.id,
    };
  });
  app.post('/api/v1/admin/housing/corrections', { bodyLimit: 16_384 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'housing.corrections.manage',
    );
    return {
      success: true,
      data: await operation(() =>
        options.gateway.correction(
          identity,
          parse(housingCorrectionRequestSchema, request.body),
          request.id,
        ),
      ),
      requestId: request.id,
    };
  });
  app.post(
    '/api/v1/admin/housing/corrections/:id/apply',
    { bodyLimit: 2_048 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'housing.corrections.manage',
      );
      const { id } = parse(uuidParams, request.params);
      return {
        success: true,
        data: await operation(() =>
          options.gateway.applyCorrection(
            identity,
            id,
            parse(housingCorrectionApplySchema, request.body),
            request.id,
          ),
        ),
        requestId: request.id,
      };
    },
  );
}
