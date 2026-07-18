import { z } from 'zod';

import {
  createMockAuthorizationSnapshot,
  createMockNonce,
  type MockAuthorizationSnapshot,
} from './authorization';
import { claimCapEvaluationSchema, evaluateClaimCaps, type ClaimCapEvaluation } from './caps';
import {
  deterministicFixtureDigest,
  fromBaseUnits,
  idempotencyKeySchema,
  immutableArchitectureCopy,
  lamportsSchema,
  publicClaimIdSchema,
  publicEligibilityIdSchema,
  safePlayerIdSchema,
  timestampSchema,
  toBaseUnits,
  walletAddressSchema,
} from './common';
import {
  claimEligibilityCoreSchema,
  claimEligibilitySchema,
  createMockEligibility,
  type ClaimEligibility,
  type ClaimEligibilityCore,
} from './eligibility';
import { calculateEpochRemaining, claimEpochSchema, type ClaimEpoch } from './epochs';
import { treasuryPolicySchema, type TreasuryPolicy } from './policy';
import {
  calculateTreasuryReserve,
  releaseFixtureAuthorization,
  reserveFixtureWithAuthorization,
  treasuryReserveFixtureSchema,
  type TreasuryReserveFixture,
  type TreasuryReserveResult,
} from './reserve';
import {
  claimIntentSchema,
  createMockClaimId,
  transitionClaimIntent,
  type ClaimIntent,
} from './state-machine';

export const CLAIM_AUTHORITY_ERROR_CODES = [
  'IDEMPOTENCY_CONFLICT',
  'SOURCE_RECEIPT_DUPLICATE_CONFLICT',
  'ELIGIBILITY_NOT_FOUND',
  'ELIGIBILITY_NOT_APPROVED',
  'ELIGIBILITY_REVISION_CONFLICT',
  'CLAIM_NOT_FOUND',
  'CLAIM_REVISION_CONFLICT',
  'CLAIM_STATE_CONFLICT',
  'RECIPIENT_MISMATCH',
  'WALLET_VERIFICATION_CONFLICT',
  'PLAYER_SUSPENDED',
  'NOT_YET_CLAIMABLE',
  'ELIGIBILITY_EXPIRED',
  'POLICY_BINDING_MISMATCH',
  'POLICY_RESERVE_BINDING_MISMATCH',
  'EPOCH_BINDING_MISMATCH',
  'EPOCH_NOT_ACTIVE',
  'CAP_REJECTED',
  'TREASURY_RESERVE_CONFLICT',
  'FEE_RESERVE_CONFLICT',
  'MOCK_PROVIDER_DISABLED',
  'NONCE_REPLAY',
  'AUTHORIZATION_EXPIRED',
  'EXPIRY_NOT_REACHED',
] as const;
export const claimAuthorityErrorCodeSchema = z.enum(CLAIM_AUTHORITY_ERROR_CODES);
export type ClaimAuthorityErrorCode = z.infer<typeof claimAuthorityErrorCodeSchema>;

export class ClaimAuthorityError extends Error {
  readonly code: ClaimAuthorityErrorCode;
  readonly details: readonly string[];

  constructor(code: ClaimAuthorityErrorCode, details: readonly string[] = []) {
    super(code);
    this.name = 'ClaimAuthorityError';
    this.code = code;
    this.details = details;
  }
}

export interface ArchitectureOperationResult<T> {
  readonly value: T;
  readonly replayed: boolean;
}

export interface MockAuthorizationResult {
  readonly claim: ClaimIntent;
  readonly authorization: MockAuthorizationSnapshot;
  readonly capEvaluation: ClaimCapEvaluation;
  readonly reserveEvaluation: TreasuryReserveResult;
  readonly replayed: boolean;
}

export interface InMemoryClaimAuthoritySnapshot {
  readonly mode: 'architecture_mock';
  readonly liveSettlementEnabled: false;
  readonly eligibility: readonly ClaimEligibility[];
  readonly claims: readonly ClaimIntent[];
  readonly reserve: TreasuryReserveFixture;
  readonly epoch: ClaimEpoch | null;
  readonly usedNonces: number;
  readonly suspendedPlayers: readonly string[];
}

const createIntentInputSchema = z
  .object({
    publicEligibilityId: publicEligibilityIdSchema,
    recipientWallet: walletAddressSchema,
    idempotencyKey: idempotencyKeySchema,
    expectedEligibilityRevision: z.number().int().positive(),
    requestedAt: timestampSchema,
  })
  .strict();

const authorizeMockInputSchema = z
  .object({
    publicClaimId: publicClaimIdSchema,
    currentVerifiedWallet: walletAddressSchema,
    idempotencyKey: idempotencyKeySchema,
    expectedClaimRevision: z.number().int().positive(),
    requestedAt: timestampSchema,
    fixtureFeeEstimateLamports: lamportsSchema,
  })
  .strict();

function sourceReceiptKey(eligibility: ClaimEligibilityCore): string {
  return `${eligibility.sourceCategory}:${eligibility.sourceReceiptId}`;
}

