import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { performance } from 'node:perf_hooks';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ADMIN_PERMISSION_KEYS } from '@starville/admin-auth';
import {
  ECONOMY_TUNING_CANDIDATES,
  ECONOMY_TUNING_RECOMMENDATION,
  cosmeticParticipationScenarioSchema,
  economySimulationScenarioSchema,
  runCosmeticEconomyParticipationComparison,
  runEconomySimulation,
  type EconomySimulationInput,
} from '@starville/economy-simulation';
import type { TokenAccessSessionView } from '@starville/wallet-access';

import { buildApiApp } from '../apps/api/src/app.js';
import type { AdminAuthGateway, LogContext, ServiceLogger } from '../apps/api/src/contracts.js';
import type {
  EconomyGateway,
  EconomyPurchaseResult,
  PlayerEconomyPurchase,
} from '../apps/api/src/economy/gateway.js';
import type { PlayerService } from '../apps/api/src/player/contracts.js';
import type { TokenAccessService } from '../apps/api/src/token-access/contracts.js';
import { howToPlayPage } from '../apps/landing/src/content/docs/how-to-play.js';
import {
  createDocumentationSearchIndex,
  DOCUMENTATION_ROUTES,
  searchDocumentation,
} from '../apps/landing/src/content/docs/pages.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generatedAt = '2026-07-15T00:00:00.000Z';
const allowedOrigin = 'http://localhost:3001';
const shopVersionId = '99000000-0000-4000-8000-000000000031';
const offerId = '74000000-0000-4000-8000-000000000011';
const walletAlphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function uuidFor(value: number, prefix = 'a'): string {
  return `${prefix}0000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}

function walletFor(index: number): string {
  const suffix = walletAlphabet[index];
  if (suffix === undefined) throw new Error(`No controlled wallet suffix exists for ${index}.`);
  return `1111111111111111111111111111111${suffix}`;
}

function receiptId(prefix: 'DUST' | 'SHOP', value: number): string {
  return `${prefix}-${value.toString(16).toUpperCase().padStart(20, '0')}`;
}

interface ControlledPlayerState {
  balance: number;
  dustVersion: number;
  inventoryVersion: number;
  itemCount: number;
  ledgerTotal: number;
  purchaseDebitTotal: number;
}

class ControlledEconomyGateway implements EconomyGateway {
  readonly players = new Map<string, ControlledPlayerState>();
  readonly receipts = new Map<string, EconomyPurchaseResult>();
  readonly rewardRequests = new Set<string>();
  readonly correctionRequests = new Set<string>();
  private receiptSequence = 1;
  private correctionSequence = 1;

  state(walletAddress: string): ControlledPlayerState {
    const existing = this.players.get(walletAddress);
    if (existing !== undefined) return existing;
    const created = {
      balance: 1_000,
      dustVersion: 1,
      inventoryVersion: 1,
      itemCount: 0,
      ledgerTotal: 1_000,
      purchaseDebitTotal: 0,
    };
    this.players.set(walletAddress, created);
    return created;
  }

  purchaseInput(walletAddress: string, sequence: number): PlayerEconomyPurchase {
    const player = this.state(walletAddress);
    return {
      offerId,
      quantity: 1,
      expectedUnitPrice: 8,
      expectedShopVersionId: shopVersionId,
      expectedShopRevision: 1,
      expectedDustStateVersion: player.dustVersion,
      expectedInventoryStateVersion: player.inventoryVersion,
      idempotencyKey: uuidFor(sequence, 'c'),
    };
  }

  async playerEconomy(walletAddress: string) {
    const player = this.state(walletAddress);
    return {
      dustBalance: player.balance,
      dustStateVersion: player.dustVersion,
      policyVersion: 1,
      history: [],
      nextCursor: null,
      generatedAt,
    };
  }

  async playerShop(walletAddress: string) {
    this.state(walletAddress);
    return {
      availability: 'open' as const,
      shop: {
        shopKey: 'village-supply-shop',
        name: 'Village Supply Shop',
        versionId: shopVersionId,
        versionNumber: 1,
        revision: 1,
        status: 'published' as const,
        interactionKey: 'lantern-general-store',
        publishedAt: generatedAt,
      },
      offers: [
        {
          offerId,
          itemSlug: 'moonbean-seed',
          itemName: 'Moonbean Seed',
          itemDescription: 'A gentle meadow seed for Moonbeans.',
          itemCategory: 'seed' as const,
          unitPrice: 8,
          maximumQuantity: 20,
          dailyLimit: 40,
          cooldownSeconds: 0,
          inventoryCapacityCost: 1,
          protectedItem: false as const,
          enabled: true,
          revision: 1,
          purchasedToday: 0,
          remainingToday: 40,
          availableAt: null,
        },
      ],
      generatedAt,
    };
  }

  async purchase(
    walletAddress: string,
    _shopSlug: string,
    input: PlayerEconomyPurchase,
  ): Promise<EconomyPurchaseResult | 'state_conflict' | 'insufficient_dust'> {
    const key = `${walletAddress}:${input.idempotencyKey}`;
    const existing = this.receipts.get(key);
    if (existing !== undefined) return { ...existing, status: 'replayed', replayed: true };

    const player = this.state(walletAddress);
    if (
      input.expectedDustStateVersion !== player.dustVersion ||
      input.expectedInventoryStateVersion !== player.inventoryVersion
    ) {
      return 'state_conflict';
    }
    const total = input.expectedUnitPrice * input.quantity;
    if (player.balance < total) return 'insufficient_dust';

    player.balance -= total;
    player.dustVersion += 1;
    player.inventoryVersion += 1;
    player.itemCount += input.quantity;
    player.ledgerTotal -= total;
    player.purchaseDebitTotal += total;
    const sequence = this.receiptSequence++;
    const result: EconomyPurchaseResult = {
      status: 'updated',
      replayed: false,
      transactionId: uuidFor(sequence, 'd'),
      operation: 'buy',
      itemSlug: 'moonbean-seed',
      quantity: input.quantity,
      dustDelta: -total,
      dustBalance: player.balance,
      dustStateVersion: player.dustVersion,
      inventoryStateVersion: player.inventoryVersion,
      receipt: {
        receiptId: receiptId('SHOP', sequence),
        shopVersionId,
        offerId,
        itemSlug: 'moonbean-seed',
        quantity: input.quantity,
        unitPrice: input.expectedUnitPrice,
        totalPrice: total,
        ledgerReceiptId: receiptId('DUST', sequence),
        settledAt: generatedAt,
      },
    };
    this.receipts.set(key, result);
    return result;
  }

  async shopWorkspace() {
    return 'shop_not_found' as const;
  }

  async transactShop() {
    return 'shop_not_found' as const;
  }

  async shopEvents() {
    return 'shop_not_found' as const;
  }

  async shopReceipt() {
    return 'receipt_not_found' as const;
  }

  async acceptShopTutorial() {
    return 'quest_not_available' as const;
  }

  async turnInShopTutorial() {
    return 'quest_not_available' as const;
  }

  async overview() {
    const balances = [...this.players.values()].map((player) => player.balance);
    const totalSupply = balances.reduce((sum, balance) => sum + balance, 0);
    return {
      generatedAt,
      dust: {
        totalSupply,
        accountCount: balances.length,
        fundedPlayerCount: balances.filter((balance) => balance > 0).length,
        averageBalance: balances.length === 0 ? 0 : totalSupply / balances.length,
        medianBalance:
          balances.length === 0
            ? 0
            : [...balances].sort((a, b) => a - b)[Math.floor(balances.length / 2)]!,
        maximumBalance: balances.length === 0 ? 0 : Math.max(...balances),
        ledgerEntryCount:
          this.receipts.size + this.rewardRequests.size + this.correctionRequests.size,
        lifetimeCreated: 20_000,
        lifetimeDestroyed: this.receipts.size * 8,
        created30d: 1_000,
        destroyed30d: this.receipts.size * 8,
        createdToday: this.rewardRequests.size * 15,
        destroyedToday: this.receipts.size * 8,
        created7d: 500,
        destroyed7d: this.receipts.size * 8,
        dailyEmissionEstimate: 50,
        dailySinkEstimate: 40,
        sourceToSinkRatio: 1.25,
        inactiveBalancePercentage: 0,
      },
      openRiskSignals: 0,
      openCorrections: 0,
      reconciliationMismatches: this.mismatchCount(),
      sources: [],
      sinks: [],
      starUtility: [],
      activePolicy: {
        id: '99000000-0000-4000-8000-000000000001',
        versionNumber: 1,
        status: 'published',
        effectiveAt: generatedAt,
      },
      shops: { active: 1, disabled: 0, scheduled: 0 },
      latestSimulation: null,
    };
  }

  async ledger(_identity: unknown, query: { page: number; pageSize: number }) {
    return { items: [], page: query.page, pageSize: query.pageSize, total: 0, totalPages: 0 };
  }

  async workspace(_identity: unknown, section: string) {
    return {
      section,
      items: section === 'risk' ? [] : undefined,
      generatedAt,
      playerBalancesMutated: false,
    };
  }

  async reconcile() {
    return {
      status: 'completed',
      checkedCount: this.players.size,
      mismatchCount: this.mismatchCount(),
    };
  }

  async createCorrection() {
    return { status: 'pending_review', correctionId: uuidFor(this.correctionSequence++, 'e') };
  }

  async reviewCorrection() {
    return { status: 'settled' };
  }

  async reviewRisk() {
    return { status: 'reviewing' };
  }

  async simulate(_identity: unknown, input: EconomySimulationInput) {
    return { ...runEconomySimulation(input), runId: uuidFor(1, 'f') };
  }

  async createPolicyDraft() {
    return { status: 'draft', versionId: uuidFor(1, 'a'), revision: 1 };
  }

  async transitionPolicy() {
    return { status: 'validated', revision: 2 };
  }

  async createShopDraft() {
    return { status: 'draft', versionId: uuidFor(2, 'a'), revision: 1 };
  }

  async updateShopOffer() {
    return { status: 'updated', revision: 2 };
  }

  async transitionShop() {
    return { status: 'validated', revision: 2 };
  }

  async shopOperations() {
    return { status: 'not_exercised' };
  }

  async createShopCatalogSuccessor() {
    return { status: 'not_exercised' };
  }

  async addShopCatalogEntry() {
    return { status: 'not_exercised' };
  }

  async updateShopCatalogEntry() {
    return { status: 'not_exercised' };
  }

  async removeShopCatalogEntry() {
    return { status: 'not_exercised' };
  }

  async updateShopLiveOps() {
    return { status: 'not_exercised' };
  }

  async restockShop() {
    return { status: 'not_exercised' };
  }

  async requestShopReconciliation() {
    return { status: 'not_exercised' };
  }

  applyReward(walletAddress: string, idempotencyKey: string): boolean {
    const key = `${walletAddress}:${idempotencyKey}`;
    if (this.rewardRequests.has(key)) return false;
    this.rewardRequests.add(key);
    const player = this.state(walletAddress);
    player.balance += 15;
    player.dustVersion += 1;
    player.ledgerTotal += 15;
    return true;
  }

  applyCorrection(walletAddress: string, idempotencyKey: string, delta: number): boolean {
    const key = `${walletAddress}:${idempotencyKey}`;
    if (this.correctionRequests.has(key)) return false;
    this.correctionRequests.add(key);
    const player = this.state(walletAddress);
    if (player.balance + delta < 0) return false;
    player.balance += delta;
    player.dustVersion += 1;
    player.ledgerTotal += delta;
    return true;
  }

  mismatchCount(): number {
    return [...this.players.values()].filter((player) => player.balance !== player.ledgerTotal)
      .length;
  }
}

class SilentLogger implements ServiceLogger {
  child(_bindings: LogContext): ServiceLogger {
    return this;
  }
  trace(_message: string, _context?: LogContext): void {}
  debug(_message: string, _context?: LogContext): void {}
  info(_message: string, _context?: LogContext): void {}
  warn(_message: string, _context?: LogContext): void {}
  error(_message: string, _context?: LogContext): void {}
  fatal(_message: string, _context?: LogContext): void {}
}

interface LatencySummary {
  readonly count: number;
  readonly averageMilliseconds: number;
  readonly p50Milliseconds: number;
  readonly p95Milliseconds: number;
  readonly maximumMilliseconds: number;
}

function latencySummary(samples: readonly number[]): LatencySummary {
  if (samples.length === 0) {
    return {
      count: 0,
      averageMilliseconds: 0,
      p50Milliseconds: 0,
      p95Milliseconds: 0,
      maximumMilliseconds: 0,
    };
  }
  const ordered = [...samples].sort((left, right) => left - right);
  const percentile = (value: number) =>
    ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * value))]!;
  return {
    count: ordered.length,
    averageMilliseconds: Number(
      (ordered.reduce((sum, sample) => sum + sample, 0) / ordered.length).toFixed(3),
    ),
    p50Milliseconds: Number(percentile(0.5).toFixed(3)),
    p95Milliseconds: Number(percentile(0.95).toFixed(3)),
    maximumMilliseconds: Number(ordered.at(-1)!.toFixed(3)),
  };
}

function assertStatuses(
  label: string,
  responses: readonly { readonly statusCode: number }[],
  expected: number,
): void {
  const unexpected = responses.filter((response) => response.statusCode !== expected);
  if (unexpected.length > 0) {
    throw new Error(`${label} returned ${unexpected.length} unexpected HTTP statuses.`);
  }
}

async function runControlledApiLoad() {
  const gateway = new ControlledEconomyGateway();
  const players = Array.from({ length: 20 }, (_, index) => walletFor(index));
  for (const wallet of players) gateway.state(wallet);

  const identity = {
    userId: '90000000-0000-4000-8000-000000000001',
    authSessionId: '90000000-0000-4000-8000-000000000002',
    assuranceLevel: 'aal2' as const,
    authenticationMethods: ['password', 'totp'],
  };
  const adminGateway: AdminAuthGateway = {
    verifyBearer: async () => identity,
    loadAuthorization: async () => ({
      outcome: 'authorized',
      context: {
        userId: identity.userId,
        displayName: 'Controlled Load Administrator',
        adminStatus: 'active',
        roleKey: 'super_admin',
        roleName: 'Super Administrator',
        permissionKeys: [...ADMIN_PERMISSION_KEYS],
        adminSessionId: '90000000-0000-4000-8000-000000000003',
        sessionExpiresAt: '2026-07-15T01:00:00.000Z',
        mfaRequired: true,
        assuranceLevel: 'aal2',
        lastLoginAt: generatedAt,
      },
    }),
    createSession: async () => ({ outcome: 'unauthorized' }),
    revokeCurrentSession: async () => true,
    recordDenial: async () => undefined,
  };
  const grantedView = (walletAddress: string): TokenAccessSessionView => ({
    access: 'granted',
    walletAddress,
    network: 'solana:mainnet-beta',
    symbol: 'STAR',
    requiredAmount: '1000',
    observedAmount: '1000',
    expiresAt: '2026-07-15T01:00:00.000Z',
    recheckAfter: '2026-07-15T00:05:00.000Z',
  });
  const tokenAccessService = {
    getCurrentSession: async (token: string | undefined) => {
      const match = /^player-(\d{2})$/u.exec(token ?? '');
      const index = match?.[1] === undefined ? 0 : Number(match[1]);
      return { view: grantedView(walletFor(index)) };
    },
  } as unknown as TokenAccessService;
  const playerService = {
    loadEntry: async (walletAddress: string) => ({
      entryState: 'active' as const,
      profile: {
        id: uuidFor(players.indexOf(walletAddress) + 1, 'b'),
        displayName: 'Controlled Villager',
        appearancePreset: 'moss',
        mapId: 'lantern-square',
        mapVersionId: null,
        x: 12,
        y: 7,
        facingDirection: 'south' as const,
        gameStateVersion: 1,
        stateVersion: 1,
        lastTransitionAt: null,
        createdAt: generatedAt,
        updatedAt: generatedAt,
        lastEnteredAt: generatedAt,
      },
    }),
  } as unknown as PlayerService;

  const app = buildApiApp({
    config: {
      environment: 'test',
      host: '127.0.0.1',
      port: 4_000,
      corsAllowedOrigins: [allowedOrigin],
      trustedProxyCidrs: [],
    },
    logger: new SilentLogger(),
    adminAuthGateway: adminGateway,
    adminSessionTtlMinutes: 60,
    tokenAccess: {
      service: tokenAccessService,
      cookieHashSecret: 'controlled-load-cookie-secret-with-32-chars',
      cookieSecure: false,
      cookieMaxAgeSeconds: 900,
      playerService,
    },
    economy: { gateway },
  });
  const samples = new Map<string, number[]>();
  const measure = async <T>(label: string, operation: () => Promise<T>): Promise<T> => {
    const startedAt = performance.now();
    const result = await operation();
    const existing = samples.get(label) ?? [];
    existing.push(performance.now() - startedAt);
    samples.set(label, existing);
    return result;
  };
  const adminHeaders = { authorization: 'Bearer controlled-load' };
  const mutationHeaders = { ...adminHeaders, origin: allowedOrigin };
  const playerHeaders = (index: number) => ({
    cookie: `starville-token-access=player-${String(index).padStart(2, '0')}`,
  });
  const playerMutationHeaders = (index: number) => ({
    ...playerHeaders(index),
    origin: allowedOrigin,
  });
  const purchasePayloads = players.map((wallet, index) => gateway.purchaseInput(wallet, index + 1));

  try {
    await app.ready();
    const summaryReads = await Promise.all(
      Array.from({ length: 40 }, () =>
        measure('economySummaryApi', () =>
          app.inject({ method: 'GET', url: '/api/v1/admin/economy', headers: adminHeaders }),
        ),
      ),
    );
    assertStatuses('Economy summary reads', summaryReads, 200);

    const shopReads = await Promise.all(
      Array.from({ length: 40 }, (_, index) =>
        measure('shopCatalogApi', () =>
          app.inject({
            method: 'GET',
            url: '/api/v1/token-access/player/economy/shops/lantern-general-store',
            headers: playerHeaders(index % players.length),
          }),
        ),
      ),
    );
    assertStatuses('Shop catalog reads', shopReads, 200);

    const purchases = await Promise.all(
      purchasePayloads.map((payload, index) =>
        measure('purchaseApi', () =>
          app.inject({
            method: 'POST',
            url: '/api/v1/token-access/player/economy/shops/lantern-general-store/purchase',
            headers: playerMutationHeaders(index),
            payload,
          }),
        ),
      ),
    );
    assertStatuses('Valid purchases', purchases, 200);

    const duplicateRetries = await Promise.all(
      purchasePayloads.map((payload, index) =>
        measure('duplicatePurchaseRetryApi', () =>
          app.inject({
            method: 'POST',
            url: '/api/v1/token-access/player/economy/shops/lantern-general-store/purchase',
            headers: playerMutationHeaders(index),
            payload,
          }),
        ),
      ),
    );
    assertStatuses('Duplicate purchase retries', duplicateRetries, 200);
    if (duplicateRetries.some((response) => response.json().data?.replayed !== true)) {
      throw new Error('A duplicate purchase retry did not return the authoritative replay.');
    }

    const rewardBurst = await Promise.all(
      players.map((wallet, index) =>
        index % 2 === 0
          ? measure('purchaseRewardBurstApi', () =>
              app.inject({
                method: 'POST',
                url: '/api/v1/token-access/player/economy/shops/lantern-general-store/purchase',
                headers: playerMutationHeaders(index),
                payload: gateway.purchaseInput(wallet, 100 + index),
              }),
            )
          : Promise.resolve({
              statusCode: gateway.applyReward(wallet, `moonpetal-${index}`) ? 200 : 409,
            }),
      ),
    );
    assertStatuses('Purchase and Moonpetal burst', rewardBurst, 200);

    const correctionBurst = await Promise.all(
      players.map((wallet, index) =>
        index % 2 === 1
          ? measure('purchaseCorrectionBurstApi', () =>
              app.inject({
                method: 'POST',
                url: '/api/v1/token-access/player/economy/shops/lantern-general-store/purchase',
                headers: playerMutationHeaders(index),
                payload: gateway.purchaseInput(wallet, 200 + index),
              }),
            )
          : Promise.resolve({
              statusCode: gateway.applyCorrection(wallet, `correction-${index}`, 5) ? 200 : 409,
            }),
      ),
    );
    assertStatuses('Purchase and correction load', correctionBurst, 200);

    const ledgerReads = await Promise.all(
      Array.from({ length: 40 }, () =>
        measure('ledgerApi', () =>
          app.inject({
            method: 'GET',
            url: '/api/v1/admin/economy/ledger?page=1&pageSize=50',
            headers: adminHeaders,
          }),
        ),
      ),
    );
    assertStatuses('Ledger reads', ledgerReads, 200);

    const reconciliations = await Promise.all(
      Array.from({ length: 10 }, () =>
        measure('reconciliationApi', () =>
          app.inject({
            method: 'POST',
            url: '/api/v1/admin/economy/reconciliation',
            headers: mutationHeaders,
            payload: { playerProfileId: null },
          }),
        ),
      ),
    );
    assertStatuses('Reconciliation batch', reconciliations, 200);

    const riskReads = await Promise.all(
      Array.from({ length: 40 }, () =>
        measure('riskAggregationApi', () =>
          app.inject({
            method: 'GET',
            url: '/api/v1/admin/economy/risk?page=1&pageSize=50',
            headers: adminHeaders,
          }),
        ),
      ),
    );
    assertStatuses('Risk aggregation reads', riskReads, 200);

    const policyValidations = await Promise.all(
      Array.from({ length: 20 }, () =>
        measure('policyValidationApi', () =>
          app.inject({
            method: 'POST',
            url: `/api/v1/admin/economy/policies/${uuidFor(10, 'a')}/transition`,
            headers: mutationHeaders,
            payload: { action: 'validate', expectedRevision: 1, effectiveAt: null },
          }),
        ),
      ),
    );
    assertStatuses('Policy validation burst', policyValidations, 200);

    const shopValidations = await Promise.all(
      Array.from({ length: 20 }, () =>
        measure('shopValidationApi', () =>
          app.inject({
            method: 'POST',
            url: `/api/v1/admin/economy/shops/versions/${uuidFor(11, 'a')}/transition`,
            headers: mutationHeaders,
            payload: { action: 'validate', expectedRevision: 1, effectiveAt: null },
          }),
        ),
      ),
    );
    assertStatuses('Shop validation burst', shopValidations, 200);

    const correctionCreates = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        measure('correctionApi', () =>
          app.inject({
            method: 'POST',
            url: '/api/v1/admin/economy/corrections',
            headers: mutationHeaders,
            payload: {
              playerProfileId: uuidFor(index + 1, 'b'),
              delta: 5,
              reasonCategory: 'support_repair',
              explanation: 'Controlled local correction load with no persistent database write.',
            },
          }),
        ),
      ),
    );
    assertStatuses('Correction creation load', correctionCreates, 200);

    const safeRejections = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        measure('expectedRejectionApi', () =>
          app.inject({
            method: 'POST',
            url: '/api/v1/token-access/player/economy/shops/lantern-general-store/purchase',
            headers: playerMutationHeaders(index),
            payload: {
              ...gateway.purchaseInput(players[index]!, 300 + index),
              expectedDustStateVersion: 1,
              expectedInventoryStateVersion: 1,
            },
          }),
        ),
      ),
    );
    assertStatuses('Expected stale-state rejections', safeRejections, 409);
    const rejectionCounts = safeRejections.reduce<Record<string, number>>((counts, response) => {
      const code = String(response.json().error?.code ?? 'UNKNOWN');
      counts[code] = (counts[code] ?? 0) + 1;
      return counts;
    }, {});

    const replayReceiptCount = duplicateRetries.filter(
      (response) => response.json().data?.replayed === true,
    ).length;
    if (gateway.mismatchCount() !== 0) {
      throw new Error('Controlled economy load produced a ledger/account mismatch.');
    }
    if (gateway.receipts.size !== 40 || replayReceiptCount !== 20) {
      throw new Error('Controlled purchase load violated exact receipt or replay counts.');
    }
    const latency = Object.fromEntries(
      [...samples.entries()].map(([label, values]) => [label, latencySummary(values)]),
    );
    return {
      scope:
        'Fastify route injection over an isolated deterministic authority; no database or hosted writes',
      workload: {
        economySummaryReads: summaryReads.length,
        shopCatalogReads: shopReads.length,
        validPurchases: purchases.length,
        duplicatePurchaseRetries: duplicateRetries.length,
        purchaseAndMoonpetalOperations: rewardBurst.length,
        purchaseAndCorrectionOperations: correctionBurst.length,
        ledgerReads: ledgerReads.length,
        reconciliationRuns: reconciliations.length,
        riskAggregationReads: riskReads.length,
        policyValidations: policyValidations.length,
        shopValidations: shopValidations.length,
        correctionCreations: correctionCreates.length,
      },
      latency,
      rejectionCounts,
      duplicatePrevention: {
        replayedPurchaseCount: replayReceiptCount,
        duplicateDebitCount: 0,
        duplicateItemCount: 0,
      },
      mismatchCount: gateway.mismatchCount(),
      negativeBalanceCount: [...gateway.players.values()].filter((player) => player.balance < 0)
        .length,
      partialSettlementCount: [...gateway.players.values()].filter(
        (player) => player.itemCount * 8 !== player.purchaseDebitTotal,
      ).length,
    };
  } finally {
    await app.close();
  }
}

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('Could not reserve a local documentation port.');
  }
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
  return address.port;
}

async function waitForLocalServer(url: string, exited: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (exited()) throw new Error('The local documentation server exited before readiness.');
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The bounded local server is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  throw new Error('The local documentation server did not become ready within five seconds.');
}

async function runDocumentationLoad() {
  const searchEntries = createDocumentationSearchIndex([howToPlayPage]);
  const searchSamples: number[] = [];
  let searchCount = 0;
  for (let round = 0; round < 40; round += 1) {
    for (const entry of searchEntries) {
      const query = entry.title.split(/\s+/u)[0]!;
      const startedAt = performance.now();
      const results = searchDocumentation(searchEntries, query, 8);
      searchSamples.push(performance.now() - startedAt);
      searchCount += 1;
      if (results.length === 0) {
        throw new Error(`Documentation search returned no guide for '${query}'.`);
      }
    }
  }

  const port = await reservePort();
  let exited = false;
  let exitCode: number | null = null;
  let stderr = '';
  const child = spawn(
    process.execPath,
    [
      'scripts/with-env.mjs',
      '--profile',
      'landing',
      '--set',
      'NODE_ENV=production',
      'pnpm',
      '--filter',
      '@starville/landing',
      'start',
    ],
    {
      cwd: repositoryRoot,
      env: { ...process.env, LANDING_PORT: String(port) },
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-4_000);
  });
  child.once('exit', (code) => {
    exited = true;
    exitCode = code;
  });

  const routeSamples: number[] = [];
  let renderedBytes = 0;
  try {
    await waitForLocalServer(`http://127.0.0.1:${String(port)}/docs`, () => exited);
    for (const route of DOCUMENTATION_ROUTES) {
      const startedAt = performance.now();
      const response = await fetch(`http://127.0.0.1:${String(port)}${route}`);
      const html = await response.text();
      routeSamples.push(performance.now() - startedAt);
      renderedBytes += Buffer.byteLength(html);
      if (!response.ok || !/<h1(?:\s|>)/u.test(html) || html.length < 1_000) {
        throw new Error(`Documentation route ${route} did not render a complete public page.`);
      }
    }
  } finally {
    if (!exited) child.kill('SIGTERM');
    await new Promise<void>((resolveExit) => {
      if (exited) {
        resolveExit();
        return;
      }
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        resolveExit();
      }, 3_000);
      child.once('exit', () => {
        clearTimeout(timeout);
        resolveExit();
      });
    });
  }
  if (exitCode !== null && exitCode !== 0 && exitCode !== 143) {
    throw new Error(`Local documentation rendering exited unexpectedly. ${stderr.trim()}`);
  }
  return {
    scope:
      'local production Next.js rendering and in-memory typed search; no remote search service',
    searchCount,
    searchLatency: latencySummary(searchSamples),
    renderedRouteCount: DOCUMENTATION_ROUTES.length,
    routeRenderLatency: latencySummary(routeSamples),
    renderedBytes,
  };
}

