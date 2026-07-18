import { z } from 'zod';

import {
  fromBaseUnits,
  MAX_TOKEN_BASE_UNITS,
  NO_BLOCKCHAIN_ACTION_NOTICE,
  nonnegativeTokenBaseUnitsSchema,
  OFFLINE_SIMULATION_LABEL,
  tokenBaseUnitsSchema,
  toBaseUnits,
} from './common';

export const treasuryDepletionSimulationInputSchema = z
  .object({
    startingTokenBalanceBaseUnits: tokenBaseUnitsSchema,
    startingSolFeeBalanceLamports: tokenBaseUnitsSchema,
    dailyEligibilityCount: z.number().int().min(1).max(1_000_000),
    claimSizeDistribution: z.enum(['fixed_fixture', 'uniform_bounded_fixture', 'two_tier_fixture']),
    minimumClaimBaseUnits: tokenBaseUnitsSchema,
    maximumClaimBaseUnits: tokenBaseUnitsSchema,
    fixtureFeePerAttemptLamports: tokenBaseUnitsSchema,
    failureRateBasisPoints: z.number().int().min(0).max(10_000),
    retryRateBasisPoints: z.number().int().min(0).max(10_000),
    minimumTokenReserveBaseUnits: nonnegativeTokenBaseUnitsSchema,
    minimumSolFeeReserveLamports: nonnegativeTokenBaseUnitsSchema,
    safetyBufferBaseUnits: nonnegativeTokenBaseUnitsSchema,
    authorizationExpiryDays: z.number().int().min(1).max(365),
    averagePlayerClaimDelayDays: z.number().int().min(0).max(365),
    planningHorizonDays: z.number().int().min(1).max(3_650),
    emergencyPauseRunwayDays: z.number().int().min(1).max(365),
  })
  .strict()
  .superRefine((value, context) => {
    if (toBaseUnits(value.minimumClaimBaseUnits) > toBaseUnits(value.maximumClaimBaseUnits)) {
      context.addIssue({
        code: 'custom',
        path: ['minimumClaimBaseUnits'],
        message: 'Minimum claim cannot exceed maximum claim.',
      });
    }
    const maximumPending =
      toBaseUnits(value.maximumClaimBaseUnits) *
      BigInt(value.dailyEligibilityCount) *
      BigInt(value.authorizationExpiryDays);
    if (maximumPending > MAX_TOKEN_BASE_UNITS) {
      context.addIssue({
        code: 'custom',
        path: ['maximumClaimBaseUnits'],
        message: 'Worst-case fixture pending liability exceeds the bounded base-unit range.',
      });
    }
    const maximumSevenDayBuffer =
      toBaseUnits(value.maximumClaimBaseUnits) * BigInt(value.dailyEligibilityCount) * 7n;
    if (maximumSevenDayBuffer > MAX_TOKEN_BASE_UNITS) {
      context.addIssue({
        code: 'custom',
        path: ['maximumClaimBaseUnits'],
        message: 'Worst-case seven-day fixture buffer exceeds the bounded base-unit range.',
      });
    }
    const maximumFeeExposure =
      toBaseUnits(value.fixtureFeePerAttemptLamports) * BigInt(value.dailyEligibilityCount) * 2n;
    if (maximumFeeExposure > MAX_TOKEN_BASE_UNITS) {
      context.addIssue({
        code: 'custom',
        path: ['fixtureFeePerAttemptLamports'],
        message: 'Maximum daily fixture fee exposure exceeds the bounded range.',
      });
    }
  });
export type TreasuryDepletionSimulationInput = z.infer<
  typeof treasuryDepletionSimulationInputSchema
>;

