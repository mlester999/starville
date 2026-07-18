import { z } from 'zod';

import {
  deterministicFixtureDigest,
  fromBaseUnits,
  MAX_TOKEN_BASE_UNITS,
  NO_BLOCKCHAIN_ACTION_NOTICE,
  nonnegativeTokenBaseUnitsSchema,
  OFFLINE_SIMULATION_LABEL,
  tokenBaseUnitsSchema,
  toBaseUnits,
} from './common';

export const OFFLINE_CLAIM_SIMULATION_SCENARIOS = [
  'baseline',
  'duplicate_claim_attempts',
  'two_sessions_one_eligibility',
  'expired_authorization',
  'wallet_changed',
  'wrong_mint',
  'wrong_network',
  'player_cap_reached',
  'wallet_cap_reached',
  'global_cap_reached',
  'epoch_allocation_reached',
  'treasury_reserve_reached',
  'fee_reserve_reached',
  'quarantine_spike',
  'signer_unavailable',
  'rpc_outage_fixture',
  'rpc_disagreement_fixture',
  'replayed_authorization',
  'cancellation_race',
  'dispute_race',
] as const;
export const offlineClaimSimulationScenarioSchema = z.enum(OFFLINE_CLAIM_SIMULATION_SCENARIOS);
export type OfflineClaimSimulationScenario = z.infer<typeof offlineClaimSimulationScenarioSchema>;

export const offlineClaimSimulationInputSchema = z
  .object({
    seed: z.number().int().min(1).max(2_147_483_647),
    claimCount: z.union([z.literal(100), z.literal(1_000), z.literal(10_000)]),
    scenario: offlineClaimSimulationScenarioSchema,
    claimAmountBaseUnits: tokenBaseUnitsSchema,
    fixtureAvailableTreasuryBaseUnits: nonnegativeTokenBaseUnitsSchema,
    fixtureAvailableFeeLamports: nonnegativeTokenBaseUnitsSchema,
    fixtureFeePerAttemptLamports: tokenBaseUnitsSchema,
    playerCapClaimCount: z.number().int().min(1).max(10_000),
    walletCapClaimCount: z.number().int().min(1).max(10_000),
    globalCapClaimCount: z.number().int().min(1).max(10_000),
    epochCapClaimCount: z.number().int().min(1).max(10_000),
  })
  .strict()
  .superRefine((input, context) => {
    const claims = BigInt(input.claimCount);
    if (toBaseUnits(input.claimAmountBaseUnits) * claims > MAX_TOKEN_BASE_UNITS) {
      context.addIssue({
        code: 'custom',
        path: ['claimAmountBaseUnits'],
        message: 'Aggregate fixture claim amount exceeds the bounded base-unit range.',
      });
    }
    if (toBaseUnits(input.fixtureFeePerAttemptLamports) * claims * 2n > MAX_TOKEN_BASE_UNITS) {
      context.addIssue({
        code: 'custom',
        path: ['fixtureFeePerAttemptLamports'],
        message: 'Aggregate fixture fee exposure exceeds the bounded range.',
      });
    }
  });
export type OfflineClaimSimulationInput = z.infer<typeof offlineClaimSimulationInputSchema>;

export const offlineClaimSimulationReportSchema = z
  .object({
    reportLabel: z.literal(OFFLINE_SIMULATION_LABEL),
    blockchainNotice: z.literal(NO_BLOCKCHAIN_ACTION_NOTICE),
    mode: z.literal('deterministic_offline_fixture'),
    seed: z.number().int().positive(),
    claimCount: z.union([z.literal(100), z.literal(1_000), z.literal(10_000)]),
    scenario: offlineClaimSimulationScenarioSchema,
    eligibleCount: z.number().int().nonnegative(),
    authorizedMockCount: z.number().int().nonnegative(),
    quarantinedCount: z.number().int().nonnegative(),
    expiredCount: z.number().int().nonnegative(),
    rejectedCount: z.number().int().nonnegative(),
    duplicateAttemptCount: z.number().int().nonnegative(),
    duplicatePreventedCount: z.number().int().nonnegative(),
    capRejectionCount: z.number().int().nonnegative(),
    reserveRejectionCount: z.number().int().nonnegative(),
    feeReserveRejectionCount: z.number().int().nonnegative(),
    raceResolvedCount: z.number().int().nonnegative(),
    retryCount: z.number().int().nonnegative(),
    fixtureReserveUsageBaseUnits: nonnegativeTokenBaseUnitsSchema,
    fixtureFeeEstimateLamports: nonnegativeTokenBaseUnitsSchema,
    fixtureProcessingDurationMs: z.number().nonnegative(),
    fixtureMemoryBytes: z.number().int().nonnegative(),
    deterministicReplayResult: z.literal(true),
    resultDigest: z.string().regex(/^[A-F0-9]{32}$/u),
    networkAccessed: z.literal(false),
    liveSettlementEnabled: z.literal(false),
  })
  .strict();
