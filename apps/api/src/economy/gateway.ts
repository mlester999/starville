import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import {
  dustLedgerEntrySchema,
  economyRegistryKeySchema,
  economyRegistryOperationKeySchema,
  economyPurchaseRequestSchema,
  economyPurchaseReceiptSchema,
  economyShopOfferSchema,
  economyShopSchema,
  shopEventPageSchema,
  shopReceiptSchema,
  shopTransactionRequestV2Schema,
  shopTransactionResultSchema,
  shopTutorialMutationSchema,
  shopTutorialSchema,
  shopTutorialTurnInSchema,
  shopWorkspaceSchema,
} from '@starville/economy';
import {
  economySimulationInputSchema,
  economySimulationResultSchema,
  runEconomySimulation,
  type EconomySimulationInput,
} from '@starville/economy-simulation';

import type { AdminDatabaseIdentity } from '../contracts.js';

const persistenceStatusSchema = z.enum([
  'not_found',
  'suspended',
  'rename_required',
  'bootstrap_required',
  'rate_limited',
  'maintenance',
  'shop_unavailable',
  'shop_changed',
  'protected_item',
  'daily_limit',
  'cooldown',
  'request_already_processed',
  'shop_offer_unavailable',
  'insufficient_dust',
  'inventory_full',
  'state_conflict',
  'invalid_quantity',
]);
export type EconomyPersistenceStatus = z.infer<typeof persistenceStatusSchema>;

const shopPersistenceStatusSchema = z.enum([
  'not_found',
  'suspended',
  'rename_required',
  'bootstrap_required',
  'rate_limited',
  'maintenance',
  'shop_not_found',
  'shop_disabled',
  'wrong_world',
  'too_far',
  'buying_disabled',
  'selling_disabled',
  'catalog_changed',
  'entry_not_found',
  'entry_disabled',
  'item_locked',
  'item_disabled',
  'item_not_buyable',
  'item_not_sellable',
  'item_bound',
  'invalid_quantity',
  'price_changed',
  'economy_policy_blocked',
  'state_conflict',
  'insufficient_dust',
  'inventory_full',
  'inventory_quantity_insufficient',
  'stock_conflict',
  'out_of_stock',
  'purchase_limit',
  'sale_limit',
  'global_limit',
  'cooldown',
  'request_already_processed',
  'receipt_not_found',
  'quest_not_available',
  'quest_already_accepted',
  'quest_objective_incomplete',
  'quest_reward_already_settled',
  'quest_conflict',
]);
export type ShopPersistenceStatus = z.infer<typeof shopPersistenceStatusSchema>;

const loadedShopWorkspaceSchema = z
  .object({ status: z.literal('loaded'), workspace: shopWorkspaceSchema })
  .strict();
const loadedShopReceiptSchema = z
  .object({
    status: z.literal('loaded'),
    receipt: shopReceiptSchema,
    tutorial: shopTutorialSchema.nullable(),
  })
  .strict();
const loadedShopEventPageSchema = shopEventPageSchema
  .extend({ status: z.literal('loaded') })
  .strict();
const shopTutorialResultSchema = z
  .object({
    status: z.enum(['updated', 'replayed']),
    replayed: z.boolean(),
    tutorial: shopTutorialSchema,
    announcement: z.string().trim().min(1).max(280),
  })
  .strict();

