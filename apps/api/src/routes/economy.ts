import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import {
  shopReceiptIdSchema,
  shopTransactionRequestV2Schema,
  shopTutorialMutationSchema,
  shopTutorialTurnInSchema,
} from '@starville/economy';
import { economySimulationInputSchema } from '@starville/economy-simulation';

import { authorizeAdminRequest } from '../admin-authorization.js';
import type { AdminAuthGateway, ServiceLogger } from '../contracts.js';
import {
  EconomyPersistenceError,
  EconomyRateLimitError,
  economyCorrectionCreateSchema,
  economyCorrectionReviewSchema,
  economyLedgerQuerySchema,
  economyPolicyDraftSchema,
  economyReconciliationRequestSchema,
  economyRiskReviewSchema,
  economyShopDraftSchema,
  economyShopOfferUpdateSchema,
  economyVersionTransitionSchema,
  playerEconomyHistoryQuerySchema,
  playerEconomyPurchaseSchema,
  shopCatalogEntryCreateSchema,
  shopCatalogEntryRemoveSchema,
  shopCatalogEntryUpdateSchema,
  shopCatalogSuccessorSchema,
  shopEventQuerySchema,
  shopLiveOpsUpdateSchema,
  shopReconciliationRequestSchema,
  shopRestockSchema,
  shopWorkspaceQuerySchema,
  type EconomyGateway,
  type EconomyPersistenceStatus,
  type ShopPersistenceStatus,
} from '../economy/gateway.js';
import { PublicApiError, type SafeApiErrorCode } from '../errors.js';
import type { PlayerService } from '../player/contracts.js';
import { authorizePlayerRequest, requirePlayerEntry } from '../player/http-authorization.js';
import type { TokenAccessService } from '../token-access/contracts.js';
import {
  assertTrustedBrowserMutation,
  disableResponseCaching,
  type TokenAccessCookieOptions,
} from '../token-access/http.js';

const PLAYER_PREFIX = '/api/v1/token-access/player/economy';
const identifierSchema = z.object({ id: z.uuid() }).strict();
const shopDefinitionSchema = z.object({ shopDefinitionId: z.uuid() }).strict();
const versionSchema = z.object({ versionId: z.uuid() }).strict();
const shopOfferSchema = z.object({ versionId: z.uuid(), offerId: z.uuid() }).strict();
const shopSchema = z.object({ shopSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u) }).strict();
const shopInteractionSchema = z
  .object({ interactionId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u) })
  .strict();
const shopReceiptSchema = z.object({ receiptId: shopReceiptIdSchema }).strict();
const shopEntrySchema = z.object({ versionId: z.uuid(), entryId: z.uuid() }).strict();
const workspaceQuerySchema = z
  .object({
    search: z.string().trim().max(128).default(''),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.preprocess(
      (value) => value ?? 50,
      z.coerce.number().pipe(z.union([z.literal(10), z.literal(50), z.literal(100)])),
    ),
  })
  .strict();
const policyTransitionSchema = economyVersionTransitionSchema.refine(
  (input) => input.action !== 'disable',
  { message: 'A policy cannot be disabled through the shop lifecycle action.' },
);

function params<T>(schema: z.ZodType<T>, value: unknown, code: SafeApiErrorCode): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new PublicApiError(400, code);
  return parsed.data;
}