export type OfflineClaimSimulationReport = z.infer<typeof offlineClaimSimulationReportSchema>;

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

function scenarioOutcome(
  scenario: OfflineClaimSimulationScenario,
  index: number,
  random: number,
  input: OfflineClaimSimulationInput,
  alreadyAuthorized: number,
  tokenAvailable: bigint,
  feeAvailable: bigint,
):
  | 'authorized'
  | 'quarantined'
  | 'expired'
  | 'rejected_cap'
  | 'rejected_reserve'
  | 'rejected_fee'
  | 'rejected' {
  if (tokenAvailable < toBaseUnits(input.claimAmountBaseUnits)) return 'rejected_reserve';
  if (feeAvailable < toBaseUnits(input.fixtureFeePerAttemptLamports)) return 'rejected_fee';
  if (scenario === 'expired_authorization' && index % 3 === 0) return 'expired';
  if (scenario === 'wallet_changed' && index % 4 === 0) return 'quarantined';
  if (scenario === 'wrong_mint' || scenario === 'wrong_network') return 'rejected';
  if (scenario === 'player_cap_reached' && alreadyAuthorized >= input.playerCapClaimCount) {
    return 'rejected_cap';
  }
  if (scenario === 'wallet_cap_reached' && alreadyAuthorized >= input.walletCapClaimCount) {
    return 'rejected_cap';
  }
  if (scenario === 'global_cap_reached' && alreadyAuthorized >= input.globalCapClaimCount) {
    return 'rejected_cap';
  }
  if (scenario === 'epoch_allocation_reached' && alreadyAuthorized >= input.epochCapClaimCount) {
    return 'rejected_cap';
  }
  if (scenario === 'quarantine_spike' && random < 0.35) return 'quarantined';
  if (
    scenario === 'signer_unavailable' ||
    scenario === 'rpc_outage_fixture' ||
    scenario === 'rpc_disagreement_fixture'
  ) {
    return 'rejected';
  }
  if (scenario === 'cancellation_race' && index % 2 === 0) return 'expired';
  if (scenario === 'dispute_race' && index % 3 === 0) return 'quarantined';
  if (scenario === 'baseline') {
    if (random < 0.02) return 'expired';
    if (random < 0.05) return 'quarantined';
  }
  return 'authorized';
}

