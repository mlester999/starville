import 'server-only';

import { z } from 'zod';

import { economyRegistryKeySchema, economyRegistryOperationKeySchema } from '@starville/economy';

import { callTrustedAdminApi } from './admin-api';

const dateTimeSchema = z.iso.datetime({ offset: true });
const nullableDateTimeSchema = dateTimeSchema.nullable();
const lifecycleSchema = z.enum([
  'draft',
  'validated',
  'in_review',
  'approved',
  'scheduled',
  'published',
  'superseded',
  'disabled',
  'retired',
]);
const validationResultsSchema = z
  .object({
    valid: z.boolean().optional(),
    checks: z.array(z.string().max(160)).max(40).optional(),
    errors: z.array(z.string().max(240)).max(40).optional(),
    warnings: z.array(z.string().max(240)).max(40).optional(),
  })
  .passthrough()
  .nullable();

export const economyOverviewSchema = z
  .object({
    generatedAt: dateTimeSchema,
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
        createdToday: z.number().int().nonnegative().nullable().optional().default(null),
        destroyedToday: z.number().int().nonnegative().nullable().optional().default(null),
        created7d: z.number().int().nonnegative().nullable().optional().default(null),
        destroyed7d: z.number().int().nonnegative().nullable().optional().default(null),
        created30d: z.number().int().nonnegative(),
        destroyed30d: z.number().int().nonnegative(),
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
    activePolicy: z
      .object({
        id: z.uuid(),
        versionNumber: z.number().int().positive(),
        status: lifecycleSchema,
        effectiveAt: dateTimeSchema,
      })
      .strict()
      .nullable()
      .optional()
      .default(null),
    shops: z
      .object({
        active: z.number().int().nonnegative(),
        disabled: z.number().int().nonnegative(),
        scheduled: z.number().int().nonnegative(),
      })
      .strict()
      .nullable()
      .optional()
      .default(null),
    latestSimulation: z
      .object({
        runId: z.uuid(),
        candidate: z.string().min(1).max(80).nullable(),
        sourceToSinkRatio: z.number().nonnegative(),
        createdAt: dateTimeSchema,
      })
      .strict()
      .nullable()
      .optional()
      .default(null),
    starUtility: z.array(z.record(z.string(), z.unknown())).max(20),
  })
  .strict();

const ledgerItemSchema = z
  .object({
    publicReceiptId: z.string().min(3).max(128),
    playerProfileId: z.uuid(),
    displayName: z.string().min(1).max(80),
    operationKey: economyRegistryOperationKeySchema,
    delta: z.number().int(),
    direction: z.enum(['credit', 'debit']).optional(),
    balanceBefore: z.number().int().nonnegative(),
    balanceAfter: z.number().int().nonnegative(),
    sourceKey: economyRegistryKeySchema.nullable().optional(),
    sinkKey: economyRegistryKeySchema.nullable().optional(),
    requestId: z.string().min(1).max(128),
    status: z.string().min(1).max(40).optional(),
    createdAt: dateTimeSchema,
  })
  .strict();