function persistenceFailure(status: EconomyPersistenceStatus): never {
  const mapping: Record<
    EconomyPersistenceStatus,
    readonly [PublicApiError['statusCode'], SafeApiErrorCode]
  > = {
    not_found: [404, 'PLAYER_PROFILE_REQUIRED'],
    suspended: [403, 'PLAYER_SUSPENDED'],
    rename_required: [409, 'PLAYER_RENAME_REQUIRED'],
    bootstrap_required: [409, 'COZY_GAMEPLAY_BOOTSTRAP_REQUIRED'],
    rate_limited: [429, 'RATE_LIMITED'],
    maintenance: [503, 'ECONOMY_MAINTENANCE'],
    shop_unavailable: [404, 'ECONOMY_SHOP_UNAVAILABLE'],
    shop_changed: [409, 'ECONOMY_SHOP_CHANGED'],
    protected_item: [403, 'ECONOMY_ITEM_PROTECTED'],
    daily_limit: [409, 'ECONOMY_DAILY_LIMIT'],
    cooldown: [409, 'ECONOMY_COOLDOWN'],
    request_already_processed: [409, 'REQUEST_ALREADY_PROCESSED'],
    shop_offer_unavailable: [404, 'ECONOMY_SHOP_UNAVAILABLE'],
    insufficient_dust: [409, 'INSUFFICIENT_DUST'],
    inventory_full: [409, 'INVENTORY_FULL'],
    state_conflict: [409, 'GAMEPLAY_STATE_CONFLICT'],
    invalid_quantity: [400, 'INVALID_ECONOMY_QUANTITY'],
  };
  const [statusCode, code] = mapping[status];
  throw new PublicApiError(statusCode, code);
}

function shopPersistenceFailure(status: ShopPersistenceStatus): never {
  const mapping: Record<
    ShopPersistenceStatus,
    readonly [PublicApiError['statusCode'], SafeApiErrorCode]
  > = {
    not_found: [404, 'PLAYER_PROFILE_REQUIRED'],
    suspended: [403, 'PLAYER_SUSPENDED'],
    rename_required: [409, 'PLAYER_RENAME_REQUIRED'],
    bootstrap_required: [409, 'COZY_GAMEPLAY_BOOTSTRAP_REQUIRED'],
    rate_limited: [429, 'RATE_LIMITED'],
    maintenance: [503, 'ECONOMY_MAINTENANCE'],
    shop_not_found: [404, 'SHOP_NOT_FOUND'],
    shop_disabled: [503, 'SHOP_DISABLED'],
    wrong_world: [409, 'SHOP_WORLD_MISMATCH'],
    too_far: [409, 'SHOP_TOO_FAR'],
    buying_disabled: [503, 'SHOP_BUYING_DISABLED'],
    selling_disabled: [503, 'SHOP_SELLING_DISABLED'],
    catalog_changed: [409, 'ECONOMY_SHOP_CHANGED'],
    entry_not_found: [404, 'SHOP_ENTRY_NOT_FOUND'],
    entry_disabled: [409, 'SHOP_ENTRY_DISABLED'],
    item_locked: [403, 'SHOP_ENTRY_DISABLED'],
    item_disabled: [409, 'ITEM_UNAVAILABLE'],
    item_not_buyable: [409, 'SHOP_ITEM_NOT_BUYABLE'],
    item_not_sellable: [409, 'SHOP_ITEM_NOT_SELLABLE'],
    item_bound: [403, 'INVENTORY_ITEM_BOUND'],
    invalid_quantity: [400, 'INVALID_ECONOMY_QUANTITY'],
    price_changed: [409, 'SHOP_PRICE_CHANGED'],
    economy_policy_blocked: [503, 'ECONOMY_MAINTENANCE'],
    state_conflict: [409, 'GAMEPLAY_STATE_CONFLICT'],
    insufficient_dust: [409, 'INSUFFICIENT_DUST'],
    inventory_full: [409, 'INVENTORY_FULL'],
    inventory_quantity_insufficient: [409, 'INVENTORY_QUANTITY_INSUFFICIENT'],
    stock_conflict: [409, 'SHOP_STOCK_CONFLICT'],
    out_of_stock: [409, 'SHOP_OUT_OF_STOCK'],
    purchase_limit: [409, 'SHOP_PURCHASE_LIMIT_REACHED'],
    sale_limit: [409, 'SHOP_SALE_LIMIT_REACHED'],
    global_limit: [409, 'SHOP_GLOBAL_LIMIT_REACHED'],
    cooldown: [409, 'ECONOMY_COOLDOWN'],
    request_already_processed: [409, 'REQUEST_ALREADY_PROCESSED'],
    receipt_not_found: [404, 'RECEIPT_NOT_FOUND'],
    quest_not_available: [409, 'QUEST_NOT_AVAILABLE'],
    quest_already_accepted: [409, 'QUEST_ALREADY_ACCEPTED'],
    quest_objective_incomplete: [409, 'QUEST_OBJECTIVE_INCOMPLETE'],
    quest_reward_already_settled: [409, 'QUEST_REWARD_ALREADY_SETTLED'],
    quest_conflict: [409, 'GAMEPLAY_STATE_CONFLICT'],
  };
  const [statusCode, code] = mapping[status];
  throw new PublicApiError(statusCode, code);
}

