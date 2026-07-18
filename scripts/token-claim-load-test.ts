import { performance } from 'node:perf_hooks';

import {
  NO_BLOCKCHAIN_ACTION_NOTICE,
  OFFLINE_CLAIM_SIMULATION_SCENARIOS,
  OFFLINE_SIMULATION_LABEL,
  createStandardOfflineSimulationInput,
  runOfflineClaimSimulation,
  runOfflineScenarioMatrix,
  runStandardOfflineSimulationSuite,
  runStandardTreasuryDepletionFixture,
  type OfflineClaimSimulationReport,
} from '@starville/token-claim-architecture';

function assertInvariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Phase 9B-A offline simulation invariant failed: ${message}`);
}

function assertOfflineBoundary(report: OfflineClaimSimulationReport): void {
  assertInvariant(report.reportLabel === OFFLINE_SIMULATION_LABEL, 'report label changed');
  assertInvariant(
    report.blockchainNotice === NO_BLOCKCHAIN_ACTION_NOTICE,
    'blockchain safety notice changed',
  );
  assertInvariant(report.networkAccessed === false, 'a fixture reported network access');
  assertInvariant(report.liveSettlementEnabled === false, 'a fixture enabled settlement');
  assertInvariant(report.deterministicReplayResult, 'deterministic replay failed');
  assertInvariant(
    report.authorizedMockCount +
      report.quarantinedCount +
      report.expiredCount +
      report.rejectedCount ===
      report.claimCount,
    `${report.scenario} did not account for every fixture claim`,
  );
}

const measuredHeapBefore = process.memoryUsage().heapUsed;
const measuredStart = performance.now();
const standardRuns = runStandardOfflineSimulationSuite(9_001);
const standardRuntimeMeasurements = ([100, 1_000, 10_000] as const).map((claimCount, index) => {
  const heapBefore = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  const replay = runOfflineClaimSimulation(
    createStandardOfflineSimulationInput(claimCount, 9_001 + index),
  );
  const durationMs = performance.now() - startedAt;
  const heapAfter = process.memoryUsage().heapUsed;
  assertInvariant(
    replay.resultDigest === standardRuns[index]?.resultDigest,
    `${claimCount}-claim measured replay changed its deterministic result`,
  );
  return {
    claimCount,
    measuredDurationMs: Number(durationMs.toFixed(3)),
    measuredHeapDeltaBytes: heapAfter - heapBefore,
  };
});
const scenarioRuns = runOfflineScenarioMatrix(12_001, 1_000);
const depletion = runStandardTreasuryDepletionFixture();
const measuredDurationMs = performance.now() - measuredStart;
const measuredHeapAfter = process.memoryUsage().heapUsed;

assertInvariant(
  standardRuns.map((report) => report.claimCount).join(',') === '100,1000,10000',
  'the standard 100/1,000/10,000 claim matrix is incomplete',
);
assertInvariant(
  scenarioRuns.length === OFFLINE_CLAIM_SIMULATION_SCENARIOS.length,
  'the closed scenario matrix is incomplete',
);
for (const report of [...standardRuns, ...scenarioRuns]) assertOfflineBoundary(report);

const byScenario = new Map(scenarioRuns.map((report) => [report.scenario, report] as const));
for (const scenario of OFFLINE_CLAIM_SIMULATION_SCENARIOS) {
  assertInvariant(byScenario.has(scenario), `missing scenario ${scenario}`);
}
for (const scenario of ['wrong_mint', 'wrong_network'] as const) {
  const report = byScenario.get(scenario);
  assertInvariant(report !== undefined, `missing ${scenario} report`);
  assertInvariant(report.eligibleCount === 0, `${scenario} did not fail eligibility closed`);
  assertInvariant(report.authorizedMockCount === 0, `${scenario} authorized a mock claim`);
  assertInvariant(
    report.rejectedCount === report.claimCount,
    `${scenario} did not reject all claims`,
  );
}
for (const scenario of [
  'player_cap_reached',
  'wallet_cap_reached',
  'global_cap_reached',
  'epoch_allocation_reached',
] as const) {
  assertInvariant(
    (byScenario.get(scenario)?.capRejectionCount ?? 0) > 0,
    `${scenario} did not exercise a cap rejection`,
  );
}
assertInvariant(
  (byScenario.get('treasury_reserve_reached')?.reserveRejectionCount ?? 0) > 0,
  'token reserve boundary was not exercised',
);
assertInvariant(
  (byScenario.get('fee_reserve_reached')?.feeReserveRejectionCount ?? 0) > 0,
  'fee reserve boundary was not exercised',
);
for (const scenario of [
  'duplicate_claim_attempts',
  'two_sessions_one_eligibility',
  'replayed_authorization',
] as const) {
  const report = byScenario.get(scenario);
  assertInvariant(report !== undefined, `missing ${scenario} report`);
  assertInvariant(
    report.duplicateAttemptCount === report.duplicatePreventedCount,
    `${scenario} did not prevent every duplicate fixture attempt`,
  );
}

assertInvariant(depletion.reportLabel === OFFLINE_SIMULATION_LABEL, 'depletion label changed');
assertInvariant(
  depletion.blockchainNotice === NO_BLOCKCHAIN_ACTION_NOTICE,
  'depletion blockchain notice changed',
);
assertInvariant(
  depletion.forecastNotice === 'FIXTURE RUNWAY MODEL — NOT A FINANCIAL FORECAST',
  'depletion forecast disclaimer changed',
);
assertInvariant(depletion.networkAccessed === false, 'depletion fixture reported network access');
assertInvariant(
  depletion.liveSettlementEnabled === false,
  'depletion fixture enabled live settlement',
);

process.stdout.write(
  `${JSON.stringify(
    {
      status: 'ok',
      reportLabel: OFFLINE_SIMULATION_LABEL,
      blockchainNotice: NO_BLOCKCHAIN_ACTION_NOTICE,
      standardRuns: standardRuns.map((report) => ({
        claimCount: report.claimCount,
        authorizedMockCount: report.authorizedMockCount,
        quarantinedCount: report.quarantinedCount,
        expiredCount: report.expiredCount,
        rejectedCount: report.rejectedCount,
        fixtureProcessingDurationMs: report.fixtureProcessingDurationMs,
        fixtureMemoryBytes: report.fixtureMemoryBytes,
        deterministicReplayResult: report.deterministicReplayResult,
        resultDigest: report.resultDigest,
      })),
      standardRuntimeMeasurements,
      scenarioMatrix: scenarioRuns.map((report) => ({
        scenario: report.scenario,
        authorizedMockCount: report.authorizedMockCount,
        quarantinedCount: report.quarantinedCount,
        expiredCount: report.expiredCount,
        rejectedCount: report.rejectedCount,
        duplicatePreventedCount: report.duplicatePreventedCount,
        capRejectionCount: report.capRejectionCount,
        reserveRejectionCount: report.reserveRejectionCount,
        feeReserveRejectionCount: report.feeReserveRejectionCount,
        raceResolvedCount: report.raceResolvedCount,
        retryCount: report.retryCount,
        resultDigest: report.resultDigest,
      })),
      treasuryDepletion: depletion,
      localRuntimeMeasurement: {
        measuredDurationMs: Number(measuredDurationMs.toFixed(3)),
        measuredHeapDeltaBytes: measuredHeapAfter - measuredHeapBefore,
      },
    },
    null,
    2,
  )}\n`,
);