export const economyLedgerPageSchema = z
  .object({
    items: z.array(ledgerItemSchema).max(100),
    page: z.number().int().positive(),
    pageSize: z.union([z.literal(10), z.literal(50), z.literal(100)]),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();

const sourceSchema = z
  .object({
    id: z.uuid(),
    key: economyRegistryKeySchema,
    operationKey: economyRegistryOperationKeySchema,
    label: z.string().min(3).max(80),
    description: z.string().min(3).max(240),
    category: z.string().min(3).max(80),
    ownerModule: z.string().min(1).max(80).optional(),
    status: lifecycleSchema,
    enabled: z.boolean(),
    version: z.number().int().positive(),
    revision: z.number().int().positive(),
    minimumAmount: z.number().int().positive(),
    maximumAmount: z.number().int().positive(),
    repeatable: z.boolean(),
    dailyLimit: z.number().int().positive().nullable(),
    weeklyLimit: z.number().int().positive().nullable(),
    lifetimeLimit: z.number().int().positive().nullable(),
    walletDailyLimit: z.number().int().positive().nullable(),
    cooldownSeconds: z.number().int().nonnegative(),
    beginnerProtected: z.boolean(),
    riskWeight: z.number().min(0).max(100),
    effectiveAt: dateTimeSchema,
    active: z.boolean(),
  })
  .strict();

const sinkSchema = z
  .object({
    id: z.uuid(),
    key: economyRegistryKeySchema,
    operationKey: economyRegistryOperationKeySchema,
    label: z.string().min(3).max(80),
    description: z.string().min(3).max(240),
    category: z.string().min(3).max(80),
    ownerModule: z.string().min(1).max(80).optional(),
    status: lifecycleSchema,
    enabled: z.boolean(),
    version: z.number().int().positive(),
    revision: z.number().int().positive(),
    minimumAmount: z.number().int().positive(),
    maximumAmount: z.number().int().positive(),
    reversibleByRefund: z.boolean(),
    beginnerProtected: z.boolean(),
    effectiveAt: dateTimeSchema,
    active: z.boolean(),
  })
  .strict();

export const economySourcesSchema = z.object({ items: z.array(sourceSchema).max(100) }).strict();
export const economySinksSchema = z.object({ items: z.array(sinkSchema).max(100) }).strict();

const shopSummarySchema = z
  .object({
    id: z.uuid(),
    shopDefinitionId: z.uuid(),
    slug: z.string().min(1).max(80),
    name: z.string().min(3).max(80),
    description: z.string().min(3).max(280),
    interactionKey: z.string().min(1).max(80),
    ownerModule: z.string().min(1).max(80),
    status: lifecycleSchema,
    enabled: z.boolean(),
    activeVersionId: z.uuid().nullable(),
    activeVersionNumber: z.number().int().positive().nullable(),
    draftVersionId: z.uuid().nullable(),
    draftVersionNumber: z.number().int().positive().nullable(),
    offerCount: z.number().int().nonnegative(),
    revision: z.number().int().positive(),
    effectiveAt: nullableDateTimeSchema,
    lastValidatedAt: nullableDateTimeSchema,
    playerAvailable: z.boolean(),
  })
  .strict();

export const economyShopsSchema = z.object({ items: z.array(shopSummarySchema).max(100) }).strict();

const shopOfferSchema = z
  .object({
    offerId: z.uuid(),
    itemSlug: z.string().min(1).max(120),
    itemName: z.string().min(1).max(120),
    itemDescription: z.string().min(1).max(280),
    category: z.string().min(1).max(80),
    unitPrice: z.number().int().positive(),
    maximumQuantity: z.number().int().min(1).max(99),
    dailyLimit: z.number().int().min(1).max(999),
    cooldownSeconds: z.number().int().min(0).max(86_400),
    inventoryCapacityCost: z.number().int().min(1).max(99),
    enabled: z.boolean(),
    protectedItem: z.boolean(),
    revision: z.number().int().positive(),
  })
  .strict();

const shopVersionSchema = z
  .object({
    id: z.uuid(),
    versionNumber: z.number().int().positive(),
    status: lifecycleSchema,
    revision: z.number().int().positive(),
    name: z.string().min(3).max(80),
    description: z.string().min(3).max(280),
    interactionKey: z.string().min(1).max(80),
    effectiveAt: dateTimeSchema,
    active: z.boolean(),
    validationResults: validationResultsSchema,
    createdAt: dateTimeSchema,
    reviewedAt: nullableDateTimeSchema,
    approvedAt: nullableDateTimeSchema.optional(),
    scheduledAt: nullableDateTimeSchema.optional(),
    publishedAt: nullableDateTimeSchema,
    offers: z.array(shopOfferSchema).max(100),
  })
  .strict();

export const economyShopDetailSchema = z
  .object({
    shop: z
      .object({
        shopDefinitionId: z.uuid(),
        slug: z.string().min(1).max(80),
        name: z.string().min(3).max(80),
        description: z.string().min(3).max(280),
        interactionKey: z.string().min(1).max(80),
        ownerModule: z.string().min(1).max(80),
        activeVersionId: z.uuid().nullable(),
      })
      .strict(),
    versions: z.array(shopVersionSchema).max(100),
  })
  .strict();

const shopOperationsEntrySchema = z
  .object({
    entryId: z.uuid(),
    offerId: z.uuid(),
    itemSlug: z.string().min(1).max(80),
    itemName: z.string().min(1).max(80),
    itemCategory: z.string().min(1).max(80),
    buyEnabled: z.boolean(),
    sellEnabled: z.boolean(),
    buyPrice: z.number().int().positive().nullable(),
    sellPrice: z.number().int().positive().nullable(),
    stockMode: z.string().min(1).max(40),
    restockMode: z.string().min(1).max(40),
    maximumStock: z.number().int().positive().nullable(),
    restockAmount: z.number().int().positive().nullable(),
    restockIntervalSeconds: z.number().int().positive().nullable(),
    playerBuyDailyLimit: z.number().int().positive(),
    playerSellDailyLimit: z.number().int().positive(),
    eligibilityRule: z.string().min(1).max(80),
    enabled: z.boolean(),
    displayOrder: z.number().int().positive(),
    revision: z.number().int().positive(),
  })
  .strict();

export const economyShopOperationsSchema = z
  .object({
    status: z.literal('loaded'),
    permissions: z
      .object({
        stockRead: z.boolean(),
        transactionsRead: z.boolean(),
        receiptsRead: z.boolean(),
        liveOpsManage: z.boolean(),
        stockManage: z.boolean(),
        reconciliationManage: z.boolean(),
      })
      .strict(),
    shop: z
      .object({
        shopDefinitionId: z.uuid(),
        slug: z.string(),
        name: z.string(),
        description: z.string(),
        buyEnabled: z.boolean(),
        sellEnabled: z.boolean(),
        interactionRadius: z.number(),
        configurationRevision: z.number().int().positive(),
        worldPlacement: z
          .object({
            interactionId: z.string(),
            worldObjectId: z.string(),
            worldId: z.string(),
            worldRevisionId: z.uuid(),
            x: z.number(),
            y: z.number(),
            assetRef: z.string(),
            assetVersionId: z.uuid().nullable(),
            artworkReadiness: z.string().nullable(),
          })
          .strict(),
      })
      .strict(),
    liveOps: z
      .object({
        accessEnabled: z.boolean(),
        buyingEnabled: z.boolean(),
        sellingEnabled: z.boolean(),
        stockDecrementEnabled: z.boolean(),
        restockEnabled: z.boolean(),
        tutorialObjectivesEnabled: z.boolean(),
        tutorialRewardsEnabled: z.boolean(),
        saleDustIssuanceEnabled: z.boolean(),
        globalDailySaleDustCap: z.number().int().positive(),
        maintenanceMessage: z.string(),
        configurationRevision: z.number().int().positive(),
        updatedAt: dateTimeSchema,
      })
      .strict()
      .nullable(),
    catalog: z.record(z.string(), z.unknown()),
    availableOffers: z
      .array(
        z
          .object({
            offerId: z.uuid(),
            itemSlug: z.string().min(1).max(80),
            itemName: z.string().min(1).max(80),
            itemCategory: z.string().min(1).max(80),
            buyPrice: z.number().int().positive().nullable(),
            sellPrice: z.number().int().positive().nullable(),
            buyEligible: z.boolean(),
            sellEligible: z.boolean(),
          })
          .strict(),
      )
      .max(100),
    versions: z
      .array(
        z
          .object({
            versionId: z.uuid(),
            versionNumber: z.number().int().positive(),
            status: lifecycleSchema,
            name: z.string(),
            description: z.string(),
            revision: z.number().int().positive(),
            effectiveAt: dateTimeSchema,
            publishedAt: nullableDateTimeSchema,
            reason: z.string(),
            validationResults: validationResultsSchema,
            active: z.boolean(),
            entryCount: z.number().int().nonnegative(),
            entries: z.array(shopOperationsEntrySchema).max(100),
          })
          .strict(),
      )
      .max(100),
    stock: z
      .array(
        z
          .object({
            catalogVersionId: z.uuid(),
            entryId: z.uuid(),
            itemSlug: z.string(),
            itemName: z.string(),
            stockMode: z.string(),
            currentStock: z.number().int().nonnegative().nullable(),
            maximumStock: z.number().int().positive().nullable(),
            stockRevision: z.number().int().positive(),
            restockMode: z.string(),
            restockAmount: z.number().int().positive().nullable(),
            nextRestockAt: nullableDateTimeSchema,
            restockPaused: z.boolean(),
            updatedAt: dateTimeSchema,
          })
          .strict(),
      )
      .max(100),
    transactions: z
      .array(
        z
          .object({
            transactionId: z.uuid(),
            playerProfileId: z.uuid(),
            direction: z.enum(['buy', 'sell']),
            itemSlug: z.string(),
            quantity: z.number().int().positive(),
            unitPrice: z.number().int().positive(),
            totalDust: z.number().int().positive(),
            status: z.string(),
            catalogVersionId: z.uuid(),
            catalogEntryId: z.uuid(),
            dustLedgerReceiptId: z.string().nullable(),
            inventoryHistoryEntryId: z.uuid().nullable(),
            receiptId: z.string().nullable(),
            failureCode: z.string().nullable(),
            idempotencyEvidence: z.string(),
            requestId: z.string(),
            createdAt: dateTimeSchema,
          })
          .strict(),
      )
      .max(100),
    receipts: z
      .array(
        z
          .object({
            receiptId: z.string(),
            transactionId: z.uuid(),
            direction: z.enum(['buy', 'sell']),
            itemName: z.string(),
            quantity: z.number().int().positive(),
            unitPrice: z.number().int().positive(),
            totalDust: z.number().int().positive(),
            status: z.string(),
            supportReference: z.string(),
            createdAt: dateTimeSchema,
          })
          .strict(),
      )
      .max(100),
    reconciliation: z
      .array(
        z
          .object({
            id: z.uuid(),
            transactionId: z.uuid().nullable(),
            type: z.string(),
            status: z.string(),
            attemptCount: z.number().int().nonnegative(),
            lastErrorCode: z.string().nullable(),
            createdAt: dateTimeSchema,
          })
          .strict(),
      )
      .max(100),
    audit: z.array(z.record(z.string(), z.unknown())).max(100),
    generatedAt: dateTimeSchema,
  })
  .strict();

const policyVersionSchema = z
  .object({
    id: z.uuid(),
    versionNumber: z.number().int().positive(),
    status: lifecycleSchema,
    revision: z.number().int().positive(),
    economyEnabled: z.boolean(),
    purchasesEnabled: z.boolean(),
    rewardsEnabled: z.boolean(),
    correctionsEnabled: z.boolean(),
    starterGrant: z.number().int().min(0).max(10_000),
    beginnerProtectionHours: z.number().int().min(0).max(720),
    lowValueCorrectionLimit: z.number().int().min(1).max(100_000),
    highValueCorrectionLimit: z.number().int().min(1).max(1_000_000),
    reconciliationTolerance: z.number().int().nonnegative(),
    purchaseRateLimitPerMinute: z.number().int().min(1).max(60),
    historyRetentionDays: z.number().int().min(30).max(2_555),
    riskReviewThreshold: z.number().min(0).max(100),
    effectiveAt: dateTimeSchema,
    active: z.boolean(),
    validationResults: validationResultsSchema,
    createdAt: dateTimeSchema,
    reviewedAt: nullableDateTimeSchema,
    approvedAt: nullableDateTimeSchema.optional(),
    scheduledAt: nullableDateTimeSchema.optional(),
    publishedAt: nullableDateTimeSchema,
  })
  .strict();

export const economyPoliciesSchema = z
  .object({
    activeVersionId: z.uuid().nullable(),
    items: z.array(policyVersionSchema).max(100),
  })
  .strict();

const reconciliationRunSchema = z
  .object({
    id: z.uuid(),
    scope: z.enum(['player', 'global']),
    status: z.enum(['running', 'completed', 'failed']),
    checkedCount: z.number().int().nonnegative(),
    mismatchCount: z.number().int().nonnegative(),
    playerProfileId: z.uuid().nullable(),
    startedAt: dateTimeSchema,
    completedAt: nullableDateTimeSchema,
    failureCode: z.string().max(80).nullable(),
  })
  .strict();

const reconciliationResultSchema = z
  .object({
    id: z.uuid(),
    runId: z.uuid(),
    playerProfileId: z.uuid(),
    displayName: z.string().min(1).max(80),
    storedBalance: z.number().int().nonnegative(),
    ledgerBalance: z.number().int().nonnegative(),
    difference: z.number().int(),
    status: z.enum(['balanced', 'pending', 'mismatch', 'blocked', 'reviewed', 'resolved']),
    autoCorrected: z.literal(false),
    createdAt: dateTimeSchema,
  })
  .strict();

export const economyReconciliationSchema = z
  .object({
    summary: z
      .object({
        balanced: z.number().int().nonnegative(),
        pending: z.number().int().nonnegative(),
        mismatch: z.number().int().nonnegative(),
        blocked: z.number().int().nonnegative(),
        reviewed: z.number().int().nonnegative(),
        lastRunAt: nullableDateTimeSchema,
        lastDurationMs: z.number().nonnegative().nullable(),
        workerStatus: z.enum(['healthy', 'idle', 'running', 'unavailable']),
      })
      .strict(),
    runs: z.array(reconciliationRunSchema).max(100),
    results: z.array(reconciliationResultSchema).max(100),
  })
  .strict();

const riskSignalSchema = z
  .object({
    id: z.uuid(),
    publicSignalId: z.string().min(3).max(128),
    playerProfileId: z.uuid().nullable(),
    displayName: z.string().min(1).max(80).nullable(),
    category: z.string().min(1).max(80),
    severity: z.enum(['information', 'low', 'medium', 'high', 'critical']),
    confidence: z.number().min(0).max(100),
    safeSummary: z.string().min(3).max(240),
    firstSeenAt: dateTimeSchema,
    lastSeenAt: dateTimeSchema,
    eventCount: z.number().int().positive(),
    status: z.enum(['open', 'reviewing', 'dismissed', 'confirmed', 'resolved']),
    sourceKey: economyRegistryKeySchema.nullable(),
    shopKey: economyRegistryKeySchema.nullable(),
    activityKey: z.string().min(1).max(80).nullable(),
  })
  .strict();

export const economyRiskSchema = z.object({ items: z.array(riskSignalSchema).max(100) }).strict();

const correctionSchema = z
  .object({
    id: z.uuid(),
    publicReceiptId: z.string().min(3).max(128),
    playerProfileId: z.uuid(),
    displayName: z.string().min(1).max(80),
    delta: z.number().int(),
    reasonCategory: z.string().min(1).max(80),
    explanation: z.string().min(20).max(1_000),
    status: z.enum([
      'draft',
      'submitted',
      'pending_review',
      'awaiting_review',
      'awaiting_second_review',
      'approved',
      'rejected',
      'settled',
      'expired',
      'cancelled',
    ]),
    balanceBefore: z.number().int().nonnegative(),
    balanceAfter: z.number().int().nonnegative(),
    requiresSecondApproval: z.boolean(),
    createdAt: dateTimeSchema,
    reviewedAt: nullableDateTimeSchema,
    settledAt: nullableDateTimeSchema,
    creatorIsCurrentAdmin: z.boolean(),
    firstApproved: z.boolean(),
    secondApproved: z.boolean(),
  })
  .strict();

export const economyCorrectionsSchema = z
  .object({ items: z.array(correctionSchema).max(100) })
  .strict();

export const economySimulationScenarioSchema = z.enum([
  'casual-heavy',
  'balanced',
  'highly-engaged',
  'reward-maximizing',
  'low-spending',
  'high-spending',
  'activity-event-spike',
  'shop-disabled',
  'reward-source-paused',
  'suspicious-farming-10-percent',
]);
export const economySimulationCandidateSchema = z.enum([
  'current-baseline',
  'more-useful-spending',
  'lower-repeatable-emissions',
  'balanced-combination',
]);

const simulationRunSchema = z
  .object({
    runId: z.uuid(),
    candidate: z.union([economySimulationCandidateSchema, z.literal('custom')]).nullable(),
    title: z.string().min(3).max(120).optional(),
    seed: z.number().int().positive(),
    playerCount: z.union([z.literal(100), z.literal(1_000), z.literal(10_000)]),
    durationDays: z.union([z.literal(30), z.literal(90), z.literal(180)]),
    scenario: economySimulationScenarioSchema,
    createdAt: dateTimeSchema,
    endingSupply: z.number().int().nonnegative(),
    sourceToSinkRatio: z.number().nonnegative(),
    dailyNetChange: z.number(),
    medianBalance: z.number().int().nonnegative(),
    p90Balance: z.number().int().nonnegative(),
    p99Balance: z.number().int().nonnegative(),
    shopParticipationRate: z.number().min(0).max(1),
    capReachRate: z.number().min(0).max(1),
    beginnerAffordabilityRate: z.number().min(0).max(1),
    concentration: z.number().min(0).max(1),
    suspiciousEmissionContribution: z.number().min(0).max(1),
    playerBalancesMutated: z.literal(false),
  })
  .strict();

export const economySimulationsSchema = z
  .object({
    items: z.array(simulationRunSchema).max(100),
    recommendation: z
      .object({
        candidate: economySimulationCandidateSchema,
        title: z.string().min(3).max(120),
        rationale: z.string().min(20).max(1_000),
        planningRangeMin: z.number().nonnegative(),
        planningRangeMax: z.number().nonnegative(),
        published: z.literal(false),
      })
      .strict()
      .nullable(),
  })
  .strict();

const economyAuditItemSchema = z
  .object({
    id: z.uuid(),
    eventKey: z.string().min(3).max(120),
    actorDisplayName: z.string().min(1).max(120).nullable(),
    outcome: z.string().min(1).max(40),
    targetType: z.string().min(1).max(80).nullable(),
    targetId: z.string().min(1).max(128).nullable(),
    requestId: z.string().min(1).max(128),
    createdAt: dateTimeSchema,
    summary: z.string().min(3).max(280),
  })
  .strict();

export const economyAuditSchema = z
  .object({
    items: z.array(economyAuditItemSchema).max(100),
    page: z.number().int().positive(),
    pageSize: z.union([z.literal(10), z.literal(50), z.literal(100)]),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();

export type EconomyOverview = z.infer<typeof economyOverviewSchema>;
export type EconomyLedgerPage = z.infer<typeof economyLedgerPageSchema>;
export type EconomySources = z.infer<typeof economySourcesSchema>;
export type EconomySinks = z.infer<typeof economySinksSchema>;
export type EconomyShops = z.infer<typeof economyShopsSchema>;
export type EconomyShopDetail = z.infer<typeof economyShopDetailSchema>;
export type EconomyShopOperations = z.infer<typeof economyShopOperationsSchema>;
export type EconomyPolicies = z.infer<typeof economyPoliciesSchema>;
export type EconomyReconciliation = z.infer<typeof economyReconciliationSchema>;
export type EconomyRisk = z.infer<typeof economyRiskSchema>;
export type EconomyCorrections = z.infer<typeof economyCorrectionsSchema>;
export type EconomySimulations = z.infer<typeof economySimulationsSchema>;
export type EconomyAudit = z.infer<typeof economyAuditSchema>;
export type EconomySimulationScenario = z.infer<typeof economySimulationScenarioSchema>;
export type EconomySimulationCandidate = z.infer<typeof economySimulationCandidateSchema>;

function queryPath(pathname: string, query: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') search.set(key, value);
  }
  const serialized = search.toString();
  return serialized === '' ? pathname : `${pathname}?${serialized}`;
}

function get<Data>(pathname: string, parser: (value: unknown) => Data): Promise<Data> {
  return callTrustedAdminApi({ method: 'GET', pathname, parser });
}

export function loadEconomyOverview(): Promise<EconomyOverview> {
  return get('/api/v1/admin/economy', (value) => economyOverviewSchema.parse(value));
}

export interface EconomyLedgerQuery {
  readonly search?: string;
  readonly page?: string;
  readonly pageSize?: string;
  readonly direction?: string;
  readonly sourceKey?: string;
  readonly sinkKey?: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly minimumAmount?: string;
  readonly maximumAmount?: string;
  readonly status?: string;
}

export function loadEconomyLedger(query: EconomyLedgerQuery = {}): Promise<EconomyLedgerPage> {
  const dateFrom =
    query.dateFrom === undefined || query.dateFrom === ''
      ? undefined
      : new Date(`${query.dateFrom}T00:00:00.000Z`).toISOString();
  const dateTo =
    query.dateTo === undefined || query.dateTo === ''
      ? undefined
      : new Date(`${query.dateTo}T23:59:59.999Z`).toISOString();
  return get(
    queryPath('/api/v1/admin/economy/ledger', {
      search: query.search?.trim(),
      page: query.page ?? '1',
      pageSize: query.pageSize ?? '10',
      direction: query.direction,
      sourceKey: query.sourceKey,
      sinkKey: query.sinkKey,
      dateFrom,
      dateTo,
      minimumAmount: query.minimumAmount,
      maximumAmount: query.maximumAmount,
      status: query.status,
    }),
    (value) => economyLedgerPageSchema.parse(value),
  );
}

export function loadEconomySources(): Promise<EconomySources> {
  return get('/api/v1/admin/economy/sources', (value) => economySourcesSchema.parse(value));
}

export function loadEconomySinks(): Promise<EconomySinks> {
  return get('/api/v1/admin/economy/sinks', (value) => economySinksSchema.parse(value));
}

export function loadEconomyShops(): Promise<EconomyShops> {
  return get('/api/v1/admin/economy/shops', (value) => economyShopsSchema.parse(value));
}

export function loadEconomyShopDetail(shopDefinitionId: string): Promise<EconomyShopDetail> {
  return get(`/api/v1/admin/economy/shops/${encodeURIComponent(shopDefinitionId)}`, (value) =>
    economyShopDetailSchema.parse(value),
  );
}

export function loadEconomyShopOperations(
  shopDefinitionId: string,
): Promise<EconomyShopOperations> {
  return get(
    `/api/v1/admin/economy/shops/${encodeURIComponent(shopDefinitionId)}/operations`,
    (value) => economyShopOperationsSchema.parse(value),
  );
}

export function loadEconomyPolicies(): Promise<EconomyPolicies> {
  return get('/api/v1/admin/economy/policies', (value) => economyPoliciesSchema.parse(value));
}

export function loadEconomyReconciliation(): Promise<EconomyReconciliation> {
  return get('/api/v1/admin/economy/reconciliation', (value) =>
    economyReconciliationSchema.parse(value),
  );
}

export function loadEconomyRisk(
  query: Record<string, string | undefined> = {},
): Promise<EconomyRisk> {
  void query;
  return get('/api/v1/admin/economy/risk', (value) => economyRiskSchema.parse(value));
}

export function loadEconomyCorrections(): Promise<EconomyCorrections> {
  return get('/api/v1/admin/economy/corrections', (value) => economyCorrectionsSchema.parse(value));
}

export function loadEconomySimulations(): Promise<EconomySimulations> {
  return get('/api/v1/admin/economy/simulations', (value) => economySimulationsSchema.parse(value));
}

export function loadEconomyAudit(query: {
  readonly search?: string;
  readonly event?: string;
  readonly outcome?: string;
  readonly page?: string;
  readonly pageSize?: string;
}): Promise<EconomyAudit> {
  return get(
    queryPath('/api/v1/admin/economy/audit', {
      search: query.search,
      page: query.page ?? '1',
      pageSize: query.pageSize ?? '10',
    }),
    (value) => economyAuditSchema.parse(value),
  );
}

export function runEconomyReconciliation(playerProfileId: string | null, requestId: string) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: '/api/v1/admin/economy/reconciliation',
    body: { playerProfileId },
    requestId,
    parser: (value) => z.record(z.string(), z.unknown()).parse(value),
  });
}