async function main(): Promise<void> {
  const controlledApiLoad = await runControlledApiLoad();
  const documentationLoad = await runDocumentationLoad();

  const populations = [100, 1_000, 10_000] as const;
  const reports = populations.map((playerCount, index) => {
    const input = {
      seed: 9_100 + index,
      playerCount,
      durationDays: 180 as const,
      starterGrant: 250,
      meanDailySource: 18,
      sourceParticipationRate: 0.55,
      meanDailySink: 16,
      sinkParticipationRate: 0.5,
      beginnerProtectionDays: 3,
      scenario: 'balanced' as const,
    };
    const startedAt = performance.now();
    const first = runEconomySimulation(input);
    const durationMilliseconds = performance.now() - startedAt;
    const replay = runEconomySimulation(input);
    if (JSON.stringify(first) !== JSON.stringify(replay)) {
      throw new Error(
        `The ${playerCount.toLocaleString()}-player simulation was not deterministic.`,
      );
    }
    if (first.negativeBalanceCount !== 0 || first.reconciliationMismatchCount !== 0) {
      throw new Error(`The ${playerCount.toLocaleString()}-player simulation violated invariants.`);
    }
    return {
      playerCount,
      durationDays: input.durationDays,
      durationMilliseconds: Number(durationMilliseconds.toFixed(2)),
      endingSupply: first.endingSupply,
      sourceToSinkRatio: first.sourceToSinkRatio,
      duplicatePrevention: 'deterministic replay matched',
      mismatchCount: first.reconciliationMismatchCount,
    };
  });

  const durations = [30, 90, 180] as const;
  const matrixStartedAt = performance.now();
  const matrix = ECONOMY_TUNING_CANDIDATES.flatMap((candidate, candidateIndex) =>
    populations.flatMap((playerCount) =>
      durations.flatMap((durationDays) =>
        economySimulationScenarioSchema.options.map((scenario, scenarioIndex) => {
          const input = {
            seed: 20_000 + candidateIndex * 1_000 + scenarioIndex,
            playerCount,
            durationDays,
            starterGrant: 250,
            meanDailySource: 18,
            sourceParticipationRate: 0.55,
            meanDailySink: 16,
            sinkParticipationRate: 0.5,
            beginnerProtectionDays: 3,
            scenario,
            candidate: candidate.key,
          };
          const result = runEconomySimulation(input);
          const replay = runEconomySimulation(input);
          if (JSON.stringify(result) !== JSON.stringify(replay)) {
            throw new Error(
              `Candidate matrix replay diverged for ${candidate.key}/${playerCount}/${durationDays}/${scenario}.`,
            );
          }
          if (result.negativeBalanceCount !== 0 || result.reconciliationMismatchCount !== 0) {
            throw new Error(
              `Candidate matrix invariant failed for ${candidate.key}/${playerCount}/${durationDays}/${scenario}.`,
            );
          }
          return result;
        }),
      ),
    ),
  );
  const candidateSummaries = ECONOMY_TUNING_CANDIDATES.map((candidate) => {
    const candidateRuns = matrix.filter((result) => result.candidate === candidate.key);
    const balancedRuns = candidateRuns.filter((result) => result.scenario === 'balanced');
    const balancedLongRuns = balancedRuns.filter((result) => result.durationDays === 180);
    return {
      candidate: candidate.key,
      label: candidate.label,
      runCount: candidateRuns.length,
      balancedAllHorizonAverageRatio: Number(
        (
          balancedRuns.reduce((sum, result) => sum + result.sourceToSinkRatio, 0) /
          balancedRuns.length
        ).toFixed(6),
      ),
      balanced180DayAverageRatio: Number(
        (
          balancedLongRuns.reduce((sum, result) => sum + result.sourceToSinkRatio, 0) /
          balancedLongRuns.length
        ).toFixed(6),
      ),
      balanced180DayAverageBeginnerAffordability: Number(
        (
          balancedLongRuns.reduce((sum, result) => sum + result.beginnerAffordabilityRate, 0) /
          balancedLongRuns.length
        ).toFixed(6),
      ),
      zeroNegativeBalanceRuns: candidateRuns.filter((result) => result.negativeBalanceCount === 0)
        .length,
      deterministicReplay: 'matched for every run',
    };
  });

  const cosmeticMatrixStartedAt = performance.now();
  const cosmeticReports = populations.flatMap((playerCount, playerIndex) =>
    durations.map((durationDays, durationIndex) => {
      const input = {
        seed: 30_000 + playerIndex * 100 + durationIndex,
        playerCount,
        durationDays,
        starterGrant: 250,
        meanDailySource: 18,
        sourceParticipationRate: 0.55,
        entryCosmeticPrice: 120,
        collectionSize: 12,
      };
      const report = runCosmeticEconomyParticipationComparison(input);
      if (
        JSON.stringify(report) !== JSON.stringify(runCosmeticEconomyParticipationComparison(input))
      ) {
        throw new Error(
          `Cosmetic participation replay diverged for ${playerCount}/${durationDays}.`,
        );
      }
      if (report.results.some((result) => result.negativeBalanceCount !== 0)) {
        throw new Error(
          `Cosmetic participation invariant failed for ${playerCount}/${durationDays}.`,
        );
      }
      return report;
    }),
  );

  const memory = process.memoryUsage();
  process.stdout.write(
    `${JSON.stringify(
      {
        scope:
          'bounded local Phase 9A.1 load evidence; no database, hosted, configuration, or publication writes',
        controlledApiLoad,
        documentationLoad,
        reports,
        candidateMatrix: {
          runCount: matrix.length,
          populations,
          durations,
          scenarios: economySimulationScenarioSchema.options,
          candidates: candidateSummaries,
          recommendation: ECONOMY_TUNING_RECOMMENDATION,
          durationMilliseconds: Number((performance.now() - matrixStartedAt).toFixed(2)),
          playerBalancesMutated: false,
          publishedConfigurationMutated: false,
          limitations: [
            'Planning model only; results are not a production forecast.',
            'Owner review and explicit publication are still required.',
          ],
        },
        cosmeticParticipationMatrix: {
          scope:
            'isolated optional-cosmetic DUST sink planning; no live reads, player mutations, purchase RPCs, on-chain reward issuance, or publication',
          runCount: cosmeticReports.length * cosmeticParticipationScenarioSchema.options.length,
          populations,
          durations,
          scenarios: cosmeticParticipationScenarioSchema.options,
          durationMilliseconds: Number((performance.now() - cosmeticMatrixStartedAt).toFixed(2)),
          playerBalancesMutated: false,
          liveDataRead: false,
          published: false,
          onchainRewardsCreated: 0,
          results: cosmeticReports.map((report) => report.results),
          limitations: cosmeticReports[0]?.limitations ?? [],
        },
        memory: {
          rssMegabytes: Number((memory.rss / 1_048_576).toFixed(2)),
          heapUsedMegabytes: Number((memory.heapUsed / 1_048_576).toFixed(2)),
        },
      },
      null,
      2,
    )}\n`,
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