async function operation<T>(invoke: () => Promise<T>): Promise<T> {
  try {
    return await invoke();
  } catch (error) {
    if (error instanceof EconomyRateLimitError) throw new PublicApiError(429, 'RATE_LIMITED');
    if (error instanceof EconomyPersistenceError)
      throw new PublicApiError(503, 'ECONOMY_UNAVAILABLE');
    throw error;
  }
}

async function authorizePlayer(
  request: FastifyRequest,
  reply: FastifyReply,
  options: {
    readonly playerService: PlayerService;
    readonly tokenAccessService: TokenAccessService;
    readonly cookie: TokenAccessCookieOptions;
  },
): Promise<string> {
  const wallet = await authorizePlayerRequest(
    request,
    reply,
    options.tokenAccessService,
    options.cookie,
  );
  const entry = await requirePlayerEntry(options.playerService, wallet, request.id, false, false);
  if (entry === undefined) throw new PublicApiError(404, 'PLAYER_PROFILE_REQUIRED');
  return wallet;
}

export function registerEconomyRoutes(
  app: FastifyInstance,
  options: {
    readonly gateway: EconomyGateway;
    readonly playerService: PlayerService;
    readonly tokenAccessService: TokenAccessService;
    readonly cookie: TokenAccessCookieOptions;
    readonly adminGateway: AdminAuthGateway;
    readonly logger: ServiceLogger;
    readonly allowedOrigins: ReadonlySet<string>;
  },
): void {
  app.get(PLAYER_PREFIX, async (request, reply) => {
    disableResponseCaching(reply);
    const wallet = await authorizePlayer(request, reply, options);
    const query = params(playerEconomyHistoryQuerySchema, request.query, 'INVALID_ECONOMY_QUERY');
    const result = await operation(() => options.gateway.playerEconomy(wallet, query, request.id));
    if (typeof result === 'string') persistenceFailure(result);
    return { success: true, data: result, requestId: request.id };
  });

  app.get(`${PLAYER_PREFIX}/shops/:shopSlug`, async (request, reply) => {
    disableResponseCaching(reply);
    const wallet = await authorizePlayer(request, reply, options);
    const { shopSlug } = params(shopSchema, request.params, 'INVALID_ECONOMY_SHOP');
    const result = await operation(() => options.gateway.playerShop(wallet, shopSlug, request.id));
    if (typeof result === 'string') persistenceFailure(result);
    return { success: true, data: result, requestId: request.id };
  });

  app.post(
    `${PLAYER_PREFIX}/shops/:shopSlug/purchase`,
    { bodyLimit: 4_096 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const wallet = await authorizePlayer(request, reply, options);
      const { shopSlug } = params(shopSchema, request.params, 'INVALID_ECONOMY_SHOP');
      const input = params(playerEconomyPurchaseSchema, request.body, 'INVALID_ECONOMY_PURCHASE');
      const result = await operation(() =>
        options.gateway.purchase(wallet, shopSlug, input, request.id),
      );
      if (typeof result === 'string') persistenceFailure(result);
      return { success: true, data: result, requestId: request.id };
    },
  );

  app.get(`${PLAYER_PREFIX}/shops/interactions/:interactionId`, async (request, reply) => {
    disableResponseCaching(reply);
    const wallet = await authorizePlayer(request, reply, options);
    const { interactionId } = params(shopInteractionSchema, request.params, 'INVALID_ECONOMY_SHOP');
    const query = params(shopWorkspaceQuerySchema, request.query, 'INVALID_ECONOMY_QUERY');
    const result = await operation(() =>
      options.gateway.shopWorkspace(wallet, interactionId, query, request.id),
    );
    if (typeof result === 'string') shopPersistenceFailure(result);
    return { success: true, data: result, requestId: request.id };
  });

  app.post(
    `${PLAYER_PREFIX}/shops/interactions/:interactionId/transactions`,
    { bodyLimit: 4_096 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const wallet = await authorizePlayer(request, reply, options);
      const { interactionId } = params(
        shopInteractionSchema,
        request.params,
        'INVALID_ECONOMY_SHOP',
      );
      const input = params(
        shopTransactionRequestV2Schema,
        request.body,
        'INVALID_ECONOMY_PURCHASE',
      );
      const result = await operation(() =>
        options.gateway.transactShop(wallet, interactionId, input, request.id),
      );
      if (typeof result === 'string') shopPersistenceFailure(result);
      return { success: true, data: result, requestId: request.id };
    },
  );

  app.get(`${PLAYER_PREFIX}/shops/interactions/:interactionId/events`, async (request, reply) => {
    disableResponseCaching(reply);
    const wallet = await authorizePlayer(request, reply, options);
    const { interactionId } = params(shopInteractionSchema, request.params, 'INVALID_ECONOMY_SHOP');
    const query = params(shopEventQuerySchema, request.query, 'INVALID_ECONOMY_QUERY');
    const result = await operation(() =>
      options.gateway.shopEvents(wallet, interactionId, query, request.id),
    );
    if (typeof result === 'string') shopPersistenceFailure(result);
    return { success: true, data: result, requestId: request.id };
  });

  app.get(`${PLAYER_PREFIX}/shop-receipts/:receiptId`, async (request, reply) => {
    disableResponseCaching(reply);
    const wallet = await authorizePlayer(request, reply, options);
    const { receiptId } = params(shopReceiptSchema, request.params, 'INVALID_ECONOMY_SHOP');
    const result = await operation(() =>
      options.gateway.shopReceipt(wallet, receiptId, request.id),
    );
    if (typeof result === 'string') shopPersistenceFailure(result);
    return { success: true, data: result, requestId: request.id };
  });

  app.post(
    `${PLAYER_PREFIX}/shops/interactions/:interactionId/tutorial/accept`,
    { bodyLimit: 1_024 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const wallet = await authorizePlayer(request, reply, options);
      const { interactionId } = params(
        shopInteractionSchema,
        request.params,
        'INVALID_ECONOMY_SHOP',
      );
      const input = params(shopTutorialMutationSchema, request.body, 'INVALID_ECONOMY_SHOP');
      const result = await operation(() =>
        options.gateway.acceptShopTutorial(wallet, interactionId, input, request.id),
      );
      if (typeof result === 'string') shopPersistenceFailure(result);
      return { success: true, data: result, requestId: request.id };
    },
  );

  app.post(
    `${PLAYER_PREFIX}/shops/interactions/:interactionId/tutorial/turn-in`,
    { bodyLimit: 1_024 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const wallet = await authorizePlayer(request, reply, options);
      const { interactionId } = params(
        shopInteractionSchema,
        request.params,
        'INVALID_ECONOMY_SHOP',
      );
      const input = params(shopTutorialTurnInSchema, request.body, 'INVALID_ECONOMY_SHOP');
      const result = await operation(() =>
        options.gateway.turnInShopTutorial(wallet, interactionId, input, request.id),
      );
      if (typeof result === 'string') shopPersistenceFailure(result);
      return { success: true, data: result, requestId: request.id };
    },
  );

  app.get('/api/v1/admin/economy', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'economy.read',
    );
    return {
      success: true,
      data: await operation(() => options.gateway.overview(identity)),
      requestId: request.id,
    };
  });

  app.get('/api/v1/admin/economy/ledger', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'economy.audit.read',
    );
    const query = params(economyLedgerQuerySchema, request.query, 'INVALID_ECONOMY_LEDGER_QUERY');
    return {
      success: true,
      data: await operation(() => options.gateway.ledger(identity, query)),
      requestId: request.id,
    };
  });

  const workspaceReads = [
    ['/api/v1/admin/economy/sources', 'sources', 'economy.settings.read'],
    ['/api/v1/admin/economy/sinks', 'sinks', 'economy.settings.read'],
    ['/api/v1/admin/economy/shops', 'shops', 'economy.shop.read'],
    ['/api/v1/admin/economy/policies', 'policies', 'economy.settings.read'],
    ['/api/v1/admin/economy/reconciliation', 'reconciliation', 'economy.audit.read'],
    ['/api/v1/admin/economy/risk', 'risk', 'economy.risk.read'],
    ['/api/v1/admin/economy/corrections', 'corrections', 'economy.read'],
    ['/api/v1/admin/economy/simulations', 'simulations', 'economy.simulation.run'],
    ['/api/v1/admin/economy/audit', 'audit', 'economy.audit.read'],
  ] as const;
  for (const [path, section, permission] of workspaceReads) {
    app.get(path, async (request, reply) => {
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        permission,
      );
      const query = params(workspaceQuerySchema, request.query, 'INVALID_ECONOMY_QUERY');
      return {
        success: true,
        data: await operation(() => options.gateway.workspace(identity, section, query)),
        requestId: request.id,
      };
    });
  }

  app.get('/api/v1/admin/economy/shops/:shopDefinitionId', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'economy.shop.read',
    );
    const { shopDefinitionId } = params(
      shopDefinitionSchema,
      request.params,
      'INVALID_ECONOMY_SHOP',
    );
    return {
      success: true,
      data: await operation(() =>
        options.gateway.workspace(identity, 'shop', { identifier: shopDefinitionId }),
      ),
      requestId: request.id,
    };
  });

  app.get('/api/v1/admin/economy/shops/:shopDefinitionId/operations', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'economy.shop.read',
    );
    const { shopDefinitionId } = params(
      shopDefinitionSchema,
      request.params,
      'INVALID_ECONOMY_SHOP',
    );
    return {
      success: true,
      data: await operation(() =>
        options.gateway.shopOperations(identity, shopDefinitionId, request.id),
      ),
      requestId: request.id,
    };
  });

  app.post(
    '/api/v1/admin/economy/policies/drafts',
    { bodyLimit: 8_192 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'economy.settings.edit',
      );
      const input = params(economyPolicyDraftSchema, request.body, 'INVALID_ECONOMY_POLICY');
      return {
        success: true,
        data: await operation(() => options.gateway.createPolicyDraft(identity, input, request.id)),
        requestId: request.id,
      };
    },
  );

  app.post(
    '/api/v1/admin/economy/policies/:versionId/transition',
    { bodyLimit: 2_048 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const rawAction =
        typeof request.body === 'object' && request.body !== null && 'action' in request.body
          ? request.body.action
          : undefined;
      const permission = ['approve', 'schedule', 'publish', 'rollback'].includes(String(rawAction))
        ? 'economy.settings.publish'
        : 'economy.settings.edit';
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        permission,
      );
      const { versionId } = params(versionSchema, request.params, 'INVALID_ECONOMY_POLICY');
      const input = params(policyTransitionSchema, request.body, 'INVALID_ECONOMY_POLICY');
      return {
        success: true,
        data: await operation(() =>
          options.gateway.transitionPolicy(identity, versionId, input, request.id),
        ),
        requestId: request.id,
      };
    },
  );

  app.post(
    '/api/v1/admin/economy/shops/:shopDefinitionId/drafts',
    { bodyLimit: 4_096 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'economy.shop.edit',
      );
      const { shopDefinitionId } = params(
        shopDefinitionSchema,
        request.params,
        'INVALID_ECONOMY_SHOP',
      );
      const input = params(economyShopDraftSchema, request.body, 'INVALID_ECONOMY_SHOP');
      return {
        success: true,
        data: await operation(() =>
          options.gateway.createShopDraft(identity, shopDefinitionId, input, request.id),
        ),
        requestId: request.id,
      };
    },
  );

  app.post(
    '/api/v1/admin/economy/shops/:shopDefinitionId/catalog-successors',
    { bodyLimit: 4_096 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'economy.shop.edit',
      );
      const { shopDefinitionId } = params(
        shopDefinitionSchema,
        request.params,
        'INVALID_ECONOMY_SHOP',
      );
      const input = params(shopCatalogSuccessorSchema, request.body, 'INVALID_ECONOMY_SHOP');
      return {
        success: true,
        data: await operation(() =>
          options.gateway.createShopCatalogSuccessor(identity, shopDefinitionId, input, request.id),
        ),
        requestId: request.id,
      };
    },
  );

  app.patch(
    '/api/v1/admin/economy/shops/versions/:versionId/entries/:entryId',
    { bodyLimit: 8_192 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'economy.shop.edit',
      );
      const { versionId, entryId } = params(
        shopEntrySchema,
        request.params,
        'INVALID_ECONOMY_SHOP',
      );
      const input = params(shopCatalogEntryUpdateSchema, request.body, 'INVALID_ECONOMY_SHOP');
      return {
        success: true,
        data: await operation(() =>
          options.gateway.updateShopCatalogEntry(identity, versionId, entryId, input, request.id),
        ),
        requestId: request.id,
      };
    },
  );

  app.post(
    '/api/v1/admin/economy/shops/versions/:versionId/entries',
    { bodyLimit: 4_096 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'economy.shop.edit',
      );
      const { versionId } = params(versionSchema, request.params, 'INVALID_ECONOMY_SHOP');
      const input = params(shopCatalogEntryCreateSchema, request.body, 'INVALID_ECONOMY_SHOP');
      return {
        success: true,
        data: await operation(() =>
          options.gateway.addShopCatalogEntry(identity, versionId, input, request.id),
        ),
        requestId: request.id,
      };
    },
  );

  app.delete(
    '/api/v1/admin/economy/shops/versions/:versionId/entries/:entryId',
    { bodyLimit: 4_096 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'economy.shop.edit',
      );
      const { versionId, entryId } = params(
        shopEntrySchema,
        request.params,
        'INVALID_ECONOMY_SHOP',
      );
      const input = params(shopCatalogEntryRemoveSchema, request.body, 'INVALID_ECONOMY_SHOP');
      return {
        success: true,
        data: await operation(() =>
          options.gateway.removeShopCatalogEntry(identity, versionId, entryId, input, request.id),
        ),
        requestId: request.id,
      };
    },
  );

  app.patch(
    '/api/v1/admin/economy/shops/:shopDefinitionId/live-ops',
    { bodyLimit: 8_192 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'economy.live_ops.manage',
      );
      const { shopDefinitionId } = params(
        shopDefinitionSchema,
        request.params,
        'INVALID_ECONOMY_SHOP',
      );
      const input = params(shopLiveOpsUpdateSchema, request.body, 'INVALID_ECONOMY_SHOP');
      return {
        success: true,
        data: await operation(() =>
          options.gateway.updateShopLiveOps(identity, shopDefinitionId, input, request.id),
        ),
        requestId: request.id,
      };
    },
  );

  app.post(
    '/api/v1/admin/economy/shops/:shopDefinitionId/restock',
    { bodyLimit: 4_096 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'economy.stock.manage',
      );
      const { shopDefinitionId } = params(
        shopDefinitionSchema,
        request.params,
        'INVALID_ECONOMY_SHOP',
      );
      const input = params(shopRestockSchema, request.body, 'INVALID_ECONOMY_SHOP');
      return {
        success: true,
        data: await operation(() =>
          options.gateway.restockShop(identity, shopDefinitionId, input, request.id),
        ),
        requestId: request.id,
      };
    },
  );

  app.post(
    '/api/v1/admin/economy/shops/:shopDefinitionId/reconciliation',
    { bodyLimit: 4_096 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'economy.reconciliation.manage',
      );
      const { shopDefinitionId } = params(
        shopDefinitionSchema,
        request.params,
        'INVALID_ECONOMY_SHOP',
      );
      const input = params(shopReconciliationRequestSchema, request.body, 'INVALID_ECONOMY_SHOP');
      return {
        success: true,
        data: await operation(() =>
          options.gateway.requestShopReconciliation(identity, shopDefinitionId, input, request.id),
        ),
        requestId: request.id,
      };
    },
  );

  app.patch(
    '/api/v1/admin/economy/shops/versions/:versionId/offers/:offerId',
    { bodyLimit: 4_096 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'economy.shop.edit',
      );
      const { versionId, offerId } = params(
        shopOfferSchema,
        request.params,
        'INVALID_ECONOMY_SHOP',
      );
      const input = params(economyShopOfferUpdateSchema, request.body, 'INVALID_ECONOMY_SHOP');
      return {
        success: true,
        data: await operation(() =>
          options.gateway.updateShopOffer(identity, versionId, offerId, input, request.id),
        ),
        requestId: request.id,
      };
    },
  );

  app.post(
    '/api/v1/admin/economy/shops/versions/:versionId/transition',
    { bodyLimit: 2_048 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const rawAction =
        typeof request.body === 'object' && request.body !== null && 'action' in request.body
          ? request.body.action
          : undefined;
      const permission = ['approve', 'schedule', 'publish', 'disable', 'rollback'].includes(
        String(rawAction),
      )
        ? 'economy.shop.publish'
        : 'economy.shop.edit';
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        permission,
      );
      const { versionId } = params(versionSchema, request.params, 'INVALID_ECONOMY_SHOP');
      const input = params(economyVersionTransitionSchema, request.body, 'INVALID_ECONOMY_SHOP');
      return {
        success: true,
        data: await operation(() =>
          options.gateway.transitionShop(identity, versionId, input, request.id),
        ),
        requestId: request.id,
      };
    },
  );

  app.post('/api/v1/admin/economy/reconciliation', { bodyLimit: 1_024 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'economy.audit.read',
    );
    const input = params(
      economyReconciliationRequestSchema,
      request.body,
      'INVALID_ECONOMY_RECONCILIATION',
    );
    return {
      success: true,
      data: await operation(() =>
        options.gateway.reconcile(identity, input.playerProfileId, request.id),
      ),
      requestId: request.id,
    };
  });

  app.post('/api/v1/admin/economy/corrections', { bodyLimit: 4_096 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'economy.correction.create',
    );
    const input = params(economyCorrectionCreateSchema, request.body, 'INVALID_ECONOMY_CORRECTION');
    return {
      success: true,
      data: await operation(() => options.gateway.createCorrection(identity, input, request.id)),
      requestId: request.id,
    };
  });

  app.post(
    '/api/v1/admin/economy/corrections/:id/review',
    { bodyLimit: 1_024 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'economy.correction.review',
      );
      const { id } = params(identifierSchema, request.params, 'INVALID_ECONOMY_CORRECTION');
      const input = params(
        economyCorrectionReviewSchema,
        request.body,
        'INVALID_ECONOMY_CORRECTION',
      );
      return {
        success: true,
        data: await operation(() =>
          options.gateway.reviewCorrection(identity, id, input.action, request.id),
        ),
        requestId: request.id,
      };
    },
  );

  app.post(
    '/api/v1/admin/economy/risk/:id/review',
    { bodyLimit: 1_024 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'economy.risk.review',
      );
      const { id } = params(identifierSchema, request.params, 'INVALID_ECONOMY_RISK_REVIEW');
      const input = params(economyRiskReviewSchema, request.body, 'INVALID_ECONOMY_RISK_REVIEW');
      return {
        success: true,
        data: await operation(() =>
          options.gateway.reviewRisk(identity, id, input.status, request.id),
        ),
        requestId: request.id,
      };
    },
  );

  app.post('/api/v1/admin/economy/simulations', { bodyLimit: 16_384 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'economy.simulation.run',
    );
    const input = params(economySimulationInputSchema, request.body, 'INVALID_ECONOMY_SIMULATION');
    return {
      success: true,
      data: await operation(() => options.gateway.simulate(identity, input, request.id)),
      requestId: request.id,
    };
  });
}