export function createEconomyCorrection(
  input: {
    readonly playerProfileId: string;
    readonly delta: number;
    readonly reasonCategory: string;
    readonly explanation: string;
  },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: '/api/v1/admin/economy/corrections',
    body: input,
    requestId,
    parser: (value) => z.record(z.string(), z.unknown()).parse(value),
  });
}

export function reviewEconomyCorrection(
  correctionId: string,
  action: 'approve' | 'reject',
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/economy/corrections/${encodeURIComponent(correctionId)}/review`,
    body: { action },
    requestId,
    parser: (value) => z.record(z.string(), z.unknown()).parse(value),
  });
}

export function reviewEconomyRisk(
  signalId: string,
  status: 'reviewing' | 'dismissed' | 'confirmed' | 'resolved',
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/economy/risk/${encodeURIComponent(signalId)}/review`,
    body: { status },
    requestId,
    parser: (value) => z.record(z.string(), z.unknown()).parse(value),
  });
}

export interface EconomySimulationInput {
  readonly candidate: EconomySimulationCandidate;
  readonly seed: number;
  readonly playerCount: 100 | 1_000 | 10_000;
  readonly durationDays: 30 | 90 | 180;
  readonly starterGrant: number;
  readonly meanDailySource: number;
  readonly sourceParticipationRate: number;
  readonly meanDailySink: number;
  readonly sinkParticipationRate: number;
  readonly beginnerProtectionDays: number;
  readonly scenario: EconomySimulationScenario;
}