const loadedEconomySchema = z
  .object({
    status: z.literal('loaded'),
    dustBalance: z.number().int().nonnegative(),
    dustStateVersion: z.number().int().positive(),
    policyVersion: z.number().int().positive(),
    history: z.array(dustLedgerEntrySchema).max(100),
    nextCursor: z.number().int().positive().nullable(),
    generatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type PlayerEconomy = Omit<z.infer<typeof loadedEconomySchema>, 'status'>;

const loadedShopSchema = z
  .object({
    status: z.literal('loaded'),
    availability: z.enum(['open', 'closed']).optional(),
    shop: economyShopSchema.omit({ offers: true }),
    offers: z.array(economyShopOfferSchema).max(100),
    generatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type PlayerEconomyShop = Omit<z.infer<typeof loadedShopSchema>, 'status'>;

export const playerEconomyHistoryQuerySchema = z
  .object({
    before: z.preprocess(
      (value) => (value === undefined || value === '' ? null : Number(value)),
      z.number().int().positive().nullable(),
    ),
    limit: z.preprocess(
      (value) => (value === undefined ? 20 : Number(value)),
      z.union([z.literal(10), z.literal(20), z.literal(50), z.literal(100)]),
    ),
  })
  .strict();
export type PlayerEconomyHistoryQuery = z.infer<typeof playerEconomyHistoryQuerySchema>;

export const playerEconomyPurchaseSchema = economyPurchaseRequestSchema.extend({
  expectedDustStateVersion: z.number().int().positive(),
  expectedInventoryStateVersion: z.number().int().positive(),
});
export type PlayerEconomyPurchase = z.infer<typeof playerEconomyPurchaseSchema>;

const purchaseSuccessSchema = z
  .object({
    status: z.enum(['updated', 'replayed']),
    replayed: z.boolean(),
    transactionId: z.uuid().optional(),
    operation: z.literal('buy').optional(),
    itemSlug: z.string().optional(),
    quantity: z.number().int().positive().optional(),
    dustDelta: z.number().int().negative().optional(),
    dustBalance: z.number().int().nonnegative().optional(),
    dustStateVersion: z.number().int().positive().optional(),
    inventoryStateVersion: z.number().int().positive().optional(),
    receipt: economyPurchaseReceiptSchema.omit({
      shopKey: true,
      dustBalance: true,
      replayed: true,
    }),
  })
  .strict();
export type EconomyPurchaseResult = z.infer<typeof purchaseSuccessSchema>;

const economyOverviewSchema = z
  .object({
    generatedAt: z.iso.datetime({ offset: true }),
    dust: z
      .object({
        totalSupply: z.number().int().nonnegative(),
        accountCount: z.number().int().nonnegative(),
        fundedPlayerCount: z.number().int().nonnegative(),
        averageBalance: z.number().nonnegative(),
        medianBalance: z.number().int().nonnegative(),
        maximumBalance: z.number().int().nonnegative(),
        ledgerEntryCount: z.number().int().nonnegative(),
        lifetimeCreated: z.number().int().nonnegative(),
        lifetimeDestroyed: z.number().int().nonnegative(),
        created30d: z.number().int().nonnegative(),
        destroyed30d: z.number().int().nonnegative(),
        createdToday: z.number().int().nonnegative(),
        destroyedToday: z.number().int().nonnegative(),
        created7d: z.number().int().nonnegative(),
        destroyed7d: z.number().int().nonnegative(),
        dailyEmissionEstimate: z.number().nonnegative(),
        dailySinkEstimate: z.number().nonnegative(),
        sourceToSinkRatio: z.number().nonnegative().nullable(),
        inactiveBalancePercentage: z.number().min(0).max(100).nullable(),
      })
      .strict(),
    openRiskSignals: z.number().int().nonnegative(),
    openCorrections: z.number().int().nonnegative(),
    reconciliationMismatches: z.number().int().nonnegative(),
    sources: z.array(
      z
        .object({
          key: economyRegistryKeySchema,
          operationKey: economyRegistryOperationKeySchema,
          status: z.string(),
          version: z.number().int().positive(),
          lifetimeAmount: z.number().int().nonnegative(),
          amount30d: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    sinks: z.array(
      z
        .object({
          key: economyRegistryKeySchema,
          operationKey: economyRegistryOperationKeySchema,
          status: z.string(),
          version: z.number().int().positive(),
          lifetimeAmount: z.number().int().nonnegative(),
          amount30d: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    starUtility: z.array(z.record(z.string(), z.unknown())).max(20),
    activePolicy: z
      .object({
        id: z.uuid(),
        versionNumber: z.number().int().positive(),
        status: z.string(),
        effectiveAt: z.iso.datetime({ offset: true }),
      })
      .strict()
      .nullable(),
    shops: z
      .object({
        active: z.number().int().nonnegative(),
        disabled: z.number().int().nonnegative(),
        scheduled: z.number().int().nonnegative(),
      })
      .strict(),
    latestSimulation: z
      .object({
        runId: z.uuid(),
        candidate: z.string().min(3).max(80),
        sourceToSinkRatio: z.number().nonnegative(),
        createdAt: z.iso.datetime({ offset: true }),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type EconomyOverview = z.infer<typeof economyOverviewSchema>;

export const economyLedgerQuerySchema = z
  .object({
    search: z.string().trim().max(128).default(''),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.preprocess(
      (value) => value ?? 10,
      z.coerce.number().pipe(z.union([z.literal(10), z.literal(50), z.literal(100)])),
    ),
    direction: z.enum(['credit', 'debit']).optional(),
    sourceKey: economyRegistryKeySchema.optional(),
    sinkKey: economyRegistryKeySchema.optional(),
    dateFrom: z.iso.datetime({ offset: true }).optional(),
    dateTo: z.iso.datetime({ offset: true }).optional(),
    minimumAmount: z.coerce.number().int().min(0).max(1_000_000).optional(),
    maximumAmount: z.coerce.number().int().min(0).max(1_000_000).optional(),
    status: z.literal('completed').optional(),
  })
  .strict()
  .refine(
    (query) =>
      query.minimumAmount === undefined ||
      query.maximumAmount === undefined ||
      query.minimumAmount <= query.maximumAmount,
    { message: 'Minimum amount cannot exceed maximum amount.' },
  )
  .refine(
    (query) =>
      query.dateFrom === undefined ||
      query.dateTo === undefined ||
      Date.parse(query.dateFrom) <= Date.parse(query.dateTo),
    { message: 'Start date cannot be after end date.' },
  );
export type EconomyLedgerQuery = z.infer<typeof economyLedgerQuerySchema>;

const economyLedgerPageSchema = z
  .object({
    items: z.array(z.record(z.string(), z.unknown())).max(100),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();

export const economyReconciliationRequestSchema = z
  .object({ playerProfileId: z.uuid().nullable().default(null) })
  .strict();
export const economyCorrectionCreateSchema = z
  .object({
    playerProfileId: z.uuid(),
    delta: z
      .number()
      .int()
      .min(-1_000_000)
      .max(1_000_000)
      .refine((value) => value !== 0),
    reasonCategory: z.enum(['support_repair', 'incident_repair', 'migration_repair', 'refund']),
    explanation: z.string().trim().min(20).max(1_000),
  })
  .strict();
export const economyCorrectionReviewSchema = z
  .object({ action: z.enum(['approve', 'reject']) })
  .strict();
export const economyRiskReviewSchema = z
  .object({ status: z.enum(['reviewing', 'dismissed', 'confirmed', 'resolved']) })
  .strict();

export const economyPolicyDraftSchema = z
  .object({
    baseVersionId: z.uuid(),
    economyEnabled: z.boolean(),
    purchasesEnabled: z.boolean(),
    rewardsEnabled: z.boolean(),
    correctionsEnabled: z.boolean(),
    starterGrant: z.number().int().min(0).max(10_000),
    beginnerProtectionHours: z.number().int().min(0).max(720),
    lowValueCorrectionLimit: z.number().int().min(1).max(100_000),
    highValueCorrectionLimit: z.number().int().min(1).max(1_000_000),
    purchaseRateLimitPerMinute: z.number().int().min(1).max(60),
    historyRetentionDays: z.number().int().min(30).max(2_555),
    riskReviewThreshold: z.number().min(0).max(100),
    effectiveAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .refine((input) => input.lowValueCorrectionLimit < input.highValueCorrectionLimit, {
    message: 'Low-value threshold must be below the high-value threshold.',
  });

export const economyVersionTransitionSchema = z
  .object({
    action: z.enum([
      'validate',
      'submit_review',
      'approve',
      'schedule',
      'publish',
      'disable',
      'rollback',
    ]),
    expectedRevision: z.number().int().positive(),
    effectiveAt: z.iso.datetime({ offset: true }).nullable().default(null),
  })
  .strict()
  .refine((input) => input.action !== 'schedule' || input.effectiveAt !== null, {
    message: 'Scheduling requires an effective time.',
  });

export const economyShopDraftSchema = z
  .object({
    expectedActiveVersionId: z.uuid(),
    name: z.string().trim().min(3).max(80),
    description: z.string().trim().min(3).max(280),
    effectiveAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const economyShopOfferUpdateSchema = z
  .object({
    expectedShopRevision: z.number().int().positive(),
    unitPrice: z.number().int().min(1).max(1_000_000),
    maximumQuantity: z.number().int().min(1).max(99),
    dailyLimit: z.number().int().min(1).max(999),
    cooldownSeconds: z.number().int().min(0).max(86_400),
    enabled: z.boolean(),
  })
  .strict();

export const shopWorkspaceQuerySchema = z
  .object({
    before: z.iso.datetime({ offset: true }).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const shopEventQuerySchema = z
  .object({
    after: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const shopCatalogSuccessorSchema = z
  .object({
    expectedActiveVersionId: z.uuid(),
    name: z.string().trim().min(3).max(80),
    description: z.string().trim().min(3).max(280),
    reason: z.string().trim().min(12).max(500),
  })
  .strict();
export const shopCatalogEntryCreateSchema = z
  .object({
    offerId: z.uuid(),
    expectedVersionRevision: z.number().int().positive(),
    reason: z.string().trim().min(12).max(500),
  })
  .strict();
export const shopCatalogEntryRemoveSchema = z
  .object({
    expectedVersionRevision: z.number().int().positive(),
    expectedEntryRevision: z.number().int().positive(),
    reason: z.string().trim().min(12).max(500),
  })
  .strict();
export const shopCatalogEntryUpdateSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    configuration: z
      .object({
        buyEnabled: z.boolean().optional(),
        sellEnabled: z.boolean().optional(),
        buyPrice: z.number().int().min(1).max(1_000_000).optional(),
        sellPrice: z.number().int().min(1).max(1_000_000).optional(),
        stockMode: z
          .enum(['unlimited', 'global_limited', 'per_player_limited', 'hybrid'])
          .optional(),
        restockMode: z.enum(['none', 'fixed_interval', 'daily_utc', 'manual']).optional(),
        maximumStock: z.number().int().min(1).max(1_000_000).optional(),
        restockAmount: z.number().int().min(1).max(1_000_000).optional(),
        restockIntervalSeconds: z.number().int().min(60).max(2_592_000).optional(),
        playerBuyDailyLimit: z.number().int().min(1).max(9_999).optional(),
        playerSellDailyLimit: z.number().int().min(1).max(9_999).optional(),
        eligibilityRule: z
          .enum(['ordinary_gameplay', 'phase11a_complete', 'phase11b_complete', 'tutorial_only'])
          .optional(),
        displayOrder: z.number().int().min(1).max(1_000).optional(),
        enabled: z.boolean().optional(),
      })
      .strict(),
    reason: z.string().trim().min(12).max(500),
  })
  .strict();
export const shopLiveOpsUpdateSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    configuration: z
      .object({
        accessEnabled: z.boolean().optional(),
        buyingEnabled: z.boolean().optional(),
        sellingEnabled: z.boolean().optional(),
        stockDecrementEnabled: z.boolean().optional(),
        restockEnabled: z.boolean().optional(),
        tutorialObjectivesEnabled: z.boolean().optional(),
        tutorialRewardsEnabled: z.boolean().optional(),
        saleDustIssuanceEnabled: z.boolean().optional(),
        globalDailySaleDustCap: z.number().int().min(1).max(1_000_000).optional(),
        maintenanceMessage: z.string().trim().min(3).max(280).optional(),
      })
      .strict(),
    reason: z.string().trim().min(12).max(1_000),
  })
  .strict();
export const shopRestockSchema = z
  .object({
    catalogVersionId: z.uuid(),
    entryId: z.uuid(),
    expectedStockRevision: z.number().int().positive(),
    quantity: z.number().int().min(1).max(1_000_000),
    reason: z.string().trim().min(12).max(1_000),
  })
  .strict();
export const shopReconciliationRequestSchema = z
  .object({
    transactionId: z.uuid(),
    reconciliationType: z.enum([
      'settlement_mismatch',
      'receipt_mismatch',
      'stock_mismatch',
      'limit_mismatch',
      'stuck_transaction',
    ]),
    reason: z.string().trim().min(12).max(1_000),
  })
  .strict();

export const economyWorkspaceSectionSchema = z.enum([
  'sources',
  'sinks',
  'shops',
  'shop',
  'policies',
  'reconciliation',
  'risk',
  'corrections',
  'simulations',
  'audit',
]);
export type EconomyWorkspaceSection = z.infer<typeof economyWorkspaceSectionSchema>;
const economyWorkspacePayloadSchema = z.record(z.string(), z.unknown());

export interface EconomyGateway {
  playerEconomy(
    walletAddress: string,
    query: PlayerEconomyHistoryQuery,
    requestId: string,
  ): Promise<PlayerEconomy | EconomyPersistenceStatus>;
  playerShop(
    walletAddress: string,
    shopSlug: string,
    requestId: string,
  ): Promise<PlayerEconomyShop | EconomyPersistenceStatus>;
  purchase(
    walletAddress: string,
    shopSlug: string,
    input: PlayerEconomyPurchase,
    requestId: string,
  ): Promise<EconomyPurchaseResult | EconomyPersistenceStatus>;
  shopWorkspace(
    walletAddress: string,
    interactionId: string,
    query: z.infer<typeof shopWorkspaceQuerySchema>,
    requestId: string,
  ): Promise<z.infer<typeof shopWorkspaceSchema> | ShopPersistenceStatus>;
  transactShop(
    walletAddress: string,
    interactionId: string,
    input: z.infer<typeof shopTransactionRequestV2Schema>,
    requestId: string,
  ): Promise<z.infer<typeof shopTransactionResultSchema> | ShopPersistenceStatus>;
  shopEvents(
    walletAddress: string,
    interactionId: string,
    query: z.infer<typeof shopEventQuerySchema>,
    requestId: string,
  ): Promise<z.infer<typeof shopEventPageSchema> | ShopPersistenceStatus>;
  shopReceipt(
    walletAddress: string,
    receiptId: string,
    requestId: string,
  ): Promise<
    | {
        readonly receipt: z.infer<typeof shopReceiptSchema>;
        readonly tutorial: z.infer<typeof shopTutorialSchema> | null;
      }
    | ShopPersistenceStatus
  >;
  acceptShopTutorial(
    walletAddress: string,
    interactionId: string,
    input: z.infer<typeof shopTutorialMutationSchema>,
    requestId: string,
  ): Promise<z.infer<typeof shopTutorialResultSchema> | ShopPersistenceStatus>;
  turnInShopTutorial(
    walletAddress: string,
    interactionId: string,
    input: z.infer<typeof shopTutorialTurnInSchema>,
    requestId: string,
  ): Promise<z.infer<typeof shopTutorialResultSchema> | ShopPersistenceStatus>;
  overview(identity: AdminDatabaseIdentity): Promise<EconomyOverview>;
  ledger(identity: AdminDatabaseIdentity, query: EconomyLedgerQuery): Promise<unknown>;
  workspace(
    identity: AdminDatabaseIdentity,
    section: EconomyWorkspaceSection,
    options?: Readonly<{
      identifier?: string;
      search?: string;
      page?: number;
      pageSize?: 10 | 50 | 100;
    }>,
  ): Promise<Record<string, unknown>>;
  reconcile(
    identity: AdminDatabaseIdentity,
    playerProfileId: string | null,
    requestId: string,
  ): Promise<unknown>;
  createCorrection(
    identity: AdminDatabaseIdentity,
    input: z.infer<typeof economyCorrectionCreateSchema>,
    requestId: string,
  ): Promise<unknown>;
  reviewCorrection(
    identity: AdminDatabaseIdentity,
    correctionId: string,
    action: 'approve' | 'reject',
    requestId: string,
  ): Promise<unknown>;
  reviewRisk(
    identity: AdminDatabaseIdentity,
    signalId: string,
    status: z.infer<typeof economyRiskReviewSchema>['status'],
    requestId: string,
  ): Promise<unknown>;
  simulate(
    identity: AdminDatabaseIdentity,
    input: EconomySimulationInput,
    requestId: string,
  ): Promise<ReturnType<typeof runEconomySimulation> & { readonly runId: string }>;
  createPolicyDraft(
    identity: AdminDatabaseIdentity,
    input: z.infer<typeof economyPolicyDraftSchema>,
    requestId: string,
  ): Promise<unknown>;
  transitionPolicy(
    identity: AdminDatabaseIdentity,
    versionId: string,
    input: z.infer<typeof economyVersionTransitionSchema>,
    requestId: string,
  ): Promise<unknown>;
  createShopDraft(
    identity: AdminDatabaseIdentity,
    shopDefinitionId: string,
    input: z.infer<typeof economyShopDraftSchema>,
    requestId: string,
  ): Promise<unknown>;
  updateShopOffer(
    identity: AdminDatabaseIdentity,
    shopVersionId: string,
    offerId: string,
    input: z.infer<typeof economyShopOfferUpdateSchema>,
    requestId: string,
  ): Promise<unknown>;
  transitionShop(
    identity: AdminDatabaseIdentity,
    shopVersionId: string,
    input: z.infer<typeof economyVersionTransitionSchema>,
    requestId: string,
  ): Promise<unknown>;
  shopOperations(
    identity: AdminDatabaseIdentity,
    shopDefinitionId: string,
    requestId: string,
  ): Promise<Record<string, unknown>>;
  createShopCatalogSuccessor(
    identity: AdminDatabaseIdentity,
    shopDefinitionId: string,
    input: z.infer<typeof shopCatalogSuccessorSchema>,
    requestId: string,
  ): Promise<unknown>;
  addShopCatalogEntry(
    identity: AdminDatabaseIdentity,
    versionId: string,
    input: z.infer<typeof shopCatalogEntryCreateSchema>,
    requestId: string,
  ): Promise<unknown>;
  updateShopCatalogEntry(
    identity: AdminDatabaseIdentity,
    versionId: string,
    entryId: string,
    input: z.infer<typeof shopCatalogEntryUpdateSchema>,
    requestId: string,
  ): Promise<unknown>;
  removeShopCatalogEntry(
    identity: AdminDatabaseIdentity,
    versionId: string,
    entryId: string,
    input: z.infer<typeof shopCatalogEntryRemoveSchema>,
    requestId: string,
  ): Promise<unknown>;
  updateShopLiveOps(
    identity: AdminDatabaseIdentity,
    shopDefinitionId: string,
    input: z.infer<typeof shopLiveOpsUpdateSchema>,
    requestId: string,
  ): Promise<unknown>;
  restockShop(
    identity: AdminDatabaseIdentity,
    shopDefinitionId: string,
    input: z.infer<typeof shopRestockSchema>,
    requestId: string,
  ): Promise<unknown>;
  requestShopReconciliation(
    identity: AdminDatabaseIdentity,
    shopDefinitionId: string,
    input: z.infer<typeof shopReconciliationRequestSchema>,
    requestId: string,
  ): Promise<unknown>;
}

export class EconomyPersistenceError extends Error {
  public constructor(readonly operation: string) {
    super('Economy persistence is unavailable.');
    this.name = 'EconomyPersistenceError';
  }
}

export class EconomyRateLimitError extends Error {
  public constructor(readonly operation: string) {
    super('Economy operation rate limit reached.');
    this.name = 'EconomyRateLimitError';
  }
}

function identityParameters(identity: AdminDatabaseIdentity) {
  return {
    p_user_id: identity.userId,
    p_auth_session_id: identity.authSessionId,
    p_assurance_level: identity.assuranceLevel,
  };
}

async function rpc(client: SupabaseClient, operation: string, parameters: Record<string, unknown>) {
  const { data, error } = await client.rpc(operation, parameters);
  if (error !== null) throw new EconomyPersistenceError(operation);
  return data;
}

function adminResult(operation: string, value: unknown): unknown {
  if (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    value.status === 'rate_limited'
  ) {
    throw new EconomyRateLimitError(operation);
  }
  return value;
}

function status(value: unknown): EconomyPersistenceStatus | undefined {
  if (typeof value !== 'object' || value === null || !('status' in value)) return undefined;
  const parsed = persistenceStatusSchema.safeParse(value.status);
  return parsed.success ? parsed.data : undefined;
}

function shopStatus(value: unknown): ShopPersistenceStatus | undefined {
  if (typeof value !== 'object' || value === null || !('status' in value)) return undefined;
  const parsed = shopPersistenceStatusSchema.safeParse(value.status);
  return parsed.success ? parsed.data : undefined;
}

export function createSupabaseEconomyGateway(client: SupabaseClient): EconomyGateway {
  return {
    async playerEconomy(walletAddress, query, requestId) {
      const value = await rpc(client, 'get_player_economy', {
        p_wallet_address: walletAddress,
        p_before_entry_number: query.before,
        p_limit: query.limit,
        p_request_id: requestId,
      });
      const failure = status(value);
      if (failure !== undefined) return failure;
      const parsed = loadedEconomySchema.parse(value);
      const { status: _status, ...result } = parsed;
      void _status;
      return result;
    },
    async playerShop(walletAddress, shopSlug, requestId) {
      const value = await rpc(client, 'get_player_economy_shop', {
        p_wallet_address: walletAddress,
        p_shop_slug: shopSlug,
        p_request_id: requestId,
      });
      const failure = status(value);
      if (failure !== undefined) return failure;
      const parsed = loadedShopSchema.parse(value);
      const { status: _status, ...result } = parsed;
      void _status;
      return result;
    },
    async purchase(walletAddress, shopSlug, input, requestId) {
      const value = await rpc(client, 'purchase_player_economy_shop', {
        p_wallet_address: walletAddress,
        p_shop_slug: shopSlug,
        p_offer_id: input.offerId,
        p_quantity: input.quantity,
        p_expected_unit_price: input.expectedUnitPrice,
        p_expected_shop_version_id: input.expectedShopVersionId,
        p_expected_shop_revision: input.expectedShopRevision,
        p_expected_dust_state_version: input.expectedDustStateVersion,
        p_expected_inventory_state_version: input.expectedInventoryStateVersion,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      });
      const failure = status(value);
      if (failure !== undefined) return failure;
      return purchaseSuccessSchema.parse(value);
    },
    async shopWorkspace(walletAddress, interactionId, query, requestId) {
      const value = await rpc(client, 'get_player_shop_workspace', {
        p_wallet_address: walletAddress,
        p_shop_interaction_id: interactionId,
        p_receipt_limit: query.limit,
        p_before: query.before ?? null,
        p_request_id: requestId,
      });
      const failure = shopStatus(value);
      if (failure !== undefined) return failure;
      return loadedShopWorkspaceSchema.parse(value).workspace;
    },
    async transactShop(walletAddress, interactionId, rawInput, requestId) {
      const input = shopTransactionRequestV2Schema.parse(rawInput);
      const value = await rpc(client, 'execute_player_shop_transaction', {
        p_wallet_address: walletAddress,
        p_shop_interaction_id: interactionId,
        p_catalog_entry_id: input.entryId,
        p_direction: input.direction,
        p_quantity: input.quantity,
        p_expected_unit_price: input.expectedUnitPrice,
        p_expected_catalog_version_id: input.expectedCatalogVersionId,
        p_expected_catalog_revision: input.expectedCatalogRevision,
        p_expected_entry_revision: input.expectedEntryRevision,
        p_expected_stock_revision: input.expectedStockRevision,
        p_expected_dust_state_version: input.expectedDustStateVersion,
        p_expected_inventory_state_version: input.expectedInventoryStateVersion,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      });
      const failure = shopStatus(value);
      if (failure !== undefined) return failure;
      return shopTransactionResultSchema.parse(value);
    },
    async shopEvents(walletAddress, interactionId, query, requestId) {
      const value = await rpc(client, 'get_player_shop_events', {
        p_wallet_address: walletAddress,
        p_shop_interaction_id: interactionId,
        p_after_event_number: query.after,
        p_limit: query.limit,
        p_request_id: requestId,
      });
      const failure = shopStatus(value);
      if (failure !== undefined) return failure;
      const { status: _status, ...result } = loadedShopEventPageSchema.parse(value);
      void _status;
      return result;
    },
    async shopReceipt(walletAddress, receiptId, requestId) {
      const value = await rpc(client, 'get_player_shop_receipt', {
        p_wallet_address: walletAddress,
        p_public_receipt_id: receiptId,
        p_request_id: requestId,
      });
      const failure = shopStatus(value);
      if (failure !== undefined) return failure;
      const parsed = loadedShopReceiptSchema.parse(value);
      return { receipt: parsed.receipt, tutorial: parsed.tutorial };
    },
    async acceptShopTutorial(walletAddress, interactionId, rawInput, requestId) {
      const input = shopTutorialMutationSchema.parse(rawInput);
      const value = await rpc(client, 'accept_player_shop_tutorial', {
        p_wallet_address: walletAddress,
        p_shop_interaction_id: interactionId,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      });
      const failure = shopStatus(value);
      if (failure !== undefined) return failure;
      return shopTutorialResultSchema.parse(value);
    },
    async turnInShopTutorial(walletAddress, interactionId, rawInput, requestId) {
      const input = shopTutorialTurnInSchema.parse(rawInput);
      const value = await rpc(client, 'turn_in_player_shop_tutorial', {
        p_wallet_address: walletAddress,
        p_shop_interaction_id: interactionId,
        p_expected_quest_state_version: input.expectedQuestStateVersion,
        p_idempotency_key: input.idempotencyKey,
        p_request_id: requestId,
      });
      const failure = shopStatus(value);
      if (failure !== undefined) return failure;
      return shopTutorialResultSchema.parse(value);
    },
    async overview(identity) {
      return economyOverviewSchema.parse(
        adminResult(
          'get_admin_economy_workspace',
          await rpc(client, 'get_admin_economy_workspace', {
            ...identityParameters(identity),
            p_section: 'overview',
            p_identifier: null,
            p_search: '',
            p_page: 1,
            p_page_size: 10,
          }),
        ),
      );
    },
    async ledger(identity, query) {
      return economyLedgerPageSchema.parse(
        adminResult(
          'get_admin_economy_ledger_filtered',
          await rpc(client, 'get_admin_economy_ledger_filtered', {
            ...identityParameters(identity),
            p_search: query.search,
            p_page: query.page,
            p_page_size: query.pageSize,
            p_direction: query.direction ?? null,
            p_source_key: query.sourceKey ?? null,
            p_sink_key: query.sinkKey ?? null,
            p_date_from: query.dateFrom ?? null,
            p_date_to: query.dateTo ?? null,
            p_minimum_amount: query.minimumAmount ?? null,
            p_maximum_amount: query.maximumAmount ?? null,
            p_status: query.status ?? null,
          }),
        ),
      );
    },
    async workspace(identity, section, options = {}) {
      return economyWorkspacePayloadSchema.parse(
        adminResult(
          'get_admin_economy_workspace',
          await rpc(client, 'get_admin_economy_workspace', {
            ...identityParameters(identity),
            p_section: economyWorkspaceSectionSchema.parse(section),
            p_identifier: options.identifier ?? null,
            p_search: options.search ?? '',
            p_page: options.page ?? 1,
            p_page_size: options.pageSize ?? 50,
          }),
        ),
      );
    },
    async reconcile(identity, playerProfileId, requestId) {
      return adminResult(
        'run_admin_economy_reconciliation',
        await rpc(client, 'run_admin_economy_reconciliation', {
          ...identityParameters(identity),
          p_player_profile_id: playerProfileId,
          p_request_id: requestId,
        }),
      );
    },
    async createCorrection(identity, input, requestId) {
      return adminResult(
        'create_admin_economy_correction',
        await rpc(client, 'create_admin_economy_correction', {
          ...identityParameters(identity),
          p_player_profile_id: input.playerProfileId,
          p_delta: input.delta,
          p_reason_category: input.reasonCategory,
          p_explanation: input.explanation,
          p_request_id: requestId,
        }),
      );
    },
    async reviewCorrection(identity, correctionId, action, requestId) {
      return adminResult(
        'review_admin_economy_correction',
        await rpc(client, 'review_admin_economy_correction', {
          ...identityParameters(identity),
          p_correction_id: correctionId,
          p_action: action,
          p_request_id: requestId,
        }),
      );
    },
    async reviewRisk(identity, signalId, riskStatus, requestId) {
      return adminResult(
        'review_admin_economy_risk',
        await rpc(client, 'review_admin_economy_risk', {
          ...identityParameters(identity),
          p_signal_id: signalId,
          p_status: riskStatus,
          p_request_id: requestId,
        }),
      );
    },
    async simulate(identity, rawInput, requestId) {
      const input = economySimulationInputSchema.parse(rawInput);
      const result = economySimulationResultSchema.parse(runEconomySimulation(input));
      const record = z
        .object({
          runId: z.uuid(),
          createdAt: z.iso.datetime({ offset: true }),
          playerBalancesMutated: z.literal(false),
        })
        .strict()
        .parse(
          adminResult(
            'record_admin_economy_simulation',
            await rpc(client, 'record_admin_economy_simulation', {
              ...identityParameters(identity),
              p_seed: input.seed,
              p_player_count: input.playerCount,
              p_duration_days: input.durationDays,
              p_input: input,
              p_result: result,
              p_request_id: requestId,
            }),
          ),
        );
      return { ...result, runId: record.runId };
    },
    async createPolicyDraft(identity, rawInput, requestId) {
      const input = economyPolicyDraftSchema.parse(rawInput);
      return adminResult(
        'create_admin_economy_policy_draft',
        await rpc(client, 'create_admin_economy_policy_draft', {
          ...identityParameters(identity),
          p_base_version_id: input.baseVersionId,
          p_economy_enabled: input.economyEnabled,
          p_purchases_enabled: input.purchasesEnabled,
          p_rewards_enabled: input.rewardsEnabled,
          p_corrections_enabled: input.correctionsEnabled,
          p_starter_grant: input.starterGrant,
          p_beginner_protection_hours: input.beginnerProtectionHours,
          p_low_value_correction_limit: input.lowValueCorrectionLimit,
          p_high_value_correction_limit: input.highValueCorrectionLimit,
          p_purchase_rate_limit_per_minute: input.purchaseRateLimitPerMinute,
          p_history_retention_days: input.historyRetentionDays,
          p_risk_review_threshold: input.riskReviewThreshold,
          p_effective_at: input.effectiveAt,
          p_request_id: requestId,
        }),
      );
    },
    async transitionPolicy(identity, versionId, rawInput, requestId) {
      const input = economyVersionTransitionSchema.parse(rawInput);
      if (input.action === 'disable') throw new EconomyPersistenceError('invalid_policy_action');
      return adminResult(
        'operate_admin_economy_policy_version',
        await rpc(client, 'operate_admin_economy_policy_version', {
          ...identityParameters(identity),
          p_version_id: versionId,
          p_expected_revision: input.expectedRevision,
          p_action: input.action,
          p_effective_at: input.effectiveAt,
          p_request_id: requestId,
        }),
      );
    },
    async createShopDraft(identity, shopDefinitionId, rawInput, requestId) {
      const input = economyShopDraftSchema.parse(rawInput);
      return adminResult(
        'create_admin_economy_shop_draft',
        await rpc(client, 'create_admin_economy_shop_draft', {
          ...identityParameters(identity),
          p_shop_definition_id: shopDefinitionId,
          p_expected_active_version_id: input.expectedActiveVersionId,
          p_name: input.name,
          p_description: input.description,
          p_effective_at: input.effectiveAt,
          p_request_id: requestId,
        }),
      );
    },
    async updateShopOffer(identity, shopVersionId, offerId, rawInput, requestId) {
      const input = economyShopOfferUpdateSchema.parse(rawInput);
      return adminResult(
        'update_admin_economy_shop_offer',
        await rpc(client, 'update_admin_economy_shop_offer', {
          ...identityParameters(identity),
          p_shop_version_id: shopVersionId,
          p_expected_shop_revision: input.expectedShopRevision,
          p_offer_id: offerId,
          p_unit_price: input.unitPrice,
          p_maximum_quantity: input.maximumQuantity,
          p_daily_limit: input.dailyLimit,
          p_cooldown_seconds: input.cooldownSeconds,
          p_enabled: input.enabled,
          p_request_id: requestId,
        }),
      );
    },
    async transitionShop(identity, shopVersionId, rawInput, requestId) {
      const input = economyVersionTransitionSchema.parse(rawInput);
      return adminResult(
        'operate_admin_economy_shop_version',
        await rpc(client, 'operate_admin_economy_shop_version', {
          ...identityParameters(identity),
          p_shop_version_id: shopVersionId,
          p_expected_revision: input.expectedRevision,
          p_action: input.action,
          p_effective_at: input.effectiveAt,
          p_request_id: requestId,
        }),
      );
    },
    async shopOperations(identity, shopDefinitionId, requestId) {
      return economyWorkspacePayloadSchema.parse(
        adminResult(
          'get_admin_shop_operations',
          await rpc(client, 'get_admin_shop_operations', {
            ...identityParameters(identity),
            p_shop_definition_id: shopDefinitionId,
            p_limit: 100,
            p_request_id: requestId,
          }),
        ),
      );
    },
    async createShopCatalogSuccessor(identity, shopDefinitionId, rawInput, requestId) {
      const input = shopCatalogSuccessorSchema.parse(rawInput);
      return adminResult(
        'create_admin_shop_catalog_successor',
        await rpc(client, 'create_admin_shop_catalog_successor', {
          ...identityParameters(identity),
          p_shop_definition_id: shopDefinitionId,
          p_expected_active_version_id: input.expectedActiveVersionId,
          p_name: input.name,
          p_description: input.description,
          p_reason: input.reason,
          p_request_id: requestId,
        }),
      );
    },
    async addShopCatalogEntry(identity, versionId, rawInput, requestId) {
      const input = shopCatalogEntryCreateSchema.parse(rawInput);
      return adminResult(
        'add_admin_shop_catalog_entry',
        await rpc(client, 'add_admin_shop_catalog_entry', {
          ...identityParameters(identity),
          p_shop_version_id: versionId,
          p_offer_id: input.offerId,
          p_expected_version_revision: input.expectedVersionRevision,
          p_reason: input.reason,
          p_request_id: requestId,
        }),
      );
    },
    async updateShopCatalogEntry(identity, versionId, entryId, rawInput, requestId) {
      const input = shopCatalogEntryUpdateSchema.parse(rawInput);
      return adminResult(
        'update_admin_shop_catalog_entry',
        await rpc(client, 'update_admin_shop_catalog_entry', {
          ...identityParameters(identity),
          p_shop_version_id: versionId,
          p_entry_id: entryId,
          p_expected_revision: input.expectedRevision,
          p_configuration: input.configuration,
          p_reason: input.reason,
          p_request_id: requestId,
        }),
      );
    },
    async removeShopCatalogEntry(identity, versionId, entryId, rawInput, requestId) {
      const input = shopCatalogEntryRemoveSchema.parse(rawInput);
      return adminResult(
        'remove_admin_shop_catalog_entry',
        await rpc(client, 'remove_admin_shop_catalog_entry', {
          ...identityParameters(identity),
          p_shop_version_id: versionId,
          p_entry_id: entryId,
          p_expected_version_revision: input.expectedVersionRevision,
          p_expected_entry_revision: input.expectedEntryRevision,
          p_reason: input.reason,
          p_request_id: requestId,
        }),
      );
    },
    async updateShopLiveOps(identity, shopDefinitionId, rawInput, requestId) {
      const input = shopLiveOpsUpdateSchema.parse(rawInput);
      return adminResult(
        'update_admin_shop_live_ops',
        await rpc(client, 'update_admin_shop_live_ops', {
          ...identityParameters(identity),
          p_shop_definition_id: shopDefinitionId,
          p_expected_revision: input.expectedRevision,
          p_configuration: input.configuration,
          p_reason: input.reason,
          p_request_id: requestId,
        }),
      );
    },
    async restockShop(identity, _shopDefinitionId, rawInput, requestId) {
      const input = shopRestockSchema.parse(rawInput);
      return adminResult(
        'restock_admin_shop_entry',
        await rpc(client, 'restock_admin_shop_entry', {
          ...identityParameters(identity),
          p_catalog_version_id: input.catalogVersionId,
          p_entry_id: input.entryId,
          p_expected_stock_revision: input.expectedStockRevision,
          p_quantity: input.quantity,
          p_reason: input.reason,
          p_request_id: requestId,
        }),
      );
    },
    async requestShopReconciliation(identity, shopDefinitionId, rawInput, requestId) {
      const input = shopReconciliationRequestSchema.parse(rawInput);
      return adminResult(
        'request_admin_shop_reconciliation',
        await rpc(client, 'request_admin_shop_reconciliation', {
          ...identityParameters(identity),
          p_shop_definition_id: shopDefinitionId,
          p_transaction_id: input.transactionId,
          p_reconciliation_type: input.reconciliationType,
          p_reason: input.reason,
          p_request_id: requestId,
        }),
      );
    },
  };
}
