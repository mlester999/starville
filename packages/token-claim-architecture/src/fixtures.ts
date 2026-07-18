import { claimEligibilityCoreSchema, type ClaimEligibilityCore } from './eligibility';
import { claimEpochSchema, calculateEpochRemaining, type ClaimEpoch } from './epochs';
import {
  deterministicFixtureDigest,
  createDeterministicFixtureAddress,
  fixtureMintAddress,
  fixtureRecipientWallet,
  fixtureTreasuryAddress,
  publicEpochIdSchema,
  safePlayerIdSchema,
} from './common';
import { treasuryPolicySchema, type TreasuryPolicy } from './policy';
import { treasuryReserveFixtureSchema, type TreasuryReserveFixture } from './reserve';

export function createFixturePlayerId(sequence = 1): string {
  const digest = deterministicFixtureDigest('starville.mock.player.v1', [sequence.toString()]);
  return safePlayerIdSchema.parse(`PLAYER-MOCK-${digest.slice(0, 20)}`);
}

export function createFixtureWallet(sequence = 1): string {
  return createDeterministicFixtureAddress(sequence);
}

export function createFixtureEpochId(sequence = 1): string {
  const digest = deterministicFixtureDigest('starville.mock.epoch.v1', [sequence.toString()]);
  return publicEpochIdSchema.parse(`EPOCH-MOCK-${digest.slice(0, 16)}`);
}

export function createFixtureTreasuryPolicy(
  input: {
    readonly maximumClaimBaseUnits?: string;
    readonly globalDailyBaseUnits?: string;
    readonly globalWeeklyBaseUnits?: string;
    readonly epochBaseUnits?: string;
    readonly perPlayerDailyBaseUnits?: string;
    readonly perWalletDailyBaseUnits?: string;
    readonly signerMode?: 'disabled' | 'mock_fixture';
    readonly policyVersion?: string;
    readonly minimumTokenReserveBaseUnits?: string;
    readonly minimumSolFeeReserveLamports?: string;
    readonly pendingClaimReserveBaseUnits?: string;
    readonly safetyBufferBaseUnits?: string;
  } = {},
): TreasuryPolicy {
  const maximum = input.maximumClaimBaseUnits ?? '1000';
  return treasuryPolicySchema.parse({
    schemaVersion: 1,
    mode: 'architecture_draft',
    featureEnabled: false,
    publicationStatus: 'architecture_draft',
    policyVersion: input.policyVersion ?? 'phase-9b-a-fixture-v1',
    revision: 1,
    network: 'solana:mainnet-beta',
    tokenMint: fixtureMintAddress,
    tokenProgram: 'spl-token-2022',
    decimals: 6,
    treasuryIdentifier: 'fixture-reviewed-multisig',
    treasuryPublicAddress: fixtureTreasuryAddress,
    claimArchitecture: 'dedicated_program_authorizations',
    signerMode: input.signerMode ?? 'mock_fixture',
    minimumClaimBaseUnits: '100',
    maximumClaimBaseUnits: maximum,
    caps: {
      perReceiptBaseUnits: maximum,
      perPlayerDailyBaseUnits: input.perPlayerDailyBaseUnits ?? '3000',
      perPlayerWeeklyBaseUnits: '12000',
      perPlayerMonthlyBaseUnits: '40000',
      perWalletDailyBaseUnits: input.perWalletDailyBaseUnits ?? '3000',
      perSourceBaseUnits: '500000',
      perActivityBaseUnits: '250000',
      perCampaignBaseUnits: '1000000',
      globalDailyBaseUnits: input.globalDailyBaseUnits ?? '1000000',
      globalWeeklyBaseUnits: input.globalWeeklyBaseUnits ?? '5000000',
      epochBaseUnits: input.epochBaseUnits ?? '1000000',
    },
    minimumTokenReserveBaseUnits: input.minimumTokenReserveBaseUnits ?? '1000000',
    minimumSolFeeReserveLamports: input.minimumSolFeeReserveLamports ?? '1000000',
    pendingClaimReserveBaseUnits: input.pendingClaimReserveBaseUnits ?? '0',
    safetyBufferBaseUnits: input.safetyBufferBaseUnits ?? '100000',
    authorizationLifetimeSeconds: 900,
    confirmationPolicy: 'architecture_only',
    retryLimit: 0,
    maintenanceBehavior: 'pause_new_intents',
    emergencyPaused: true,
    complianceReviewThresholdBaseUnits: maximum,
    highRiskReviewThresholdBaseUnits: maximum,
    effectiveAt: null,
    immutablePublishedVersionDesign: true,
    published: false,
    campaignId: 'phase-9b-a-fixture',
    staffSummary:
      'Architecture-only fixture policy. Token claims and blockchain delivery remain disabled.',
  });
}

export function createFixtureTreasuryReserve(
  input: {
    readonly tokenBalanceBaseUnits?: string;
    readonly feeBalanceLamports?: string;
    readonly minimumTokenReserveBaseUnits?: string;
    readonly minimumSolReserveLamports?: string;
    readonly safetyBufferBaseUnits?: string;
    readonly pendingOperationBaseUnits?: string;
  } = {},
): TreasuryReserveFixture {
  return treasuryReserveFixtureSchema.parse({
    fixtureTokenBalanceBaseUnits: input.tokenBalanceBaseUnits ?? '10000000',
    fixtureSolFeeBalanceLamports: input.feeBalanceLamports ?? '10000000000',
    minimumTokenReserveBaseUnits: input.minimumTokenReserveBaseUnits ?? '1000000',
    minimumSolReserveLamports: input.minimumSolReserveLamports ?? '1000000',
    authorizedUnclaimedBaseUnits: '0',
    pendingOperationBaseUnits: input.pendingOperationBaseUnits ?? '0',
    confirmedOutgoingBaseUnits: '0',
    failedOperationReleasedBaseUnits: '0',
    pendingFeeReserveLamports: '0',
    confirmedFeeSpendLamports: '0',
    safetyBufferBaseUnits: input.safetyBufferBaseUnits ?? '100000',
    label: 'FIXTURE — NOT A LIVE TREASURY BALANCE',
  });
}

