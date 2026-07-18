import { z } from 'zod';

const uuidSchema = z.uuid();
const timestampSchema = z.iso.datetime({ offset: true });
const safeText = (minimum: number, maximum: number) =>
  z
    .string()
    .trim()
    .min(minimum)
    .max(maximum)
    .refine((value) => !/[<>\p{Cc}]/u.test(value));

export const ECONOMY_PROTOCOL_VERSION = 1 as const;
export const MAX_DUST_BALANCE = 9_000_000_000_000_000 as const;
export const ECONOMY_REGISTRY_KEY_MIN_LENGTH = 3 as const;
export const ECONOMY_REGISTRY_KEY_MAX_LENGTH = 80 as const;
export const economyKeySchema = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u);
export const economyOperationKeySchema = z.string().regex(/^[a-z][a-z0-9_]{1,79}$/u);
export const economyRegistryKeySchema = z
  .string()
  .min(ECONOMY_REGISTRY_KEY_MIN_LENGTH)
  .max(ECONOMY_REGISTRY_KEY_MAX_LENGTH)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u);
export const economyRegistryOperationKeySchema = z
  .string()
  .min(ECONOMY_REGISTRY_KEY_MIN_LENGTH)
  .max(ECONOMY_REGISTRY_KEY_MAX_LENGTH)
  .regex(/^[a-z][a-z0-9_]+$/u);
export const dustBalanceSchema = z.number().int().min(0).max(MAX_DUST_BALANCE);
export const signedDustDeltaSchema = z
  .number()
  .int()
  .min(-MAX_DUST_BALANCE)
  .max(MAX_DUST_BALANCE)
  .refine((value) => value !== 0, 'DUST delta cannot be zero');

export const economyDefinitionStatusSchema = z.enum(['active', 'disabled', 'retired']);
export const economySourceDefinitionSchema = z
  .object({
    key: economyRegistryKeySchema,
    operationKey: economyRegistryOperationKeySchema,
    category: z.enum([
      'starter_grant',
      'gameplay_reward',
      'activity_reward',
      'administrative_correction',
      'refund',
      'migration_adjustment',
    ]),
    label: safeText(3, 80),
    description: safeText(3, 240),
    minimumAmount: z.number().int().min(1).max(1_000_000),
    maximumAmount: z.number().int().min(1).max(1_000_000),
    status: economyDefinitionStatusSchema,
    repeatable: z.boolean(),
    dailyLimit: z.number().int().min(0).max(10_000).nullable(),
    weeklyLimit: z.number().int().min(1).max(70_000).nullable(),
    accountLifetimeLimit: z.number().int().min(1).max(1_000_000).nullable(),
    walletDailyLimit: z.number().int().min(1).max(10_000).nullable(),
    cooldownSeconds: z.number().int().min(0).max(2_592_000),
    beginnerProtected: z.boolean(),
    riskWeight: z.number().min(0).max(100),
    version: z.number().int().positive(),
  })
  .strict()
  .refine((definition) => definition.minimumAmount <= definition.maximumAmount, {
    message: 'Source minimum amount cannot exceed its maximum amount',
  });
export type EconomySourceDefinition = z.infer<typeof economySourceDefinitionSchema>;

export const economySinkDefinitionSchema = z
  .object({
    key: economyRegistryKeySchema,
    operationKey: economyRegistryOperationKeySchema,
    category: z.enum([
      'shop_purchase',
      'crafting_cost',
      'administrative_correction',
      'migration_adjustment',
    ]),
    label: safeText(3, 80),
    description: safeText(3, 240),
    minimumAmount: z.number().int().min(1).max(1_000_000),
    maximumAmount: z.number().int().min(1).max(1_000_000),
    status: economyDefinitionStatusSchema,
    reversibleByRefund: z.boolean(),
    beginnerProtected: z.boolean(),
    version: z.number().int().positive(),
  })
  .strict()
  .refine((definition) => definition.minimumAmount <= definition.maximumAmount, {
    message: 'Sink minimum amount cannot exceed its maximum amount',
  });
export type EconomySinkDefinition = z.infer<typeof economySinkDefinitionSchema>;