export function runEconomySimulation(input: EconomySimulationInput, requestId: string) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: '/api/v1/admin/economy/simulations',
    body: input,
    requestId,
    parser: (value) => z.record(z.string(), z.unknown()).parse(value),
  });
}

export interface PolicyDraftInput {
  readonly baseVersionId: string;
  readonly economyEnabled: boolean;
  readonly purchasesEnabled: boolean;
  readonly rewardsEnabled: boolean;
  readonly correctionsEnabled: boolean;
  readonly starterGrant: number;
  readonly beginnerProtectionHours: number;
  readonly lowValueCorrectionLimit: number;
  readonly highValueCorrectionLimit: number;
  readonly purchaseRateLimitPerMinute: number;
  readonly historyRetentionDays: number;
  readonly riskReviewThreshold: number;
  readonly effectiveAt: string;
}

export function createEconomyPolicyDraft(input: PolicyDraftInput, requestId: string) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: '/api/v1/admin/economy/policies/drafts',
    body: input,
    requestId,
    parser: (value) => z.record(z.string(), z.unknown()).parse(value),
  });
}

export function transitionEconomyPolicy(
  versionId: string,
  input: {
    readonly action: 'validate' | 'submit_review' | 'approve' | 'schedule' | 'publish' | 'rollback';
    readonly expectedRevision: number;
    readonly effectiveAt?: string;
  },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/economy/policies/${encodeURIComponent(versionId)}/transition`,
    body: input,
    requestId,
    parser: (value) => z.record(z.string(), z.unknown()).parse(value),
  });
}

export function createEconomyShopDraft(
  shopDefinitionId: string,
  input: {
    readonly expectedActiveVersionId: string;
    readonly name: string;
    readonly description: string;
    readonly effectiveAt: string;
  },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/economy/shops/${encodeURIComponent(shopDefinitionId)}/drafts`,
    body: input,
    requestId,
    parser: (value) => z.record(z.string(), z.unknown()).parse(value),
  });
}