export function createFixtureEpoch(
  input: {
    readonly sequence?: number;
    readonly maximumAllocationBaseUnits?: string;
    readonly status?: ClaimEpoch['status'];
    readonly policyVersion?: string;
  } = {},
): ClaimEpoch {
  const maximum = input.maximumAllocationBaseUnits ?? '1000000';
  return claimEpochSchema.parse({
    publicEpochId: createFixtureEpochId(input.sequence),
    name: 'Phase 9B-A Offline Fixture Epoch',
    startAt: '2026-08-01T00:00:00.000Z',
    endAt: '2026-08-15T00:00:00.000Z',
    eligibilityCutoffAt: '2026-08-14T00:00:00.000Z',
    claimStartAt: '2026-08-16T00:00:00.000Z',
    claimExpiresAt: '2026-08-31T00:00:00.000Z',
    maximumAllocationBaseUnits: maximum,
    sourceCategories: ['cooperative_activity_completion', 'approved_seasonal_event'],
    eligibilityCount: 0,
    authorizedAmountBaseUnits: '0',
    confirmedAmountBaseUnits: '0',
    cancelledAmountBaseUnits: '0',
    remainingAllocationBaseUnits: calculateEpochRemaining({
      maximumAllocationBaseUnits: maximum,
      authorizedAmountBaseUnits: '0',
      confirmedAmountBaseUnits: '0',
    }),
    policyVersion: input.policyVersion ?? 'phase-9b-a-fixture-v1',
    status: input.status ?? 'active',
    revision: 1,
    mode: 'architecture_mock',
  });
}

export function createFixtureEligibilityCore(
  input: {
    readonly sequence?: number;
    readonly safePlayerId?: string;
    readonly recipientWallet?: string;
    readonly amountBaseUnits?: string;
    readonly epochId?: string | null;
    readonly sourceCategory?: ClaimEligibilityCore['sourceCategory'];
    readonly sourceKey?: string;
    readonly activityKey?: string | null;
    readonly createdAt?: string;
    readonly earliestClaimAt?: string;
    readonly expiresAt?: string;
    readonly campaignId?: string;
  } = {},
): ClaimEligibilityCore {
  const sequence = input.sequence ?? 1;
  const digest = deterministicFixtureDigest('starville.mock.source-receipt.v1', [
    sequence.toString(),
  ]).toLowerCase();
  const sourceCategory = input.sourceCategory ?? 'cooperative_activity_completion';
  return claimEligibilityCoreSchema.parse({
    safePlayerId: input.safePlayerId ?? createFixturePlayerId(sequence),
    verifiedRecipientWallet:
      input.recipientWallet ??
      (sequence === 1 ? fixtureRecipientWallet : createFixtureWallet(sequence)),
    sourceReceiptId: `ACT-RECEIPT-${sequence.toString().padStart(6, '0')}`,
    sourceReceiptDigest: `${digest}${digest}`,
    sourceCategory,
    sourceKey: input.sourceKey ?? 'moonpetal-completion',
    activityKey:
      input.activityKey === undefined
        ? sourceCategory === 'cooperative_activity_completion'
          ? 'moonpetal-harvest-help'
          : null
        : input.activityKey,
    rewardCategory:
      sourceCategory === 'approved_seasonal_event'
        ? 'seasonal_participation'
        : sourceCategory === 'approved_administrative_reward'
          ? 'reviewed_administrative_reward'
          : 'cooperative_contribution',
    tokenMint: fixtureMintAddress,
    tokenProgram: 'spl-token-2022',
    network: 'solana:mainnet-beta',
    amountBaseUnits: input.amountBaseUnits ?? '500',
    decimals: 6,
    policyVersion: 'phase-9b-a-fixture-v1',
    campaignId: input.campaignId ?? 'phase-9b-a-fixture',
    epochId: input.epochId === undefined ? createFixtureEpochId() : input.epochId,
    earliestClaimAt: input.earliestClaimAt ?? '2026-08-16T00:00:00.000Z',
    expiresAt: input.expiresAt ?? '2026-08-31T00:00:00.000Z',
    reasonCategory:
      sourceCategory === 'approved_seasonal_event'
        ? 'seasonal_reward'
        : sourceCategory === 'approved_administrative_reward'
          ? 'administrative_reviewed_reward'
          : sourceCategory === 'approved_economy_reward'
            ? 'economy_reward'
            : 'cooperative_completion',
    safeReasonSummary: 'Approved fixture receipt for offline architecture validation.',
    idempotencyKey: `fixture:eligibility:${sequence.toString().padStart(8, '0')}`,
    auditCorrelation: `fixture:correlation:${sequence.toString().padStart(8, '0')}`,
    createdAt: input.createdAt ?? '2026-08-14T00:00:00.000Z',
  });
}