export function runOfflineClaimSimulation(
  rawInput: OfflineClaimSimulationInput,
): OfflineClaimSimulationReport {
  const input = offlineClaimSimulationInputSchema.parse(rawInput);
  const random = seededRandom(input.seed);
  const amount = toBaseUnits(input.claimAmountBaseUnits);
  const fee = toBaseUnits(input.fixtureFeePerAttemptLamports);
  let tokenAvailable = toBaseUnits(input.fixtureAvailableTreasuryBaseUnits);
  let feeAvailable = toBaseUnits(input.fixtureAvailableFeeLamports);
  let authorizedMockCount = 0;
  let quarantinedCount = 0;
  let expiredCount = 0;
  let rejectedCount = 0;
  let capRejectionCount = 0;
  let reserveRejectionCount = 0;
  let feeReserveRejectionCount = 0;
  let duplicateAttemptCount = 0;
  let duplicatePreventedCount = 0;
  let raceResolvedCount = 0;
  let retryCount = 0;

  for (let index = 0; index < input.claimCount; index += 1) {
    const duplicateScenario =
      input.scenario === 'duplicate_claim_attempts' ||
      input.scenario === 'two_sessions_one_eligibility' ||
      input.scenario === 'replayed_authorization';
    if (duplicateScenario) {
      duplicateAttemptCount += 1;
      duplicatePreventedCount += 1;
      retryCount += 1;
    }
    if (input.scenario === 'rpc_outage_fixture' || input.scenario === 'rpc_disagreement_fixture') {
      retryCount += 1;
    }
    if (input.scenario === 'cancellation_race' || input.scenario === 'dispute_race') {
      raceResolvedCount += 1;
    }
    const outcome = scenarioOutcome(
      input.scenario,
      index,
      random(),
      input,
      authorizedMockCount,
      tokenAvailable,
      feeAvailable,
    );
    if (outcome === 'authorized') {
      authorizedMockCount += 1;
      tokenAvailable = tokenAvailable >= amount ? tokenAvailable - amount : 0n;
      feeAvailable = feeAvailable >= fee ? feeAvailable - fee : 0n;
    } else if (outcome === 'quarantined') {
      quarantinedCount += 1;
    } else if (outcome === 'expired') {
      expiredCount += 1;
    } else {
      rejectedCount += 1;
      if (outcome === 'rejected_cap') capRejectionCount += 1;
      if (outcome === 'rejected_reserve') reserveRejectionCount += 1;
      if (outcome === 'rejected_fee') feeReserveRejectionCount += 1;
    }
  }

  const eligibleCount =
    input.scenario === 'wrong_mint' || input.scenario === 'wrong_network' ? 0 : input.claimCount;
  const reserveUsage = amount * BigInt(authorizedMockCount);
  const feeEstimate = fee * BigInt(authorizedMockCount + retryCount);
  const deterministicFields = [
    input.seed,
    input.claimCount,
    input.scenario,
    eligibleCount,
    authorizedMockCount,
    quarantinedCount,
    expiredCount,
    rejectedCount,
    duplicatePreventedCount,
    capRejectionCount,
    reserveRejectionCount,
    feeReserveRejectionCount,
    raceResolvedCount,
    retryCount,
    reserveUsage.toString(),
    feeEstimate.toString(),
  ].map(String);

  return offlineClaimSimulationReportSchema.parse({
    reportLabel: OFFLINE_SIMULATION_LABEL,
    blockchainNotice: NO_BLOCKCHAIN_ACTION_NOTICE,
    mode: 'deterministic_offline_fixture',
    seed: input.seed,
    claimCount: input.claimCount,
    scenario: input.scenario,
    eligibleCount,
    authorizedMockCount,
    quarantinedCount,
    expiredCount,
    rejectedCount,
    duplicateAttemptCount,
    duplicatePreventedCount,
    capRejectionCount,
    reserveRejectionCount,
    feeReserveRejectionCount,
    raceResolvedCount,
    retryCount,
    fixtureReserveUsageBaseUnits: fromBaseUnits(reserveUsage),
    fixtureFeeEstimateLamports: fromBaseUnits(feeEstimate),
    fixtureProcessingDurationMs: Number((input.claimCount * 0.0125).toFixed(3)),
    fixtureMemoryBytes: input.claimCount * 384 + 16_384,
    deterministicReplayResult: true,
    resultDigest: deterministicFixtureDigest(
      'starville.mock.claim-simulation-report.v1',
      deterministicFields,
    ),
    networkAccessed: false,
    liveSettlementEnabled: false,
  });
}

export function createStandardOfflineSimulationInput(
  claimCount: 100 | 1_000 | 10_000,
  seed = 9_001,
  scenario: OfflineClaimSimulationScenario = 'baseline',
): OfflineClaimSimulationInput {
  const standardTreasury = BigInt(claimCount) * 500n * 2n;
  const standardFees = BigInt(claimCount) * 5_000n * 2n;
  return offlineClaimSimulationInputSchema.parse({
    seed,
    claimCount,
    scenario,
    claimAmountBaseUnits: '500',
    fixtureAvailableTreasuryBaseUnits:
      scenario === 'treasury_reserve_reached'
        ? ((BigInt(claimCount) * 500n) / 2n).toString()
        : standardTreasury.toString(),
    fixtureAvailableFeeLamports:
      scenario === 'fee_reserve_reached'
        ? ((BigInt(claimCount) * 5_000n) / 2n).toString()
        : standardFees.toString(),
    fixtureFeePerAttemptLamports: '5000',
    playerCapClaimCount: Math.min(claimCount, 50),
    walletCapClaimCount: Math.min(claimCount, 100),
    globalCapClaimCount: Math.max(1, Math.floor(claimCount * 0.8)),
    epochCapClaimCount: Math.max(1, Math.floor(claimCount * 0.9)),
  });
}

export function runStandardOfflineSimulationSuite(
  seed = 9_001,
): readonly OfflineClaimSimulationReport[] {
  return ([100, 1_000, 10_000] as const).map((claimCount, index) =>
    runOfflineClaimSimulation(createStandardOfflineSimulationInput(claimCount, seed + index)),
  );
}

export function runOfflineScenarioMatrix(
  seed = 12_001,
  claimCount: 100 | 1_000 | 10_000 = 1_000,
): readonly OfflineClaimSimulationReport[] {
  return OFFLINE_CLAIM_SIMULATION_SCENARIOS.map((scenario, index) =>
    runOfflineClaimSimulation(
      createStandardOfflineSimulationInput(claimCount, seed + index, scenario),
    ),
  );
}

export function verifyOfflineSimulationReplay(input: OfflineClaimSimulationInput): boolean {
  const first = runOfflineClaimSimulation(input);
  const second = runOfflineClaimSimulation(input);
  return first.resultDigest === second.resultDigest;
}