export function updateEconomyShopOffer(
  versionId: string,
  offerId: string,
  input: {
    readonly expectedShopRevision: number;
    readonly unitPrice: number;
    readonly maximumQuantity: number;
    readonly dailyLimit: number;
    readonly cooldownSeconds: number;
    readonly enabled: boolean;
  },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'PATCH',
    pathname: `/api/v1/admin/economy/shops/versions/${encodeURIComponent(versionId)}/offers/${encodeURIComponent(offerId)}`,
    body: input,
    requestId,
    parser: (value) => z.record(z.string(), z.unknown()).parse(value),
  });
}

export function transitionEconomyShop(
  versionId: string,
  input: {
    readonly action:
      'validate' | 'submit_review' | 'approve' | 'schedule' | 'publish' | 'disable' | 'rollback';
    readonly expectedRevision: number;
    readonly effectiveAt?: string;
  },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/economy/shops/versions/${encodeURIComponent(versionId)}/transition`,
    body: input,
    requestId,
    parser: (value) => z.record(z.string(), z.unknown()).parse(value),
  });
}

export function createEconomyShopCatalogSuccessor(
  shopDefinitionId: string,
  input: {
    readonly expectedActiveVersionId: string;
    readonly name: string;
    readonly description: string;
    readonly reason: string;
  },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/economy/shops/${encodeURIComponent(shopDefinitionId)}/catalog-successors`,
    body: input,
    requestId,
    parser: (value) => z.record(z.string(), z.unknown()).parse(value),
  });
}