function isoWeekKey(timestamp: string): string {
  const date = new Date(timestamp);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

function fingerprint(domain: string, values: readonly string[]): string {
  return deterministicFixtureDigest(domain, values);
}

function eligibilitySemanticFingerprint(core: ClaimEligibilityCore): string {
  return fingerprint('starville.mock.create-eligibility.v1', [
    core.sourceCategory,
    core.sourceReceiptId,
    core.sourceReceiptDigest,
    core.safePlayerId,
    core.verifiedRecipientWallet,
    core.sourceKey,
    core.activityKey ?? '~',
    core.rewardCategory,
    core.tokenMint,
    core.tokenProgram,
    core.network,
    core.amountBaseUnits,
    core.decimals.toString(),
    core.policyVersion,
    core.campaignId,
    core.epochId ?? '~',
    core.earliestClaimAt,
    core.expiresAt,
    core.reasonCategory,
    core.safeReasonSummary,
    core.auditCorrelation,
    core.createdAt,
  ]);
}

export class InMemoryClaimAuthority {
  readonly #policy: TreasuryPolicy;
  #reserve: TreasuryReserveFixture;
  #epoch: ClaimEpoch | null;
  readonly #eligibilityById = new Map<string, ClaimEligibility>();
  readonly #eligibilityBySource = new Map<string, string>();
  readonly #claimById = new Map<string, ClaimIntent>();
  readonly #claimByEligibility = new Map<string, string>();
  readonly #walletByPlayer = new Map<string, string>();
  readonly #suspendedPlayers = new Set<string>();
  readonly #usedNonces = new Set<string>();
  readonly #feeReservationByClaim = new Map<string, bigint>();
  readonly #usageReservationByClaim = new Map<
    string,
    { readonly keys: readonly string[]; readonly amount: bigint }
  >();
  readonly #usage = new Map<string, bigint>();
  readonly #eligibilityIdempotency = new Map<
    string,
    { readonly fingerprint: string; readonly result: ArchitectureOperationResult<ClaimEligibility> }
  >();
  readonly #claimIdempotency = new Map<
    string,
    { readonly fingerprint: string; readonly result: ArchitectureOperationResult<ClaimIntent> }
  >();
  readonly #authorizationIdempotency = new Map<
    string,
    { readonly fingerprint: string; readonly result: MockAuthorizationResult }
  >();
  #exclusiveTail: Promise<void> = Promise.resolve();

  constructor(input: {
    readonly policy: TreasuryPolicy;
    readonly reserve: TreasuryReserveFixture;
    readonly epoch?: ClaimEpoch | null;
  }) {
    this.#policy = immutableArchitectureCopy(treasuryPolicySchema.parse(input.policy));
    this.#reserve = immutableArchitectureCopy(treasuryReserveFixtureSchema.parse(input.reserve));
    this.#epoch =
      input.epoch === undefined || input.epoch === null
        ? null
        : immutableArchitectureCopy(claimEpochSchema.parse(input.epoch));
    if (
      this.#reserve.minimumTokenReserveBaseUnits !== this.#policy.minimumTokenReserveBaseUnits ||
      this.#reserve.minimumSolReserveLamports !== this.#policy.minimumSolFeeReserveLamports ||
      this.#reserve.safetyBufferBaseUnits !== this.#policy.safetyBufferBaseUnits ||
      toBaseUnits(this.#reserve.pendingOperationBaseUnits) <
        toBaseUnits(this.#policy.pendingClaimReserveBaseUnits)
    ) {
      throw new ClaimAuthorityError('POLICY_RESERVE_BINDING_MISMATCH');
    }
    if (this.#epoch !== null) {
      if (this.#epoch.policyVersion !== this.#policy.policyVersion) {
        throw new ClaimAuthorityError('EPOCH_BINDING_MISMATCH');
      }
      const committed =
        toBaseUnits(this.#epoch.authorizedAmountBaseUnits) +
        toBaseUnits(this.#epoch.confirmedAmountBaseUnits);
      this.#usage.set(`epoch:${this.#epoch.publicEpochId}`, committed);
    }
  }

  async #exclusive<T>(operation: () => T | Promise<T>): Promise<T> {
    const previous = this.#exclusiveTail;
    let release: (() => void) | undefined;
    this.#exclusiveTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release?.();
    }
  }

  #idempotencyConflict(): never {
    throw new ClaimAuthorityError('IDEMPOTENCY_CONFLICT');
  }

  async createEligibility(
    rawCore: ClaimEligibilityCore,
  ): Promise<ArchitectureOperationResult<ClaimEligibility>> {
    const core = claimEligibilityCoreSchema.parse(rawCore);
    const requestFingerprint = eligibilitySemanticFingerprint(core);
    return this.#exclusive(() => {
      const replay = this.#eligibilityIdempotency.get(core.idempotencyKey);
      if (replay !== undefined) {
        if (replay.fingerprint !== requestFingerprint) this.#idempotencyConflict();
        return immutableArchitectureCopy({ ...replay.result, replayed: true });
      }
      if (
        core.tokenMint !== this.#policy.tokenMint ||
        core.tokenProgram !== this.#policy.tokenProgram ||
        core.network !== this.#policy.network ||
        core.decimals !== this.#policy.decimals ||
        core.policyVersion !== this.#policy.policyVersion ||
        core.campaignId !== this.#policy.campaignId
      ) {
        throw new ClaimAuthorityError('POLICY_BINDING_MISMATCH');
      }
      if (core.epochId !== null) {
        if (this.#epoch === null || this.#epoch.publicEpochId !== core.epochId) {
          throw new ClaimAuthorityError('EPOCH_BINDING_MISMATCH');
        }
        if (
          !this.#epoch.sourceCategories.includes(core.sourceCategory) ||
          Date.parse(core.createdAt) > Date.parse(this.#epoch.eligibilityCutoffAt) ||
          Date.parse(core.earliestClaimAt) < Date.parse(this.#epoch.claimStartAt) ||
          Date.parse(core.expiresAt) > Date.parse(this.#epoch.claimExpiresAt)
        ) {
          throw new ClaimAuthorityError('EPOCH_BINDING_MISMATCH');
        }
      }
      const existingSourceId = this.#eligibilityBySource.get(sourceReceiptKey(core));
      if (existingSourceId !== undefined) {
        const existing = this.#eligibilityById.get(existingSourceId);
        if (existing === undefined) throw new Error('IN_MEMORY_ELIGIBILITY_INDEX_MISMATCH');
        if (eligibilitySemanticFingerprint(existing) !== requestFingerprint) {
          throw new ClaimAuthorityError('SOURCE_RECEIPT_DUPLICATE_CONFLICT');
        }
        const result = immutableArchitectureCopy({ value: existing, replayed: true } as const);
        this.#eligibilityIdempotency.set(core.idempotencyKey, {
          fingerprint: requestFingerprint,
          result,
        });
        return immutableArchitectureCopy(result);
      }
      const verifiedWallet = this.#walletByPlayer.get(core.safePlayerId);
      if (verifiedWallet !== undefined && verifiedWallet !== core.verifiedRecipientWallet) {
        throw new ClaimAuthorityError('WALLET_VERIFICATION_CONFLICT');
      }
      const eligibility = immutableArchitectureCopy(createMockEligibility(core));
      this.#eligibilityById.set(eligibility.publicEligibilityId, eligibility);
      this.#eligibilityBySource.set(sourceReceiptKey(core), eligibility.publicEligibilityId);
      this.#walletByPlayer.set(core.safePlayerId, core.verifiedRecipientWallet);
      const result = immutableArchitectureCopy({ value: eligibility, replayed: false } as const);
      this.#eligibilityIdempotency.set(core.idempotencyKey, {
        fingerprint: requestFingerprint,
        result,
      });
      return immutableArchitectureCopy(result);
    });
  }

  async createClaimIntent(
    rawInput: z.input<typeof createIntentInputSchema>,
  ): Promise<ArchitectureOperationResult<ClaimIntent>> {
    const input = createIntentInputSchema.parse(rawInput);
    const requestFingerprint = fingerprint('starville.mock.create-claim-intent.v1', [
      input.publicEligibilityId,
      input.recipientWallet,
      input.expectedEligibilityRevision.toString(),
    ]);
    return this.#exclusive(() => {
      const replay = this.#claimIdempotency.get(input.idempotencyKey);
      if (replay !== undefined) {
        if (replay.fingerprint !== requestFingerprint) this.#idempotencyConflict();
        return immutableArchitectureCopy({ ...replay.result, replayed: true });
      }
      const eligibility = this.#eligibilityById.get(input.publicEligibilityId);
      if (eligibility === undefined) throw new ClaimAuthorityError('ELIGIBILITY_NOT_FOUND');
      if (eligibility.revision !== input.expectedEligibilityRevision) {
        throw new ClaimAuthorityError('ELIGIBILITY_REVISION_CONFLICT');
      }
      if (eligibility.status !== 'approved_mock') {
        throw new ClaimAuthorityError('ELIGIBILITY_NOT_APPROVED');
      }
      const requestedAtMs = Date.parse(input.requestedAt);
      if (requestedAtMs < Date.parse(eligibility.earliestClaimAt)) {
        throw new ClaimAuthorityError('NOT_YET_CLAIMABLE');
      }
      if (requestedAtMs >= Date.parse(eligibility.expiresAt)) {
        throw new ClaimAuthorityError('ELIGIBILITY_EXPIRED');
      }
      if (eligibility.epochId !== null) {
        if (this.#epoch === null || this.#epoch.publicEpochId !== eligibility.epochId) {
          throw new ClaimAuthorityError('EPOCH_BINDING_MISMATCH');
        }
        if (
          this.#epoch.status !== 'active' ||
          requestedAtMs < Date.parse(this.#epoch.claimStartAt) ||
          requestedAtMs >= Date.parse(this.#epoch.claimExpiresAt)
        ) {
          throw new ClaimAuthorityError('EPOCH_NOT_ACTIVE');
        }
      }
      if (input.recipientWallet !== eligibility.verifiedRecipientWallet) {
        throw new ClaimAuthorityError('RECIPIENT_MISMATCH');
      }
      const existingClaimId = this.#claimByEligibility.get(input.publicEligibilityId);
      if (existingClaimId !== undefined) {
        const existing = this.#claimById.get(existingClaimId);
        if (existing === undefined) throw new Error('IN_MEMORY_CLAIM_INDEX_MISMATCH');
        const result = immutableArchitectureCopy({ value: existing, replayed: true } as const);
        this.#claimIdempotency.set(input.idempotencyKey, {
          fingerprint: requestFingerprint,
          result,
        });
        return immutableArchitectureCopy(result);
      }
      const claim = immutableArchitectureCopy(
        claimIntentSchema.parse({
          publicClaimId: createMockClaimId(eligibility.publicEligibilityId),
          publicEligibilityId: eligibility.publicEligibilityId,
          safePlayerId: eligibility.safePlayerId,
          recipientWallet: eligibility.verifiedRecipientWallet,
          tokenMint: eligibility.tokenMint,
          tokenProgram: eligibility.tokenProgram,
          network: eligibility.network,
          amountBaseUnits: eligibility.amountBaseUnits,
          decimals: eligibility.decimals,
          policyVersion: eligibility.policyVersion,
          epochId: eligibility.epochId,
          revision: 1,
          state: 'eligible_mock',
          stateReason: 'eligibility_approved_mock',
          authorization: null,
          createdAt: input.requestedAt,
          updatedAt: input.requestedAt,
          mode: 'architecture_mock',
          liveSettlementEnabled: false,
        }),
      );
      this.#claimById.set(claim.publicClaimId, claim);
      this.#claimByEligibility.set(claim.publicEligibilityId, claim.publicClaimId);
      const result = immutableArchitectureCopy({ value: claim, replayed: false } as const);
      this.#claimIdempotency.set(input.idempotencyKey, {
        fingerprint: requestFingerprint,
        result,
      });
      return immutableArchitectureCopy(result);
    });
  }

  #usageValue(key: string): string {
    return (this.#usage.get(key) ?? 0n).toString();
  }

  #addUsage(key: string, amount: bigint): void {
    this.#usage.set(key, (this.#usage.get(key) ?? 0n) + amount);
  }

  #usageKeys(eligibility: ClaimEligibility, at: string) {
    const day = at.slice(0, 10);
    const month = at.slice(0, 7);
    const week = isoWeekKey(at);
    return {
      receipt: `receipt:${eligibility.sourceCategory}:${eligibility.sourceReceiptId}`,
      playerDaily: `player-day:${eligibility.safePlayerId}:${day}`,
      playerWeekly: `player-week:${eligibility.safePlayerId}:${week}`,
      playerMonthly: `player-month:${eligibility.safePlayerId}:${month}`,
      walletDaily: `wallet-day:${eligibility.verifiedRecipientWallet}:${day}`,
      source: `source:${eligibility.sourceKey}:${eligibility.campaignId}`,
      activity: `activity:${eligibility.activityKey ?? 'not-applicable'}:${eligibility.campaignId}`,
      campaign: `campaign:${eligibility.campaignId}`,
      epoch: `epoch:${eligibility.epochId ?? 'not-applicable'}`,
      globalDaily: `global-day:${day}`,
      globalWeekly: `global-week:${week}`,
    } as const;
  }

  async authorizeMock(
    rawInput: z.input<typeof authorizeMockInputSchema>,
  ): Promise<MockAuthorizationResult> {
    const input = authorizeMockInputSchema.parse(rawInput);
    const requestFingerprint = fingerprint('starville.mock.authorize.v1', [
      input.publicClaimId,
      input.currentVerifiedWallet,
      input.expectedClaimRevision.toString(),
      input.fixtureFeeEstimateLamports,
    ]);
    return this.#exclusive(() => {
      const replay = this.#authorizationIdempotency.get(input.idempotencyKey);
      if (replay !== undefined) {
        if (replay.fingerprint !== requestFingerprint) this.#idempotencyConflict();
        const currentClaim = this.#claimById.get(input.publicClaimId);
        if (
          currentClaim?.state !== 'authorized_mock' ||
          currentClaim.authorization?.publicAuthorizationId !==
            replay.result.authorization.publicAuthorizationId
        ) {
          throw new ClaimAuthorityError('CLAIM_STATE_CONFLICT');
        }
        if (
          Date.parse(input.requestedAt) >= Date.parse(replay.result.authorization.payload.expiresAt)
        ) {
          throw new ClaimAuthorityError('AUTHORIZATION_EXPIRED');
        }
        return immutableArchitectureCopy({ ...replay.result, replayed: true });
      }
      if (this.#policy.signerMode !== 'mock_fixture') {
        throw new ClaimAuthorityError('MOCK_PROVIDER_DISABLED');
      }
      const claim = this.#claimById.get(input.publicClaimId);
      if (claim === undefined) throw new ClaimAuthorityError('CLAIM_NOT_FOUND');
      if (claim.revision !== input.expectedClaimRevision) {
        throw new ClaimAuthorityError('CLAIM_REVISION_CONFLICT');
      }
      if (claim.state !== 'eligible_mock') throw new ClaimAuthorityError('CLAIM_STATE_CONFLICT');
      const eligibility = this.#eligibilityById.get(claim.publicEligibilityId);
      if (eligibility === undefined) throw new ClaimAuthorityError('ELIGIBILITY_NOT_FOUND');
      if (this.#suspendedPlayers.has(claim.safePlayerId)) {
        throw new ClaimAuthorityError('PLAYER_SUSPENDED');
      }
      const currentWallet = this.#walletByPlayer.get(claim.safePlayerId);
      if (
        currentWallet !== input.currentVerifiedWallet ||
        input.currentVerifiedWallet !== claim.recipientWallet
      ) {
        throw new ClaimAuthorityError('WALLET_VERIFICATION_CONFLICT');
      }
      const requestedAtMs = Date.parse(input.requestedAt);
      if (requestedAtMs < Date.parse(eligibility.earliestClaimAt)) {
        throw new ClaimAuthorityError('NOT_YET_CLAIMABLE');
      }
      if (requestedAtMs >= Date.parse(eligibility.expiresAt)) {
        throw new ClaimAuthorityError('ELIGIBILITY_EXPIRED');
      }
      if (
        claim.tokenMint !== this.#policy.tokenMint ||
        claim.tokenProgram !== this.#policy.tokenProgram ||
        claim.network !== this.#policy.network ||
        claim.decimals !== this.#policy.decimals ||
        claim.policyVersion !== this.#policy.policyVersion ||
        eligibility.campaignId !== this.#policy.campaignId
      ) {
        throw new ClaimAuthorityError('POLICY_BINDING_MISMATCH');
      }
      if (claim.epochId !== null) {
        if (this.#epoch === null || this.#epoch.publicEpochId !== claim.epochId) {
          throw new ClaimAuthorityError('EPOCH_BINDING_MISMATCH');
        }
        if (this.#epoch.status !== 'active') throw new ClaimAuthorityError('EPOCH_NOT_ACTIVE');
        if (
          !this.#epoch.sourceCategories.includes(eligibility.sourceCategory) ||
          Date.parse(eligibility.createdAt) > Date.parse(this.#epoch.eligibilityCutoffAt) ||
          Date.parse(eligibility.earliestClaimAt) < Date.parse(this.#epoch.claimStartAt) ||
          Date.parse(eligibility.expiresAt) > Date.parse(this.#epoch.claimExpiresAt) ||
          requestedAtMs < Date.parse(this.#epoch.claimStartAt) ||
          requestedAtMs >= Date.parse(this.#epoch.claimExpiresAt)
        ) {
          throw new ClaimAuthorityError('EPOCH_BINDING_MISMATCH');
        }
      }
      const reserveEvaluation = calculateTreasuryReserve(
        this.#reserve,
        claim.amountBaseUnits,
        input.fixtureFeeEstimateLamports,
      );
      if (!reserveEvaluation.canAuthorizeRequestedAmount) {
        if (reserveEvaluation.rejectionReasons.includes('fee_reserve_conflict')) {
          throw new ClaimAuthorityError('FEE_RESERVE_CONFLICT');
        }
        throw new ClaimAuthorityError('TREASURY_RESERVE_CONFLICT');
      }
      const keys = this.#usageKeys(eligibility, input.requestedAt);
      let capEvaluation = evaluateClaimCaps(this.#policy, {
        requestedAmountBaseUnits: claim.amountBaseUnits,
        receiptUsedBaseUnits: this.#usageValue(keys.receipt),
        playerDailyUsedBaseUnits: this.#usageValue(keys.playerDaily),
        playerWeeklyUsedBaseUnits: this.#usageValue(keys.playerWeekly),
        playerMonthlyUsedBaseUnits: this.#usageValue(keys.playerMonthly),
        walletDailyUsedBaseUnits: this.#usageValue(keys.walletDaily),
        sourceUsedBaseUnits: this.#usageValue(keys.source),
        activityUsedBaseUnits: this.#usageValue(keys.activity),
        campaignUsedBaseUnits: this.#usageValue(keys.campaign),
        epochUsedBaseUnits: this.#usageValue(keys.epoch),
        globalDailyUsedBaseUnits: this.#usageValue(keys.globalDaily),
        globalWeeklyUsedBaseUnits: this.#usageValue(keys.globalWeekly),
        treasuryAvailableBaseUnits: reserveEvaluation.availableAuthorizationBaseUnits,
        activityCapApplicable: eligibility.activityKey !== null,
        epochCapApplicable: eligibility.epochId !== null,
      });
      if (
        this.#epoch !== null &&
        claim.epochId !== null &&
        toBaseUnits(claim.amountBaseUnits) > toBaseUnits(this.#epoch.remainingAllocationBaseUnits)
      ) {
        capEvaluation = claimCapEvaluationSchema.parse({
          ...capEvaluation,
          allowed: false,
          rejectionCodes: [...new Set([...capEvaluation.rejectionCodes, 'epoch_cap'])],
        });
      }
      if (!capEvaluation.allowed) {
        throw new ClaimAuthorityError('CAP_REJECTED', capEvaluation.rejectionCodes);
      }
      const expiresAtMs = Math.min(
        Date.parse(eligibility.expiresAt),
        requestedAtMs + this.#policy.authorizationLifetimeSeconds * 1_000,
      );
      const nonce = createMockNonce(claim.publicClaimId, 1);
      if (this.#usedNonces.has(nonce)) throw new ClaimAuthorityError('NONCE_REPLAY');
      const authorization = createMockAuthorizationSnapshot({
        authorizationVersion: 1,
        claimPublicId: claim.publicClaimId,
        eligibilityPublicId: claim.publicEligibilityId,
        safePlayerId: claim.safePlayerId,
        recipientWallet: claim.recipientWallet,
        tokenMint: claim.tokenMint,
        tokenProgram: claim.tokenProgram,
        network: claim.network,
        amountBaseUnits: claim.amountBaseUnits,
        decimals: claim.decimals,
        policyVersion: claim.policyVersion,
        epochId: claim.epochId,
        nonce,
        issuedAt: input.requestedAt,
        expiresAt: new Date(expiresAtMs).toISOString(),
        treasuryIdentifier: this.#policy.treasuryIdentifier,
        sourceReceiptDigest: eligibility.sourceReceiptDigest,
        domainSeparator: 'starville.token-claim-authorization.architecture-mock.v1',
      });
      const authorizedClaim = immutableArchitectureCopy(
        transitionClaimIntent(claim, {
          expectedRevision: claim.revision,
          nextState: 'authorized_mock',
          reason: 'mock_authorization_created',
          at: input.requestedAt,
          authorization,
        }),
      );
      const fixtureFee = BigInt(input.fixtureFeeEstimateLamports);
      const nextReserveWithToken = reserveFixtureWithAuthorization(
        this.#reserve,
        claim.amountBaseUnits,
      );
      const nextReserve = immutableArchitectureCopy(
        treasuryReserveFixtureSchema.parse({
          ...nextReserveWithToken,
          pendingFeeReserveLamports: (
            BigInt(nextReserveWithToken.pendingFeeReserveLamports) + fixtureFee
          ).toString(),
        }),
      );
      const amount = toBaseUnits(claim.amountBaseUnits);
      const reservedUsageKeys = [
        keys.receipt,
        keys.playerDaily,
        keys.playerWeekly,
        keys.playerMonthly,
        keys.walletDaily,
        keys.source,
        ...(eligibility.activityKey === null ? [] : [keys.activity]),
        keys.campaign,
        ...(eligibility.epochId === null ? [] : [keys.epoch]),
        keys.globalDaily,
        keys.globalWeekly,
      ];
      let nextEpoch = this.#epoch;
      if (nextEpoch !== null && claim.epochId !== null) {
        const authorizedAmount = toBaseUnits(nextEpoch.authorizedAmountBaseUnits) + amount;
        nextEpoch = immutableArchitectureCopy(
          claimEpochSchema.parse({
            ...nextEpoch,
            authorizedAmountBaseUnits: authorizedAmount.toString(),
            remainingAllocationBaseUnits: calculateEpochRemaining({
              maximumAllocationBaseUnits: nextEpoch.maximumAllocationBaseUnits,
              authorizedAmountBaseUnits: authorizedAmount.toString(),
              confirmedAmountBaseUnits: nextEpoch.confirmedAmountBaseUnits,
            }),
            revision: nextEpoch.revision + 1,
          }),
        );
      }

      this.#reserve = nextReserve;
      this.#epoch = nextEpoch;
      this.#feeReservationByClaim.set(claim.publicClaimId, fixtureFee);
      for (const key of reservedUsageKeys) this.#addUsage(key, amount);
      this.#usageReservationByClaim.set(claim.publicClaimId, {
        keys: reservedUsageKeys,
        amount,
      });
      this.#usedNonces.add(nonce);
      this.#claimById.set(authorizedClaim.publicClaimId, authorizedClaim);
      const result: MockAuthorizationResult = immutableArchitectureCopy({
        claim: authorizedClaim,
        authorization,
        capEvaluation: claimCapEvaluationSchema.parse(capEvaluation),
        reserveEvaluation,
        replayed: false,
      });
      this.#authorizationIdempotency.set(input.idempotencyKey, {
        fingerprint: requestFingerprint,
        result,
      });
      return immutableArchitectureCopy(result);
    });
  }

  #releaseAuthorizedClaim(claim: ClaimIntent): void {
    if (claim.authorization === null) return;
    const nextReserveWithToken = releaseFixtureAuthorization(this.#reserve, claim.amountBaseUnits);
    const feeReservation = this.#feeReservationByClaim.get(claim.publicClaimId) ?? 0n;
    const currentFeeReservation = BigInt(nextReserveWithToken.pendingFeeReserveLamports);
    if (feeReservation > currentFeeReservation) {
      throw new Error('IN_MEMORY_FEE_RESERVATION_MISMATCH');
    }
    const nextReserve = immutableArchitectureCopy(
      treasuryReserveFixtureSchema.parse({
        ...nextReserveWithToken,
        pendingFeeReserveLamports: (currentFeeReservation - feeReservation).toString(),
      }),
    );
    const usageReservation = this.#usageReservationByClaim.get(claim.publicClaimId);
    const usageUpdates: readonly { readonly key: string; readonly value: bigint }[] =
      usageReservation === undefined
        ? []
        : usageReservation.keys.map((key) => {
            const current = this.#usage.get(key) ?? 0n;
            if (usageReservation.amount > current) {
              throw new Error('IN_MEMORY_CAP_RESERVATION_MISMATCH');
            }
            return { key, value: current - usageReservation.amount };
          });
    let nextEpoch = this.#epoch;
    if (nextEpoch !== null && claim.epochId !== null) {
      const amount = toBaseUnits(claim.amountBaseUnits);
      const active = toBaseUnits(nextEpoch.authorizedAmountBaseUnits);
      if (amount > active) throw new Error('IN_MEMORY_EPOCH_RESERVATION_MISMATCH');
      const nextActive = active - amount;
      const historicalReleased = toBaseUnits(nextEpoch.cancelledAmountBaseUnits) + amount;
      nextEpoch = immutableArchitectureCopy(
        claimEpochSchema.parse({
          ...nextEpoch,
          authorizedAmountBaseUnits: nextActive.toString(),
          cancelledAmountBaseUnits: historicalReleased.toString(),
          remainingAllocationBaseUnits: calculateEpochRemaining({
            maximumAllocationBaseUnits: nextEpoch.maximumAllocationBaseUnits,
            authorizedAmountBaseUnits: nextActive.toString(),
            confirmedAmountBaseUnits: nextEpoch.confirmedAmountBaseUnits,
          }),
          revision: nextEpoch.revision + 1,
        }),
      );
    }

    this.#reserve = nextReserve;
    this.#epoch = nextEpoch;
    this.#feeReservationByClaim.delete(claim.publicClaimId);
    if (usageReservation !== undefined) {
      for (const update of usageUpdates) {
        if (update.value === 0n) this.#usage.delete(update.key);
        else this.#usage.set(update.key, update.value);
      }
      this.#usageReservationByClaim.delete(claim.publicClaimId);
    }
  }

  async cancelClaim(input: {
    readonly publicClaimId: string;
    readonly expectedRevision: number;
    readonly at: string;
  }): Promise<ClaimIntent> {
    return this.#exclusive(() => {
      const claimId = publicClaimIdSchema.parse(input.publicClaimId);
      const claim = this.#claimById.get(claimId);
      if (claim === undefined) throw new ClaimAuthorityError('CLAIM_NOT_FOUND');
      if (claim.revision !== input.expectedRevision) {
        throw new ClaimAuthorityError('CLAIM_REVISION_CONFLICT');
      }
      const next = immutableArchitectureCopy(
        transitionClaimIntent(claim, {
          expectedRevision: input.expectedRevision,
          nextState: 'cancelled_mock',
          reason: 'cancelled_by_review',
          at: input.at,
        }),
      );
      if (claim.authorization !== null) this.#releaseAuthorizedClaim(claim);
      this.#claimById.set(claimId, next);
      return immutableArchitectureCopy(next);
    });
  }

  async expireClaim(input: {
    readonly publicClaimId: string;
    readonly expectedRevision: number;
    readonly at: string;
  }): Promise<ClaimIntent> {
    return this.#exclusive(() => {
      const claimId = publicClaimIdSchema.parse(input.publicClaimId);
      const claim = this.#claimById.get(claimId);
      if (claim === undefined) throw new ClaimAuthorityError('CLAIM_NOT_FOUND');
      if (claim.revision !== input.expectedRevision) {
        throw new ClaimAuthorityError('CLAIM_REVISION_CONFLICT');
      }
      const eligibility = this.#eligibilityById.get(claim.publicEligibilityId);
      if (eligibility === undefined) throw new ClaimAuthorityError('ELIGIBILITY_NOT_FOUND');
      const expiry = claim.authorization?.payload.expiresAt ?? eligibility.expiresAt;
      if (Date.parse(timestampSchema.parse(input.at)) < Date.parse(expiry)) {
        throw new ClaimAuthorityError('EXPIRY_NOT_REACHED');
      }
      const next = immutableArchitectureCopy(
        transitionClaimIntent(claim, {
          expectedRevision: input.expectedRevision,
          nextState: 'expired_mock',
          reason: claim.authorization === null ? 'eligibility_expired' : 'authorization_expired',
          at: input.at,
        }),
      );
      if (claim.authorization !== null) this.#releaseAuthorizedClaim(claim);
      this.#claimById.set(claimId, next);
      return immutableArchitectureCopy(next);
    });
  }

  async quarantineClaim(input: {
    readonly publicClaimId: string;
    readonly expectedRevision: number;
    readonly at: string;
    readonly reason?: 'wallet_changed' | 'player_suspended' | 'policy_mismatch' | 'dispute_review';
  }): Promise<ClaimIntent> {
    return this.#exclusive(() => {
      const claimId = publicClaimIdSchema.parse(input.publicClaimId);
      const claim = this.#claimById.get(claimId);
      if (claim === undefined) throw new ClaimAuthorityError('CLAIM_NOT_FOUND');
      if (claim.revision !== input.expectedRevision) {
        throw new ClaimAuthorityError('CLAIM_REVISION_CONFLICT');
      }
      const next = immutableArchitectureCopy(
        transitionClaimIntent(claim, {
          expectedRevision: input.expectedRevision,
          nextState: 'quarantined_mock',
          reason: input.reason ?? 'quarantine_trigger_mock',
          at: input.at,
        }),
      );
      this.#claimById.set(claimId, next);
      return immutableArchitectureCopy(next);
    });
  }

  async resolveDisputeReview(input: {
    readonly publicClaimId: string;
    readonly expectedRevision: number;
    readonly resolution: 'eligible_mock' | 'ineligible_mock';
    readonly at: string;
  }): Promise<ClaimIntent> {
    return this.#exclusive(() => {
      const claimId = publicClaimIdSchema.parse(input.publicClaimId);
      const claim = this.#claimById.get(claimId);
      if (claim === undefined) throw new ClaimAuthorityError('CLAIM_NOT_FOUND');
      if (claim.revision !== input.expectedRevision) {
        throw new ClaimAuthorityError('CLAIM_REVISION_CONFLICT');
      }
      if (claim.state !== 'quarantined_mock' || claim.authorization !== null) {
        throw new ClaimAuthorityError('CLAIM_STATE_CONFLICT');
      }
      const next = immutableArchitectureCopy(
        transitionClaimIntent(claim, {
          expectedRevision: input.expectedRevision,
          nextState: input.resolution === 'eligible_mock' ? 'eligible_mock' : 'ineligible',
          reason:
            input.resolution === 'eligible_mock'
              ? 'eligibility_approved_mock'
              : 'eligibility_rejected',
          at: input.at,
        }),
      );
      this.#claimById.set(claimId, next);
      return immutableArchitectureCopy(next);
    });
  }

  async updateVerifiedWallet(input: {
    readonly safePlayerId: string;
    readonly newVerifiedWallet: string;
    readonly at: string;
  }): Promise<readonly ClaimIntent[]> {
    return this.#exclusive(() => {
      const playerId = safePlayerIdSchema.parse(input.safePlayerId);
      const wallet = walletAddressSchema.parse(input.newVerifiedWallet);
      const at = timestampSchema.parse(input.at);
      this.#walletByPlayer.set(playerId, wallet);
      const affected: ClaimIntent[] = [];
      for (const [claimId, claim] of this.#claimById) {
        if (
          claim.safePlayerId === playerId &&
          claim.recipientWallet !== wallet &&
          claim.state === 'authorized_mock'
        ) {
          const next = immutableArchitectureCopy(
            transitionClaimIntent(claim, {
              expectedRevision: claim.revision,
              nextState: 'quarantined_mock',
              reason: 'wallet_changed',
              at,
            }),
          );
          this.#claimById.set(claimId, next);
          affected.push(next);
        }
      }
      return immutableArchitectureCopy(affected);
    });
  }

  async setPlayerSuspended(input: {
    readonly safePlayerId: string;
    readonly suspended: boolean;
    readonly at: string;
  }): Promise<readonly ClaimIntent[]> {
    return this.#exclusive(() => {
      const playerId = safePlayerIdSchema.parse(input.safePlayerId);
      const at = timestampSchema.parse(input.at);
      if (input.suspended) this.#suspendedPlayers.add(playerId);
      else this.#suspendedPlayers.delete(playerId);
      if (!input.suspended) return immutableArchitectureCopy([] as const);
      const affected: ClaimIntent[] = [];
      for (const [claimId, claim] of this.#claimById) {
        if (
          claim.safePlayerId === playerId &&
          (claim.state === 'eligible_mock' || claim.state === 'authorized_mock')
        ) {
          const next = immutableArchitectureCopy(
            transitionClaimIntent(claim, {
              expectedRevision: claim.revision,
              nextState: 'quarantined_mock',
              reason: 'player_suspended',
              at,
            }),
          );
          this.#claimById.set(claimId, next);
          affected.push(next);
        }
      }
      return immutableArchitectureCopy(affected);
    });
  }

  getClaim(publicClaimId: string): ClaimIntent | null {
    const claim = this.#claimById.get(publicClaimIdSchema.parse(publicClaimId));
    return claim === undefined ? null : immutableArchitectureCopy(claim);
  }

  getEligibility(publicEligibilityId: string): ClaimEligibility | null {
    const eligibility = this.#eligibilityById.get(
      publicEligibilityIdSchema.parse(publicEligibilityId),
    );
    return eligibility === undefined ? null : immutableArchitectureCopy(eligibility);
  }

  snapshot(): InMemoryClaimAuthoritySnapshot {
    return immutableArchitectureCopy({
      mode: 'architecture_mock',
      liveSettlementEnabled: false,
      eligibility: [...this.#eligibilityById.values()].map((value) =>
        claimEligibilitySchema.parse(value),
      ),
      claims: [...this.#claimById.values()].map((value) => claimIntentSchema.parse(value)),
      reserve: treasuryReserveFixtureSchema.parse(this.#reserve),
      epoch: this.#epoch === null ? null : claimEpochSchema.parse(this.#epoch),
      usedNonces: this.#usedNonces.size,
      suspendedPlayers: [...this.#suspendedPlayers].sort(),
    });
  }
}

export function sumAuthorizedMockClaims(snapshot: InMemoryClaimAuthoritySnapshot): string {
  return fromBaseUnits(
    snapshot.claims
      .filter((claim) => claim.state === 'authorized_mock')
      .reduce((total, claim) => total + toBaseUnits(claim.amountBaseUnits), 0n),
  );
}