export const economyPolicySchema = z
  .object({
    versionId: uuidSchema,
    versionNumber: z.number().int().positive(),
    status: z.enum(['draft', 'validated', 'in_review', 'published', 'superseded']),
    economyEnabled: z.boolean(),
    purchasesEnabled: z.boolean(),
    rewardsEnabled: z.boolean(),
    correctionsEnabled: z.boolean(),
    starterGrant: z.number().int().min(0).max(10_000),
    beginnerProtectionHours: z.number().int().min(0).max(720),
    lowValueCorrectionLimit: z.number().int().min(1).max(100_000),
    highValueCorrectionLimit: z.number().int().min(1).max(1_000_000),
    reconciliationTolerance: z.literal(0),
    purchaseRateLimitPerMinute: z.number().int().min(1).max(60),
    historyRetentionDays: z.number().int().min(30).max(2_555),
    riskReviewThreshold: z.number().min(0).max(100),
    revision: z.number().int().positive(),
    effectiveAt: timestampSchema,
    publishedAt: timestampSchema.nullable(),
  })
  .strict()
  .refine(
    (policy) => policy.lowValueCorrectionLimit < policy.highValueCorrectionLimit,
    'Low-value correction limit must be below the high-value limit',
  );
export type EconomyPolicy = z.infer<typeof economyPolicySchema>;

export const dustLedgerEntrySchema = z
  .object({
    publicReceiptId: z.string().regex(/^DUST-[A-F0-9]{20}$/u),
    operationKey: economyRegistryOperationKeySchema,
    sourceKey: economyRegistryKeySchema.nullable(),
    sinkKey: economyRegistryKeySchema.nullable(),
    delta: signedDustDeltaSchema,
    balanceBefore: dustBalanceSchema,
    balanceAfter: dustBalanceSchema,
    referenceType: economyOperationKeySchema,
    referenceId: uuidSchema.nullable(),
    relatedPublicReceiptId: z
      .string()
      .regex(/^(?:SHOP|CORR)-[A-F0-9]{20}$/u)
      .nullable()
      .optional(),
    referenceLabel: safeText(3, 80).optional(),
    correlationId: safeText(1, 128).nullable(),
    createdAt: timestampSchema,
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.balanceBefore + entry.delta !== entry.balanceAfter) {
      context.addIssue({
        code: 'custom',
        path: ['balanceAfter'],
        message: 'Ledger arithmetic failed',
      });
    }
    if (
      entry.delta > 0 !== (entry.sourceKey !== null) ||
      entry.delta < 0 !== (entry.sinkKey !== null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['sourceKey'],
        message: 'Positive entries require a source and negative entries require a sink',
      });
    }
  });
export type DustLedgerEntry = z.infer<typeof dustLedgerEntrySchema>;

export const economyReconciliationResultSchema = z
  .object({
    playerProfileId: uuidSchema,
    storedBalance: dustBalanceSchema,
    ledgerBalance: dustBalanceSchema,
    difference: z.number().int().min(-MAX_DUST_BALANCE).max(MAX_DUST_BALANCE),
    status: z.enum(['balanced', 'mismatch', 'reviewed', 'resolved']),
    checkedAt: timestampSchema,
    autoCorrected: z.literal(false),
  })
  .strict();

export const economyRiskSignalSchema = z
  .object({
    id: uuidSchema,
    signalType: z.enum([
      'duplicate_request',
      'velocity',
      'reconciliation_mismatch',
      'multi_account_correlation',
      'reward_pattern',
      'correction_pattern',
    ]),
    severity: z.enum(['information', 'low', 'medium', 'high', 'critical']),
    status: z.enum(['open', 'reviewing', 'dismissed', 'confirmed', 'resolved']),
    score: z.number().min(0).max(100),
    safeSummary: safeText(3, 240),
    createdAt: timestampSchema,
  })
  .strict();

export const economyCorrectionSchema = z
  .object({
    id: uuidSchema,
    publicReceiptId: z
      .string()
      .regex(/^CORR-[A-F0-9]{20}$/u)
      .nullable(),
    playerProfileId: uuidSchema,
    delta: signedDustDeltaSchema,
    reasonCategory: z.enum(['support_repair', 'incident_repair', 'migration_repair', 'refund']),
    explanation: safeText(20, 1_000),
    status: z.enum(['pending_review', 'approved', 'rejected', 'settled', 'cancelled']),
    requiresSecondApproval: z.boolean(),
    createdAt: timestampSchema,
    settledAt: timestampSchema.nullable(),
  })
  .strict();

