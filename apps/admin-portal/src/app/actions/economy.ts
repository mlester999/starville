'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { requireAuthorizedAdmin } from '../../lib/auth/authorization';
import {
  addEconomyShopCatalogEntry,
  createEconomyCorrection,
  createEconomyPolicyDraft,
  createEconomyShopDraft,
  createEconomyShopCatalogSuccessor,
  economySimulationCandidateSchema,
  economySimulationScenarioSchema,
  reviewEconomyCorrection,
  reviewEconomyRisk,
  runEconomyReconciliation,
  runEconomySimulation,
  transitionEconomyPolicy,
  transitionEconomyShop,
  requestEconomyShopReconciliation,
  removeEconomyShopCatalogEntry,
  restockEconomyShop,
  updateEconomyShopCatalogEntry,
  updateEconomyShopLiveOps,
  updateEconomyShopOffer,
} from '../../lib/economy-api';

function field(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function checked(data: FormData, key: string): boolean {
  return data.get(key) === 'on' || data.get(key) === 'true';
}

function effectiveAt(data: FormData, required = true): string | undefined {
  const raw = field(data, 'effectiveAt');
  if (raw === '' && !required) return undefined;
  return z.coerce.date().parse(raw).toISOString();
}

function returnPath(data: FormData, fallback: string): string {
  const candidate = field(data, 'returnTo');
  return /^\/economy(?:\/[^?#]*)?$/u.test(candidate) ? candidate : fallback;
}

function complete(pathname: string, notice: string): never {
  for (const path of [
    '/economy',
    '/economy/ledger',
    '/economy/shops',
    '/economy/policies',
    '/economy/reconciliation',
    '/economy/risk',
    '/economy/corrections',
    '/economy/simulations',
    '/economy/audit',
  ]) {
    revalidatePath(path);
  }
  redirect(`${pathname}?notice=${encodeURIComponent(notice)}`);
}

export async function economyReconciliationAction(formData: FormData): Promise<void> {
  await requireAuthorizedAdmin('economy.audit.read');
  const raw = field(formData, 'playerProfileId');
  const playerProfileId = raw === '' ? null : z.uuid().parse(raw);
  await runEconomyReconciliation(playerProfileId, randomUUID());
  complete(
    '/economy/reconciliation',
    playerProfileId === null ? 'global-run-recorded' : 'player-run-recorded',
  );
}

export async function economyCorrectionAction(formData: FormData): Promise<void> {
  await requireAuthorizedAdmin('economy.correction.create');
  const input = z
    .object({
      playerProfileId: z.uuid(),
      delta: z.coerce
        .number()
        .int()
        .min(-1_000_000)
        .max(1_000_000)
        .refine((value) => value !== 0),
      reasonCategory: z.enum(['support_repair', 'incident_repair', 'migration_repair', 'refund']),
      relatedReference: z.string().trim().min(3).max(128),
      explanation: z.string().trim().min(20).max(820),
    })
    .parse({
      playerProfileId: field(formData, 'playerProfileId'),
      delta: field(formData, 'delta'),
      reasonCategory: field(formData, 'reasonCategory'),
      relatedReference: field(formData, 'relatedReference'),
      explanation: field(formData, 'explanation'),
    });
  await createEconomyCorrection(
    {
      playerProfileId: input.playerProfileId,
      delta: input.delta,
      reasonCategory: input.reasonCategory,
      explanation: `[Evidence: ${input.relatedReference}] ${input.explanation}`,
    },
    randomUUID(),
  );
  complete('/economy/corrections', 'correction-submitted-for-review');
}

export async function economyCorrectionReviewAction(formData: FormData): Promise<void> {
  await requireAuthorizedAdmin('economy.correction.review');
  const input = z
    .object({ id: z.uuid(), action: z.enum(['approve', 'reject']) })
    .parse({ id: field(formData, 'correctionId'), action: field(formData, 'action') });
  await reviewEconomyCorrection(input.id, input.action, randomUUID());
  complete('/economy/corrections', `correction-${input.action}-recorded`);
}

export async function economyRiskReviewAction(formData: FormData): Promise<void> {
  await requireAuthorizedAdmin('economy.risk.review');
  const input = z
    .object({
      id: z.uuid(),
      status: z.enum(['reviewing', 'dismissed', 'confirmed', 'resolved']),
    })
    .parse({ id: field(formData, 'signalId'), status: field(formData, 'status') });
  await reviewEconomyRisk(input.id, input.status, randomUUID());
  complete('/economy/risk', `risk-${input.status}`);
}

export async function economySimulationAction(formData: FormData): Promise<void> {
  await requireAuthorizedAdmin('economy.simulation.run');
  const selection = z
    .object({
      candidate: economySimulationCandidateSchema,
      scenario: economySimulationScenarioSchema,
      seed: z.coerce.number().int().min(1).max(2_147_483_647),
      playerCount: z.coerce
        .number()
        .pipe(z.union([z.literal(100), z.literal(1_000), z.literal(10_000)])),
      durationDays: z.coerce.number().pipe(z.union([z.literal(30), z.literal(90), z.literal(180)])),
    })
    .parse({
      candidate: field(formData, 'candidate') || 'current-baseline',
      scenario: field(formData, 'scenario') || 'balanced',
      seed: field(formData, 'seed') || '9001',
      playerCount: field(formData, 'playerCount') || '100',
      durationDays: field(formData, 'durationDays') || '30',
    });
  await runEconomySimulation(
    {
      ...selection,
      starterGrant: 250,
      beginnerProtectionDays: 3,
      meanDailySource: 18,
      sourceParticipationRate: 0.55,
      meanDailySink: 16,
      sinkParticipationRate: 0.5,
    },
    randomUUID(),
  );
  complete('/economy/simulations', 'simulation-recorded');
}

export async function economyPolicyDraftAction(formData: FormData): Promise<void> {
  await requireAuthorizedAdmin('economy.settings.edit');
  const input = z
    .object({
      baseVersionId: z.uuid(),
      starterGrant: z.coerce.number().int().min(0).max(10_000),
      beginnerProtectionHours: z.coerce.number().int().min(0).max(720),
      lowValueCorrectionLimit: z.coerce.number().int().min(1).max(100_000),
      highValueCorrectionLimit: z.coerce.number().int().min(1).max(1_000_000),
      purchaseRateLimitPerMinute: z.coerce.number().int().min(1).max(60),
      historyRetentionDays: z.coerce.number().int().min(30).max(2_555),
      riskReviewThreshold: z.coerce.number().min(0).max(100),
    })
    .refine((value) => value.lowValueCorrectionLimit < value.highValueCorrectionLimit)
    .parse({
      baseVersionId: field(formData, 'baseVersionId'),
      starterGrant: field(formData, 'starterGrant'),
      beginnerProtectionHours: field(formData, 'beginnerProtectionHours'),
      lowValueCorrectionLimit: field(formData, 'lowValueCorrectionLimit'),
      highValueCorrectionLimit: field(formData, 'highValueCorrectionLimit'),
      purchaseRateLimitPerMinute: field(formData, 'purchaseRateLimitPerMinute'),
      historyRetentionDays: field(formData, 'historyRetentionDays'),
      riskReviewThreshold: field(formData, 'riskReviewThreshold'),
    });
  await createEconomyPolicyDraft(
    {
      ...input,
      economyEnabled: checked(formData, 'economyEnabled'),
      purchasesEnabled: checked(formData, 'purchasesEnabled'),
      rewardsEnabled: checked(formData, 'rewardsEnabled'),
      correctionsEnabled: checked(formData, 'correctionsEnabled'),
      effectiveAt: effectiveAt(formData)!,
    },
    randomUUID(),
  );
  complete('/economy/policies', 'policy-draft-created');
}

export async function economyPolicyTransitionAction(formData: FormData): Promise<void> {
  const action = z
    .enum(['validate', 'submit_review', 'approve', 'schedule', 'publish', 'rollback'])
    .parse(field(formData, 'action'));
  await requireAuthorizedAdmin(
    action === 'approve' || action === 'publish' || action === 'schedule' || action === 'rollback'
      ? 'economy.settings.publish'
      : 'economy.settings.edit',
  );
  const input = z
    .object({ versionId: z.uuid(), expectedRevision: z.coerce.number().int().positive() })
    .parse({
      versionId: field(formData, 'versionId'),
      expectedRevision: field(formData, 'expectedRevision'),
    });
  await transitionEconomyPolicy(
    input.versionId,
    {
      action,
      expectedRevision: input.expectedRevision,
      ...(action === 'schedule' ? { effectiveAt: effectiveAt(formData)! } : {}),
    },
    randomUUID(),
  );
  complete(returnPath(formData, '/economy/policies'), `policy-${action}-recorded`);
}

export async function economyShopDraftAction(formData: FormData): Promise<void> {
  await requireAuthorizedAdmin('economy.shop.edit');
  const input = z
    .object({
      shopDefinitionId: z.uuid(),
      expectedActiveVersionId: z.uuid(),
      name: z.string().trim().min(3).max(80),
      description: z.string().trim().min(3).max(280),
    })
    .parse({
      shopDefinitionId: field(formData, 'shopDefinitionId'),
      expectedActiveVersionId: field(formData, 'expectedActiveVersionId'),
      name: field(formData, 'name'),
      description: field(formData, 'description'),
    });
  await createEconomyShopDraft(
    input.shopDefinitionId,
    {
      expectedActiveVersionId: input.expectedActiveVersionId,
      name: input.name,
      description: input.description,
      effectiveAt: effectiveAt(formData)!,
    },
    randomUUID(),
  );
  complete(`/economy/shops/${input.shopDefinitionId}`, 'shop-draft-created');
}

export async function economyShopCatalogSuccessorAction(formData: FormData): Promise<void> {
  await requireAuthorizedAdmin('economy.shop.edit');
  const input = z
    .object({
      shopDefinitionId: z.uuid(),
      expectedActiveVersionId: z.uuid(),
      name: z.string().trim().min(3).max(80),
      description: z.string().trim().min(3).max(280),
      reason: z.string().trim().min(12).max(500),
    })
    .parse({
      shopDefinitionId: field(formData, 'shopDefinitionId'),
      expectedActiveVersionId: field(formData, 'expectedActiveVersionId'),
      name: field(formData, 'name'),
      description: field(formData, 'description'),
      reason: field(formData, 'reason'),
    });
  await createEconomyShopCatalogSuccessor(input.shopDefinitionId, input, randomUUID());
  complete(`/economy/shops/${input.shopDefinitionId}`, 'shop-catalog-successor-created');
}

export async function economyShopCatalogEntryCreateAction(formData: FormData): Promise<void> {
  await requireAuthorizedAdmin('economy.shop.edit');
  const input = z
    .object({
      shopDefinitionId: z.uuid(),
      versionId: z.uuid(),
      offerId: z.uuid(),
      expectedVersionRevision: z.coerce.number().int().positive(),
      reason: z.string().trim().min(12).max(500),
    })
    .parse({
      shopDefinitionId: field(formData, 'shopDefinitionId'),
      versionId: field(formData, 'versionId'),
      offerId: field(formData, 'offerId'),
      expectedVersionRevision: field(formData, 'expectedVersionRevision'),
      reason: field(formData, 'reason'),
    });
  await addEconomyShopCatalogEntry(
    input.versionId,
    {
      offerId: input.offerId,
      expectedVersionRevision: input.expectedVersionRevision,
      reason: input.reason,
    },
    randomUUID(),
  );
  complete(`/economy/shops/${input.shopDefinitionId}`, 'shop-entry-created');
}

export async function economyShopCatalogEntryRemoveAction(formData: FormData): Promise<void> {
  await requireAuthorizedAdmin('economy.shop.edit');
  const input = z
    .object({
      shopDefinitionId: z.uuid(),
      versionId: z.uuid(),
      entryId: z.uuid(),
      expectedVersionRevision: z.coerce.number().int().positive(),
      expectedEntryRevision: z.coerce.number().int().positive(),
      reason: z.string().trim().min(12).max(500),
    })
    .parse({
      shopDefinitionId: field(formData, 'shopDefinitionId'),
      versionId: field(formData, 'versionId'),
      entryId: field(formData, 'entryId'),
      expectedVersionRevision: field(formData, 'expectedVersionRevision'),
      expectedEntryRevision: field(formData, 'expectedEntryRevision'),
      reason: field(formData, 'reason'),
    });
  await removeEconomyShopCatalogEntry(
    input.versionId,
    input.entryId,
    {
      expectedVersionRevision: input.expectedVersionRevision,
      expectedEntryRevision: input.expectedEntryRevision,
      reason: input.reason,
    },
    randomUUID(),
  );
  complete(`/economy/shops/${input.shopDefinitionId}`, 'shop-entry-removed');
}

export async function economyShopCatalogEntryAction(formData: FormData): Promise<void> {
  await requireAuthorizedAdmin('economy.shop.edit');
  const base = z
    .object({
      shopDefinitionId: z.uuid(),
      versionId: z.uuid(),
      entryId: z.uuid(),
      expectedRevision: z.coerce.number().int().positive(),
      buyPrice: z.coerce.number().int().min(1).max(1_000_000).optional(),
      sellPrice: z.coerce.number().int().min(1).max(1_000_000).optional(),
      stockMode: z.enum(['unlimited', 'global_limited', 'per_player_limited', 'hybrid']),
      restockMode: z.enum(['none', 'fixed_interval', 'daily_utc', 'manual']),
      maximumStock: z.coerce.number().int().min(1).max(1_000_000).optional(),
      restockAmount: z.coerce.number().int().min(1).max(1_000_000).optional(),
      restockIntervalSeconds: z.coerce.number().int().min(60).max(2_592_000).optional(),
      playerBuyDailyLimit: z.coerce.number().int().min(1).max(9_999),
      playerSellDailyLimit: z.coerce.number().int().min(1).max(9_999),
      eligibilityRule: z.enum([
        'ordinary_gameplay',
        'phase11a_complete',
        'phase11b_complete',
        'tutorial_only',
      ]),
      displayOrder: z.coerce.number().int().min(1).max(1_000),
      reason: z.string().trim().min(12).max(500),
    })
    .parse({
      shopDefinitionId: field(formData, 'shopDefinitionId'),
      versionId: field(formData, 'versionId'),
      entryId: field(formData, 'entryId'),
      expectedRevision: field(formData, 'expectedRevision'),
      ...(field(formData, 'buyPrice') === '' ? {} : { buyPrice: field(formData, 'buyPrice') }),
      ...(field(formData, 'sellPrice') === '' ? {} : { sellPrice: field(formData, 'sellPrice') }),
      stockMode: field(formData, 'stockMode'),
      restockMode: field(formData, 'restockMode'),
      ...(field(formData, 'maximumStock') === ''
        ? {}
        : { maximumStock: field(formData, 'maximumStock') }),
      ...(field(formData, 'restockAmount') === ''
        ? {}
        : { restockAmount: field(formData, 'restockAmount') }),
      ...(field(formData, 'restockIntervalSeconds') === ''
        ? {}
        : { restockIntervalSeconds: field(formData, 'restockIntervalSeconds') }),
      playerBuyDailyLimit: field(formData, 'playerBuyDailyLimit'),
      playerSellDailyLimit: field(formData, 'playerSellDailyLimit'),
      eligibilityRule: field(formData, 'eligibilityRule'),
      displayOrder: field(formData, 'displayOrder'),
      reason: field(formData, 'reason'),
    });
  const configuration: Record<string, unknown> = {
    buyEnabled: checked(formData, 'buyEnabled'),
    sellEnabled: checked(formData, 'sellEnabled'),
    stockMode: base.stockMode,
    restockMode: base.restockMode,
    playerBuyDailyLimit: base.playerBuyDailyLimit,
    playerSellDailyLimit: base.playerSellDailyLimit,
    eligibilityRule: base.eligibilityRule,
    displayOrder: base.displayOrder,
    enabled: checked(formData, 'enabled'),
  };
  if (base.buyPrice !== undefined) configuration['buyPrice'] = base.buyPrice;
  if (base.sellPrice !== undefined) configuration['sellPrice'] = base.sellPrice;
  if (base.maximumStock !== undefined) configuration['maximumStock'] = base.maximumStock;
  if (base.restockAmount !== undefined) configuration['restockAmount'] = base.restockAmount;
  if (base.restockIntervalSeconds !== undefined)
    configuration['restockIntervalSeconds'] = base.restockIntervalSeconds;
  await updateEconomyShopCatalogEntry(
    base.versionId,
    base.entryId,
    { expectedRevision: base.expectedRevision, configuration, reason: base.reason },
    randomUUID(),
  );
  complete(`/economy/shops/${base.shopDefinitionId}`, 'shop-entry-updated');
}

export async function economyShopLiveOpsAction(formData: FormData): Promise<void> {
  await requireAuthorizedAdmin('economy.live_ops.manage');
  const input = z
    .object({
      shopDefinitionId: z.uuid(),
      expectedRevision: z.coerce.number().int().positive(),
      globalDailySaleDustCap: z.coerce.number().int().min(1).max(1_000_000),
      maintenanceMessage: z.string().trim().min(3).max(280),
      reason: z.string().trim().min(12).max(1_000),
    })
    .parse({
      shopDefinitionId: field(formData, 'shopDefinitionId'),
      expectedRevision: field(formData, 'expectedRevision'),
      globalDailySaleDustCap: field(formData, 'globalDailySaleDustCap'),
      maintenanceMessage: field(formData, 'maintenanceMessage'),
      reason: field(formData, 'reason'),
    });
  await updateEconomyShopLiveOps(
    input.shopDefinitionId,
    {
      expectedRevision: input.expectedRevision,
      configuration: {
        accessEnabled: checked(formData, 'accessEnabled'),
        buyingEnabled: checked(formData, 'buyingEnabled'),
        sellingEnabled: checked(formData, 'sellingEnabled'),
        stockDecrementEnabled: checked(formData, 'stockDecrementEnabled'),
        restockEnabled: checked(formData, 'restockEnabled'),
        tutorialObjectivesEnabled: checked(formData, 'tutorialObjectivesEnabled'),
        tutorialRewardsEnabled: checked(formData, 'tutorialRewardsEnabled'),
        saleDustIssuanceEnabled: checked(formData, 'saleDustIssuanceEnabled'),
        globalDailySaleDustCap: input.globalDailySaleDustCap,
        maintenanceMessage: input.maintenanceMessage,
      },
      reason: input.reason,
    },
    randomUUID(),
  );
  complete(`/economy/shops/${input.shopDefinitionId}`, 'shop-live-ops-updated');
}

export async function economyShopRestockAction(formData: FormData): Promise<void> {
  await requireAuthorizedAdmin('economy.stock.manage');
  const input = z
    .object({
      shopDefinitionId: z.uuid(),
      catalogVersionId: z.uuid(),
      entryId: z.uuid(),
      expectedStockRevision: z.coerce.number().int().positive(),
      quantity: z.coerce.number().int().min(1).max(1_000_000),
      reason: z.string().trim().min(12).max(1_000),
    })
    .parse({
      shopDefinitionId: field(formData, 'shopDefinitionId'),
      catalogVersionId: field(formData, 'catalogVersionId'),
      entryId: field(formData, 'entryId'),
      expectedStockRevision: field(formData, 'expectedStockRevision'),
      quantity: field(formData, 'quantity'),
      reason: field(formData, 'reason'),
    });
  await restockEconomyShop(input.shopDefinitionId, input, randomUUID());
  complete(`/economy/shops/${input.shopDefinitionId}`, 'shop-stock-restocked');
}

export async function economyShopReconciliationAction(formData: FormData): Promise<void> {
  await requireAuthorizedAdmin('economy.reconciliation.manage');
  const input = z
    .object({
      shopDefinitionId: z.uuid(),
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
    .parse({
      shopDefinitionId: field(formData, 'shopDefinitionId'),
      transactionId: field(formData, 'transactionId'),
      reconciliationType: field(formData, 'reconciliationType'),
      reason: field(formData, 'reason'),
    });
  await requestEconomyShopReconciliation(input.shopDefinitionId, input, randomUUID());
  complete(`/economy/shops/${input.shopDefinitionId}`, 'shop-reconciliation-requested');
}

export async function economyShopOfferAction(formData: FormData): Promise<void> {
  await requireAuthorizedAdmin('economy.shop.edit');
  const input = z
    .object({
      shopDefinitionId: z.uuid(),
      versionId: z.uuid(),
      offerId: z.uuid(),
      expectedShopRevision: z.coerce.number().int().positive(),
      unitPrice: z.coerce.number().int().min(1).max(1_000_000),
      maximumQuantity: z.coerce.number().int().min(1).max(99),
      dailyLimit: z.coerce.number().int().min(1).max(999),
      cooldownSeconds: z.coerce.number().int().min(0).max(86_400),
    })
    .parse({
      shopDefinitionId: field(formData, 'shopDefinitionId'),
      versionId: field(formData, 'versionId'),
      offerId: field(formData, 'offerId'),
      expectedShopRevision: field(formData, 'expectedShopRevision'),
      unitPrice: field(formData, 'unitPrice'),
      maximumQuantity: field(formData, 'maximumQuantity'),
      dailyLimit: field(formData, 'dailyLimit'),
      cooldownSeconds: field(formData, 'cooldownSeconds'),
    });
  await updateEconomyShopOffer(
    input.versionId,
    input.offerId,
    {
      expectedShopRevision: input.expectedShopRevision,
      unitPrice: input.unitPrice,
      maximumQuantity: input.maximumQuantity,
      dailyLimit: input.dailyLimit,
      cooldownSeconds: input.cooldownSeconds,
      enabled: checked(formData, 'enabled'),
    },
    randomUUID(),
  );
  complete(`/economy/shops/${input.shopDefinitionId}`, 'shop-offer-updated');
}

export async function economyShopTransitionAction(formData: FormData): Promise<void> {
  const action = z
    .enum(['validate', 'submit_review', 'approve', 'schedule', 'publish', 'disable', 'rollback'])
    .parse(field(formData, 'action'));
  await requireAuthorizedAdmin(
    action === 'approve' ||
      action === 'publish' ||
      action === 'schedule' ||
      action === 'disable' ||
      action === 'rollback'
      ? 'economy.shop.publish'
      : 'economy.shop.edit',
  );
  const input = z
    .object({
      shopDefinitionId: z.uuid(),
      versionId: z.uuid(),
      expectedRevision: z.coerce.number().int().positive(),
    })
    .parse({
      shopDefinitionId: field(formData, 'shopDefinitionId'),
      versionId: field(formData, 'versionId'),
      expectedRevision: field(formData, 'expectedRevision'),
    });
  await transitionEconomyShop(
    input.versionId,
    {
      action,
      expectedRevision: input.expectedRevision,
      ...(action === 'schedule' ? { effectiveAt: effectiveAt(formData)! } : {}),
    },
    randomUUID(),
  );
  complete(`/economy/shops/${input.shopDefinitionId}`, `shop-${action}-recorded`);
}
