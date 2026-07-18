import { describe, expect, it } from 'vitest';

import {
  createStandardOfflineSimulationInput,
  createStandardTreasuryDepletionFixture,
  OFFLINE_CLAIM_SIMULATION_SCENARIOS,
  runOfflineClaimSimulation,
  runOfflineScenarioMatrix,
  runStandardOfflineSimulationSuite,
  runStandardTreasuryDepletionFixture,
  runTreasuryDepletionSimulation,
  treasuryDepletionSimulationInputSchema,
  verifyOfflineSimulationReplay,
} from '../src';

describe('deterministic offline claim simulation', () => {
  it('runs the required 100, 1,000, and 10,000 claim fixtures with explicit banners', () => {
    const reports = runStandardOfflineSimulationSuite();
    expect(reports.map(({ claimCount }) => claimCount)).toEqual([100, 1_000, 10_000]);
    for (const report of reports) {
      expect(report).toMatchObject({
        reportLabel: 'OFFLINE SIMULATION',
        blockchainNotice: 'NO BLOCKCHAIN TRANSACTION WAS SENT',
        deterministicReplayResult: true,
        networkAccessed: false,
        liveSettlementEnabled: false,
      });
      expect(
        report.authorizedMockCount +
          report.quarantinedCount +
          report.expiredCount +
          report.rejectedCount,
      ).toBe(report.claimCount);
      expect(report.fixtureMemoryBytes).toBeGreaterThan(0);
      expect(report.fixtureProcessingDurationMs).toBeGreaterThan(0);
      expect(
        verifyOfflineSimulationReplay(
          createStandardOfflineSimulationInput(report.claimCount, report.seed),
        ),
      ).toBe(true);
    }
  });

  it('replays every required scenario deterministically and fails closed at every boundary', () => {
    const first = runOfflineScenarioMatrix();
    const second = runOfflineScenarioMatrix();
    expect(first).toEqual(second);
    expect(first.map(({ scenario }) => scenario)).toEqual(OFFLINE_CLAIM_SIMULATION_SCENARIOS);
    expect(first.find(({ scenario }) => scenario === 'wrong_mint')).toMatchObject({
      eligibleCount: 0,
      authorizedMockCount: 0,
      rejectedCount: 1000,
    });
    expect(first.find(({ scenario }) => scenario === 'wrong_network')).toMatchObject({
      eligibleCount: 0,
      authorizedMockCount: 0,
      rejectedCount: 1000,
    });
    expect(
      first.find(({ scenario }) => scenario === 'duplicate_claim_attempts')
        ?.duplicatePreventedCount,
    ).toBe(1000);
    expect(
      first.find(({ scenario }) => scenario === 'two_sessions_one_eligibility')
        ?.duplicatePreventedCount,
    ).toBe(1000);
    expect(
      first.find(({ scenario }) => scenario === 'treasury_reserve_reached')?.reserveRejectionCount,
    ).toBeGreaterThan(0);
    expect(
      first.find(({ scenario }) => scenario === 'fee_reserve_reached')?.feeReserveRejectionCount,
    ).toBeGreaterThan(0);
    expect(
      first.find(({ scenario }) => scenario === 'rpc_outage_fixture')?.retryCount,
    ).toBeGreaterThan(0);
    expect(
      first.find(({ scenario }) => scenario === 'replayed_authorization')?.duplicatePreventedCount,
    ).toBe(1000);
    expect(first.find(({ scenario }) => scenario === 'cancellation_race')?.raceResolvedCount).toBe(
      1000,
    );
    expect(first.find(({ scenario }) => scenario === 'dispute_race')?.raceResolvedCount).toBe(1000);
  });

  it('enforces token and fee availability in baseline simulations too', () => {
    const baseline = createStandardOfflineSimulationInput(100);
    const noToken = runOfflineClaimSimulation({
      ...baseline,
      fixtureAvailableTreasuryBaseUnits: '0',
    });
    const noFees = runOfflineClaimSimulation({
      ...baseline,
      fixtureAvailableFeeLamports: '0',
    });
    expect(noToken).toMatchObject({ authorizedMockCount: 0, reserveRejectionCount: 100 });
    expect(noFees).toMatchObject({ authorizedMockCount: 0, feeReserveRejectionCount: 100 });
  });
});

describe('treasury depletion fixture model', () => {
  it('reports bounded deterministic runway and liability without calling it a financial forecast', () => {
    const first = runStandardTreasuryDepletionFixture();
    const second = runStandardTreasuryDepletionFixture();
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      reportLabel: 'OFFLINE SIMULATION',
      blockchainNotice: 'NO BLOCKCHAIN TRANSACTION WAS SENT',
      forecastNotice: 'FIXTURE RUNWAY MODEL — NOT A FINANCIAL FORECAST',
      deterministicReplayResult: true,
      networkAccessed: false,
      liveSettlementEnabled: false,
    });
    expect(first.daysUntilMinimumTokenReserve).toBeGreaterThan(0);
    expect(first.daysUntilMinimumFeeReserve).toBeGreaterThan(0);
    expect(BigInt(first.pendingAuthorizationExposureBaseUnits)).toBeGreaterThan(0n);
    expect(BigInt(first.worstCasePendingLiabilityBaseUnits)).toBeGreaterThanOrEqual(
      BigInt(first.pendingAuthorizationExposureBaseUnits),
    );
  });

  it('triggers an emergency pause recommendation for depleted fixture reserves', () => {
    const fixture = createStandardTreasuryDepletionFixture();
    const report = runTreasuryDepletionSimulation({
      ...fixture,
      startingTokenBalanceBaseUnits: '1000000100',
      startingSolFeeBalanceLamports: '1000005000',
    });
    expect(report.emergencyPauseTrigger).toBe(true);
    expect(report.emergencyPauseReasons).toEqual(
      expect.arrayContaining(['token_runway_low', 'fee_runway_low']),
    );
  });

  it('rejects an input whose seven-day safety recommendation could exceed bounded base units', () => {
    const fixture = createStandardTreasuryDepletionFixture();
    expect(
      treasuryDepletionSimulationInputSchema.safeParse({
        ...fixture,
        dailyEligibilityCount: 1,
        minimumClaimBaseUnits: '18446744073709551615',
        maximumClaimBaseUnits: '18446744073709551615',
        authorizationExpiryDays: 1,
      }).success,
    ).toBe(false);
  });
});