export const treasuryDepletionSimulationReportSchema = z
  .object({
    reportLabel: z.literal(OFFLINE_SIMULATION_LABEL),
    blockchainNotice: z.literal(NO_BLOCKCHAIN_ACTION_NOTICE),
    forecastNotice: z.literal('FIXTURE RUNWAY MODEL — NOT A FINANCIAL FORECAST'),
    mode: z.literal('deterministic_offline_fixture'),
    daysUntilMinimumTokenReserve: z.number().int().nonnegative().nullable(),
    daysUntilMinimumFeeReserve: z.number().int().nonnegative().nullable(),
    maximumSafeDailyMockAuthorizationBaseUnits: nonnegativeTokenBaseUnitsSchema,
    pendingAuthorizationExposureBaseUnits: nonnegativeTokenBaseUnitsSchema,
    worstCasePendingLiabilityBaseUnits: nonnegativeTokenBaseUnitsSchema,
    estimatedFeeRunwayDays: z.number().int().nonnegative().nullable(),
    emergencyPauseTrigger: z.boolean(),
    emergencyPauseReasons: z.array(
      z.enum(['token_runway_low', 'fee_runway_low', 'daily_authorization_above_safe_bound']),
    ),
    safetyBufferRecommendationBaseUnits: nonnegativeTokenBaseUnitsSchema,
    averageFixtureClaimBaseUnits: tokenBaseUnitsSchema,
    estimatedDailyOutgoingBaseUnits: nonnegativeTokenBaseUnitsSchema,
    estimatedDailyFeeUseLamports: nonnegativeTokenBaseUnitsSchema,
    deterministicReplayResult: z.literal(true),
    networkAccessed: z.literal(false),
    liveSettlementEnabled: z.literal(false),
  })
  .strict();
export type TreasuryDepletionSimulationReport = z.infer<
  typeof treasuryDepletionSimulationReportSchema
>;

function floorDivide(numerator: bigint, denominator: bigint): bigint | null {
  return denominator === 0n ? null : numerator / denominator;
}

function nullableSafeNumber(value: bigint | null): number | null {
  if (value === null) return null;
  return Number(value > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : value);
}

function averageClaim(input: TreasuryDepletionSimulationInput): bigint {
  const minimum = toBaseUnits(input.minimumClaimBaseUnits);
  const maximum = toBaseUnits(input.maximumClaimBaseUnits);
  if (input.claimSizeDistribution === 'fixed_fixture') return minimum;
  if (input.claimSizeDistribution === 'uniform_bounded_fixture') return (minimum + maximum) / 2n;
  return (minimum * 3n + maximum) / 4n;
}