export function addEconomyShopCatalogEntry(
  versionId: string,
  input: {
    readonly offerId: string;
    readonly expectedVersionRevision: number;
    readonly reason: string;
  },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/economy/shops/versions/${encodeURIComponent(versionId)}/entries`,
    body: input,
    requestId,
    parser: (value) => z.record(z.string(), z.unknown()).parse(value),
  });
}

export function updateEconomyShopCatalogEntry(
  versionId: string,
  entryId: string,
  input: {
    readonly expectedRevision: number;
    readonly configuration: Record<string, unknown>;
    readonly reason: string;
  },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'PATCH',
    pathname: `/api/v1/admin/economy/shops/versions/${encodeURIComponent(versionId)}/entries/${encodeURIComponent(entryId)}`,
    body: input,
    requestId,
    parser: (value) => z.record(z.string(), z.unknown()).parse(value),
  });
}

export function removeEconomyShopCatalogEntry(
  versionId: string,
  entryId: string,
  input: {
    readonly expectedVersionRevision: number;
    readonly expectedEntryRevision: number;
    readonly reason: string;
  },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'DELETE',
    pathname: `/api/v1/admin/economy/shops/versions/${encodeURIComponent(versionId)}/entries/${encodeURIComponent(entryId)}`,
    body: input,
    requestId,
    parser: (value) => z.record(z.string(), z.unknown()).parse(value),
  });
}

export function updateEconomyShopLiveOps(
  shopDefinitionId: string,
  input: {
    readonly expectedRevision: number;
    readonly configuration: Record<string, unknown>;
    readonly reason: string;
  },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'PATCH',
    pathname: `/api/v1/admin/economy/shops/${encodeURIComponent(shopDefinitionId)}/live-ops`,
    body: input,
    requestId,
    parser: (value) => z.record(z.string(), z.unknown()).parse(value),
  });
}

export function restockEconomyShop(
  shopDefinitionId: string,
  input: {
    readonly catalogVersionId: string;
    readonly entryId: string;
    readonly expectedStockRevision: number;
    readonly quantity: number;
    readonly reason: string;
  },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/economy/shops/${encodeURIComponent(shopDefinitionId)}/restock`,
    body: input,
    requestId,
    parser: (value) => z.record(z.string(), z.unknown()).parse(value),
  });
}

export function requestEconomyShopReconciliation(
  shopDefinitionId: string,
  input: {
    readonly transactionId: string;
    readonly reconciliationType:
      | 'settlement_mismatch'
      | 'receipt_mismatch'
      | 'stock_mismatch'
      | 'limit_mismatch'
      | 'stuck_transaction';
    readonly reason: string;
  },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/economy/shops/${encodeURIComponent(shopDefinitionId)}/reconciliation`,
    body: input,
    requestId,
    parser: (value) => z.record(z.string(), z.unknown()).parse(value),
  });
}