export const economyShopOfferSchema = z
  .object({
    offerId: uuidSchema,
    itemSlug: economyKeySchema,
    itemName: safeText(2, 80),
    itemDescription: safeText(1, 280).optional(),
    itemCategory: z
      .enum([
        'seed',
        'crop',
        'ingredient',
        'cooked_food',
        'crafted_material',
        'furniture',
        'permanent_tool',
        'special',
      ])
      .optional(),
    unitPrice: z.number().int().min(1).max(1_000_000),
    maximumQuantity: z.number().int().min(1).max(99),
    dailyLimit: z.number().int().min(1).max(999),
    cooldownSeconds: z.number().int().min(0).max(86_400),
    inventoryCapacityCost: z.number().int().min(1).max(99),
    protectedItem: z.literal(false),
    enabled: z.boolean(),
    revision: z.number().int().positive(),
    purchasedToday: z.number().int().nonnegative().optional(),
    remainingToday: z.number().int().nonnegative().optional(),
    availableAt: timestampSchema.nullable().optional(),
  })
  .strict();

export const economyShopSchema = z
  .object({
    shopKey: economyKeySchema,
    name: safeText(3, 80),
    versionId: uuidSchema,
    versionNumber: z.number().int().positive(),
    revision: z.number().int().positive(),
    status: z.enum(['draft', 'validated', 'in_review', 'published', 'superseded', 'disabled']),
    interactionKey: economyKeySchema,
    offers: z.array(economyShopOfferSchema).max(100),
    publishedAt: timestampSchema.nullable(),
  })
  .strict();

export const economyPurchaseRequestSchema = z
  .object({
    offerId: uuidSchema,
    quantity: z.number().int().min(1).max(99),
    expectedUnitPrice: z.number().int().min(1).max(1_000_000),
    expectedShopVersionId: uuidSchema,
    expectedShopRevision: z.number().int().positive(),
    idempotencyKey: z.uuid(),
  })
  .strict();

export const economyPurchaseReceiptSchema = z
  .object({
    receiptId: z.string().regex(/^SHOP-[A-F0-9]{20}$/u),
    shopKey: economyKeySchema,
    shopVersionId: uuidSchema,
    offerId: uuidSchema,
    itemSlug: economyKeySchema,
    quantity: z.number().int().min(1).max(99),
    unitPrice: z.number().int().positive(),
    totalPrice: z.number().int().positive(),
    dustBalance: dustBalanceSchema,
    ledgerReceiptId: z.string().regex(/^DUST-[A-F0-9]{20}$/u),
    settledAt: timestampSchema,
    replayed: z.boolean(),
  })
  .strict();

export const playerEconomySummarySchema = z
  .object({
    dustBalance: dustBalanceSchema,
    history: z.array(dustLedgerEntrySchema).max(100),
    nextCursor: z.string().max(256).nullable(),
    policyVersion: z.number().int().positive(),
    generatedAt: timestampSchema,
  })
  .strict();

export const shopInteractionIdSchema = economyKeySchema;
export const shopReceiptIdSchema = z.string().regex(/^STORE-[A-F0-9]{20}$/u);
export const shopTransactionDirectionSchema = z.enum(['buy', 'sell']);

export const shopEventSchema = z
  .object({
    eventNumber: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    eventKey: z.enum([
      'shop_purchase_completed',
      'shop_sale_completed',
      'shop_stock_changed',
      'shop_catalog_changed',
      'shop_availability_changed',
      'shop_limit_changed',
      'receipt_available',
    ]),
    visibility: z.enum(['owner', 'public_stock']),
    relatedEntityId: uuidSchema.nullable(),
    payload: z.record(z.string(), z.unknown()),
    createdAt: timestampSchema,
  })
  .strict();

export const shopEventPageSchema = z
  .object({
    events: z.array(shopEventSchema).max(50),
    lastEventNumber: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    requiresRehydrate: z.boolean(),
  })
  .strict();