export function runTreasuryDepletionSimulation(
  rawInput: TreasuryDepletionSimulationInput,
): TreasuryDepletionSimulationReport {
  const input = treasuryDepletionSimulationInputSchema.parse(rawInput);
  const startingToken = toBaseUnits(input.startingTokenBalanceBaseUnits);
  const startingFee = toBaseUnits(input.startingSolFeeBalanceLamports);
  const minimumToken = toBaseUnits(input.minimumTokenReserveBaseUnits);
  const minimumFee = toBaseUnits(input.minimumSolFeeReserveLamports);
  const safetyBuffer = toBaseUnits(input.safetyBufferBaseUnits);
  const claim = averageClaim(input);
  const dailyEligibility = BigInt(input.dailyEligibilityCount);
  const successfulClaims =
    (dailyEligibility * BigInt(10_000 - input.failureRateBasisPoints)) / 10_000n;
  const failures = dailyEligibility - successfulClaims;
  const retries = (failures * BigInt(input.retryRateBasisPoints)) / 10_000n;
  const dailyOutgoing = claim * successfulClaims;
  const dailyFeeUse =
    toBaseUnits(input.fixtureFeePerAttemptLamports) * (dailyEligibility + retries);
  const tokenSpendable =
    startingToken > minimumToken + safetyBuffer ? startingToken - minimumToken - safetyBuffer : 0n;
  const feeSpendable = startingFee > minimumFee ? startingFee - minimumFee : 0n;
  const tokenRunway = floorDivide(tokenSpendable, dailyOutgoing);
  const feeRunway = floorDivide(feeSpendable, dailyFeeUse);
  const exposureDays = Math.min(
    input.authorizationExpiryDays,
    Math.max(1, input.averagePlayerClaimDelayDays),
  );
  const pendingExposure = claim * dailyEligibility * BigInt(exposureDays);
  const worstCasePending =
    toBaseUnits(input.maximumClaimBaseUnits) *
    dailyEligibility *
    BigInt(input.authorizationExpiryDays);
  const tokenDailyBound = tokenSpendable / BigInt(input.planningHorizonDays);
  const feeDailyClaimBound =
    toBaseUnits(input.fixtureFeePerAttemptLamports) === 0n
      ? tokenDailyBound
      : (feeSpendable /
          BigInt(input.planningHorizonDays) /
          toBaseUnits(input.fixtureFeePerAttemptLamports)) *
        claim;
  const safeDailyAuthorization =
    tokenDailyBound < feeDailyClaimBound ? tokenDailyBound : feeDailyClaimBound;
  const reasons: TreasuryDepletionSimulationReport['emergencyPauseReasons'][number][] = [];
  if (tokenRunway !== null && tokenRunway <= BigInt(input.emergencyPauseRunwayDays)) {
    reasons.push('token_runway_low');
  }
  if (feeRunway !== null && feeRunway <= BigInt(input.emergencyPauseRunwayDays)) {
    reasons.push('fee_runway_low');
  }
  if (dailyOutgoing > safeDailyAuthorization) {
    reasons.push('daily_authorization_above_safe_bound');
  }
  const sevenDayBuffer = dailyOutgoing * 7n;
  const recommendation = safetyBuffer > sevenDayBuffer ? safetyBuffer : sevenDayBuffer;

  return treasuryDepletionSimulationReportSchema.parse({
    reportLabel: OFFLINE_SIMULATION_LABEL,
    blockchainNotice: NO_BLOCKCHAIN_ACTION_NOTICE,
    forecastNotice: 'FIXTURE RUNWAY MODEL — NOT A FINANCIAL FORECAST',
    mode: 'deterministic_offline_fixture',
    daysUntilMinimumTokenReserve: nullableSafeNumber(tokenRunway),
    daysUntilMinimumFeeReserve: nullableSafeNumber(feeRunway),
    maximumSafeDailyMockAuthorizationBaseUnits: fromBaseUnits(safeDailyAuthorization),
    pendingAuthorizationExposureBaseUnits: fromBaseUnits(pendingExposure),
    worstCasePendingLiabilityBaseUnits: fromBaseUnits(worstCasePending),
    estimatedFeeRunwayDays: nullableSafeNumber(feeRunway),
    emergencyPauseTrigger: reasons.length > 0,
    emergencyPauseReasons: reasons,
    safetyBufferRecommendationBaseUnits: fromBaseUnits(recommendation),
    averageFixtureClaimBaseUnits: fromBaseUnits(claim),
    estimatedDailyOutgoingBaseUnits: fromBaseUnits(dailyOutgoing),
    estimatedDailyFeeUseLamports: fromBaseUnits(dailyFeeUse),
    deterministicReplayResult: true,
    networkAccessed: false,
    liveSettlementEnabled: false,
  });
}

export function createStandardTreasuryDepletionFixture(): TreasuryDepletionSimulationInput {
  return treasuryDepletionSimulationInputSchema.parse({
    startingTokenBalanceBaseUnits: '5000000000',
    startingSolFeeBalanceLamports: '10000000000',
    dailyEligibilityCount: 1000,
    claimSizeDistribution: 'two_tier_fixture',
    minimumClaimBaseUnits: '100',
    maximumClaimBaseUnits: '1000',
    fixtureFeePerAttemptLamports: '5000',
    failureRateBasisPoints: 500,
    retryRateBasisPoints: 8000,
    minimumTokenReserveBaseUnits: '1000000000',
    minimumSolFeeReserveLamports: '1000000000',
    safetyBufferBaseUnits: '250000000',
    authorizationExpiryDays: 7,
    averagePlayerClaimDelayDays: 2,
    planningHorizonDays: 180,
    emergencyPauseRunwayDays: 30,
  });
}

export function runStandardTreasuryDepletionFixture(): TreasuryDepletionSimulationReport {
  return runTreasuryDepletionSimulation(createStandardTreasuryDepletionFixture());
}