export const shopReceiptSchema = z
  .object({
    receiptId: shopReceiptIdSchema,
    transactionId: uuidSchema,
    shopName: safeText(3, 80),
    itemName: safeText(1, 80),
    itemSlug: economyKeySchema,
    direction: shopTransactionDirectionSchema,
    quantity: z.number().int().min(1).max(99),
    unitPrice: z.number().int().min(1).max(1_000_000),
    totalDust: z.number().int().min(1).max(MAX_DUST_BALANCE),
    currency: z.literal('DUST'),
    status: z.enum(['completed', 'failed', 'blocked', 'reversed']),
    catalogVersion: z.number().int().positive(),
    resultingInventoryQuantity: z.number().int().nonnegative().nullable(),
    resultingDustBalance: dustBalanceSchema.nullable(),
    dustLedgerReceiptId: z
      .string()
      .regex(/^DUST-[A-F0-9]{20}$/u)
      .nullable(),
    supportReference: safeText(8, 40),
    correctionLinked: z.boolean(),
    createdAt: timestampSchema,
  })
  .strict();

export const shopTutorialSchema = z
  .object({
    questDefinitionId: uuidSchema,
    questVersionId: uuidSchema,
    name: safeText(3, 80),
    description: safeText(3, 500),
    eligible: z.boolean(),
    status: z.enum(['available', 'active', 'completed', 'reward_claimed']),
    stateVersion: z.number().int().positive().nullable(),
    rewardDust: z.number().int().nonnegative().max(1_000_000),
    requiredPurchaseItemSlug: economyKeySchema,
    requiredSaleItemSlug: economyKeySchema,
    objectives: z
      .array(
        z
          .object({
            key: economyOperationKeySchema,
            label: safeText(1, 120),
            requiredCount: z.number().int().positive().max(999),
            currentCount: z.number().int().nonnegative().max(999),
            completed: z.boolean(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();

export const shopCatalogEntrySchema = z
  .object({
    entryId: uuidSchema,
    offerId: uuidSchema,
    itemId: uuidSchema,
    itemSlug: economyKeySchema,
    itemName: safeText(1, 80),
    itemDescription: safeText(1, 280),
    itemCategory: z.enum([
      'seed',
      'crop',
      'ingredient',
      'cooked_food',
      'crafted_material',
      'furniture',
      'permanent_tool',
      'special',
    ]),
    assetRef: economyKeySchema.nullable(),
    assetReadiness: z.enum(['approved', 'development_marker', 'missing']),
    buyEnabled: z.boolean(),
    sellEnabled: z.boolean(),
    buyPrice: z.number().int().min(1).max(1_000_000).nullable(),
    sellPrice: z.number().int().min(1).max(1_000_000).nullable(),
    currency: z.literal('DUST'),
    minimumQuantity: z.number().int().min(1).max(99),
    maximumQuantity: z.number().int().min(1).max(99),
    ownedQuantity: z.number().int().nonnegative().max(1_000_000),
    stockMode: z.enum(['unlimited', 'global_limited', 'per_player_limited', 'hybrid']),
    stock: z.number().int().nonnegative().max(1_000_000).nullable(),
    maximumStock: z.number().int().positive().max(1_000_000).nullable(),
    stockRevision: z.number().int().positive(),
    nextRestockAt: timestampSchema.nullable(),
    playerBuyDailyLimit: z.number().int().positive().max(9_999),
    playerSellDailyLimit: z.number().int().positive().max(9_999),
    boughtToday: z.number().int().nonnegative().max(1_000_000),
    soldToday: z.number().int().nonnegative().max(1_000_000),
    remainingBuyToday: z.number().int().nonnegative().max(9_999),
    remainingSellToday: z.number().int().nonnegative().max(9_999),
    availabilityFrom: timestampSchema.nullable(),
    availabilityUntil: timestampSchema.nullable(),
    eligibilityRule: z.enum([
      'ordinary_gameplay',
      'phase11a_complete',
      'phase11b_complete',
      'tutorial_only',
    ]),
    eligible: z.boolean(),
    unavailableReason: safeText(1, 280).nullable(),
    entryRevision: z.number().int().positive(),
    displayOrder: z.number().int().positive().max(1_000),
  })
  .strict();

export const shopWorkspaceSchema = z
  .object({
    shop: z
      .object({
        shopId: uuidSchema,
        interactionId: shopInteractionIdSchema,
        worldObjectId: economyKeySchema,
        slug: economyKeySchema,
        name: safeText(3, 80),
        description: safeText(3, 280),
        shopType: z.literal('npc_general_store'),
        shopkeeper: z
          .object({
            id: uuidSchema,
            slug: economyKeySchema,
            name: safeText(1, 80),
            introduction: safeText(3, 500),
          })
          .strict(),
        worldId: economyKeySchema,
        worldRevisionId: uuidSchema,
        x: z.number().finite(),
        y: z.number().finite(),
        interactionRadius: z.number().positive().max(4),
        assetRef: economyKeySchema,
        assetVersionId: uuidSchema.nullable(),
        artworkReadiness: z.enum(['approved', 'development_marker']),
      })
      .strict(),
    catalog: z
      .object({
        catalogId: uuidSchema,
        catalogKey: economyKeySchema,
        publicName: safeText(3, 80),
        versionId: uuidSchema,
        versionNumber: z.number().int().positive(),
        revision: z.number().int().positive(),
        status: z.literal('published'),
        publishedAt: timestampSchema,
      })
      .strict(),
    availability: z
      .object({
        accessEnabled: z.boolean(),
        buyingEnabled: z.boolean(),
        sellingEnabled: z.boolean(),
        message: safeText(1, 280).nullable(),
        serverTime: timestampSchema,
      })
      .strict(),
    dust: z
      .object({ balance: dustBalanceSchema, stateVersion: z.number().int().positive() })
      .strict(),
    inventory: z
      .object({
        stateVersion: z.number().int().positive(),
        capacity: z.number().int().positive(),
        usedSlots: z.number().int().nonnegative(),
      })
      .strict(),
    entries: z.array(shopCatalogEntrySchema).max(100),
    receipts: z.array(shopReceiptSchema).max(50),
    nextReceiptCursor: timestampSchema.nullable(),
    tutorial: shopTutorialSchema.nullable(),
    lastEventNumber: z.number().int().nonnegative(),
    generatedAt: timestampSchema,
  })
  .strict();

export const shopTransactionRequestV2Schema = z
  .object({
    entryId: uuidSchema,
    direction: shopTransactionDirectionSchema,
    quantity: z.number().int().min(1).max(99),
    expectedUnitPrice: z.number().int().min(1).max(1_000_000),
    expectedCatalogVersionId: uuidSchema,
    expectedCatalogRevision: z.number().int().positive(),
    expectedEntryRevision: z.number().int().positive(),
    expectedStockRevision: z.number().int().positive().nullable(),
    expectedDustStateVersion: z.number().int().positive(),
    expectedInventoryStateVersion: z.number().int().positive(),
    idempotencyKey: z
      .string()
      .min(16)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]+$/u),
  })
  .strict();

export const shopTransactionResultSchema = z
  .object({
    status: z.enum(['completed', 'replayed']),
    replayed: z.boolean(),
    transactionId: uuidSchema,
    direction: shopTransactionDirectionSchema,
    itemSlug: economyKeySchema,
    quantity: z.number().int().min(1).max(99),
    dustDelta: signedDustDeltaSchema,
    dustBalance: dustBalanceSchema,
    dustStateVersion: z.number().int().positive(),
    inventoryStateVersion: z.number().int().positive(),
    stockRevision: z.number().int().positive(),
    receipt: shopReceiptSchema,
  })
  .strict();

export const shopTutorialMutationSchema = z
  .object({
    idempotencyKey: z
      .string()
      .min(16)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]+$/u),
  })
  .strict();

export const shopTutorialTurnInSchema = shopTutorialMutationSchema.extend({
  expectedQuestStateVersion: z.number().int().positive(),
});

export const starUtilityDefinitionSchema = z
  .object({
    key: economyKeySchema,
    label: safeText(3, 80),
    description: safeText(3, 500),
    category: z.enum(['access', 'cosmetic_entitlement', 'community_recognition']),
    status: z.enum(['current', 'future_design', 'rejected']),
    requiresTransaction: z.literal(false),
    transfersValue: z.literal(false),
    changesDustRewards: z.literal(false),
    changesGameplayPower: z.literal(false),
    custodyRequired: z.literal(false),
  })
  .strict();
export type StarUtilityDefinition = z.infer<typeof starUtilityDefinitionSchema>;
