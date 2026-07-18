import { describe, expect, it } from 'vitest';

import {
  ECONOMY_TUNING_CANDIDATES,
  ECONOMY_TUNING_RECOMMENDATION,
  compareEconomySimulations,
  cosmeticParticipationScenarioSchema,
  economySimulationScenarioSchema,
  phase11cShopActivitySchema,
  runCosmeticEconomyParticipationComparison,
  runEconomyCandidateComparison,
  runEconomySimulation,
  runPhase11CShopSimulationSuite,
} from '../src';

const base = {
  seed: 9_001,
  playerCount: 100 as const,
  durationDays: 30 as const,
  starterGrant: 250,
  meanDailySource: 18,
  sourceParticipationRate: 0.55,
  meanDailySink: 16,
  sinkParticipationRate: 0.5,
  beginnerProtectionDays: 3,
};

describe('economy simulation', () => {
  it('is deterministic for the same inputs and seed', () => {
    expect(runEconomySimulation(base)).toEqual(runEconomySimulation(base));
  });

  it('returns identical isolated reports for concurrent same-seed runs', async () => {
    const reports = await Promise.all(
      Array.from({ length: 16 }, async () => runEconomySimulation(base)),
    );
    expect(reports).toHaveLength(16);
    for (const report of reports.slice(1)) {
      expect(report).toEqual(reports[0]);
    }
  });

  it('changes output for a different seed without mutating input', () => {
    const snapshot = structuredClone(base);
    expect(runEconomySimulation({ ...base, seed: 9_002 })).not.toEqual(runEconomySimulation(base));
    expect(base).toEqual(snapshot);
  });

  it.each([100, 1_000, 10_000] as const)('supports %i-player scenarios', (playerCount) => {
    expect(runEconomySimulation({ ...base, playerCount }).playerCount).toBe(playerCount);
  });

  it.each([30, 90, 180] as const)('supports %i-day scenarios', (durationDays) => {
    const result = runEconomySimulation({ ...base, durationDays });
    expect(result.durationDays).toBe(durationDays);
    expect(result.negativeBalanceCount).toBe(0);
  });

  it.each(economySimulationScenarioSchema.options)(
    'supports the deterministic %s planning scenario',
    (scenario) => {
      const result = runEconomySimulation({ ...base, scenario });
      expect(result.scenario).toBe(scenario);
      expect(result.reconciliationMismatchCount).toBe(0);
      expect(result.correctionVolume).toBe(0);
    },
  );

  it('reports the reviewed distribution, participation, inflation, and risk planning metrics', () => {
    const result = runEconomySimulation({
      ...base,
      scenario: 'suspicious-farming-10-percent',
    });
    expect(result.p10Balance).toBeLessThanOrEqual(result.medianBalance);
    expect(result.medianBalance).toBeLessThanOrEqual(result.p90Balance);
    expect(result.p90Balance).toBeLessThanOrEqual(result.p99Balance);
    expect(result.balanceConcentration).toBeGreaterThan(0);
    expect(result.suspiciousRewardContribution).toBeGreaterThan(0);
    expect(result.purchaseFrequency).toBeGreaterThanOrEqual(0);
    expect(result.velocityEstimate).toBeGreaterThanOrEqual(0);
  });

  it('compares two isolated runs without mutating either report', () => {
    const left = runEconomySimulation(base);
    const right = runEconomySimulation({ ...base, scenario: 'shop-disabled' });
    const leftSnapshot = structuredClone(left);
    const comparison = compareEconomySimulations(left, right);
    expect(comparison.leftSeed).toBe(base.seed);
    expect(comparison.supplyDelta).not.toBe(0);
    expect(left).toEqual(leftSnapshot);
  });

  it('compares all four named candidates without publishing or mutating player data', () => {
    const report = runEconomyCandidateComparison(base);
    expect(report.results.map((result) => result.candidate)).toEqual(
      ECONOMY_TUNING_CANDIDATES.map((candidate) => candidate.key),
    );
    expect(report.playerBalancesMutated).toBe(false);
    expect(report.recommendation).toEqual(ECONOMY_TUNING_RECOMMENDATION);
    expect(report.recommendation.published).toBe(false);
    expect(report.assumptions.starterGrantPreserved).toBe(true);
  });

  it('reports affordability, distribution, participation, and daily net-change metrics', () => {
    const result = runEconomySimulation({ ...base, candidate: 'balanced-combination' });
    expect(result.candidateTitle).toContain('Candidate D');
    expect(result.beginnerAffordabilityRate).toBeGreaterThanOrEqual(0);
    expect(result.beginnerAffordabilityRate).toBeLessThanOrEqual(1);
    expect(result.shopParticipationRate).toBe(result.sinkParticipation);
    expect(result.capReachRate).toBe(result.dailyRewardCapReachRate);
    expect(result.dailyNetChange).toBeCloseTo(
      (result.totalCreated - result.totalDestroyed) / 30,
      5,
    );
  });

  it('models all four cosmetic participation levels without reading or mutating live state', () => {
    const input = {
      seed: 10_200,
      playerCount: 1_000 as const,
      durationDays: 180 as const,
      starterGrant: 250,
      meanDailySource: 18,
      sourceParticipationRate: 0.55,
      entryCosmeticPrice: 120,
      collectionSize: 12,
    };
    const report = runCosmeticEconomyParticipationComparison(input);
    expect(report.results.map((result) => result.scenario)).toEqual(
      cosmeticParticipationScenarioSchema.options,
    );
    expect(runCosmeticEconomyParticipationComparison(input)).toEqual(report);
    expect(report.playerBalancesMutated).toBe(false);
    expect(report.liveDataRead).toBe(false);
    expect(report.published).toBe(false);
    expect(report.tokenClaimsCreated).toBe(0);
    expect(report.assumptions.gameplayPowerGranted).toBe(false);
  });

  it('reports cosmetic sink, affordability, concentration, participation, and exhaustion metrics', () => {
    const report = runCosmeticEconomyParticipationComparison({
      seed: 10_201,
      playerCount: 100 as const,
      durationDays: 90 as const,
      starterGrant: 250,
      meanDailySource: 18,
      sourceParticipationRate: 0.55,
      entryCosmeticPrice: 120,
      collectionSize: 12,
    });
    const none = report.results.find((result) => result.scenario === 'none');
    const high = report.results.find((result) => result.scenario === 'high');
    expect(none?.totalCosmeticDustDestroyed).toBe(0);
    expect(none?.sourceToSinkRatio).toBeNull();
    expect(high?.totalCosmeticDustDestroyed).toBeGreaterThan(0);
    expect(high?.shopParticipationRate).toBeGreaterThan(0);
    expect(high?.repeatSpendingRate).toBeGreaterThan(0);
    expect(high?.averageCosmeticsOwned).toBeGreaterThan(0);
    expect(high?.negativeBalanceCount).toBe(0);
    for (const result of report.results) {
      expect(result.beginnerAffordabilityRate).toBeGreaterThanOrEqual(0);
      expect(result.highBalanceConcentration).toBeGreaterThanOrEqual(0);
      expect(result.collectionExhaustionRate).toBeGreaterThanOrEqual(0);
      expect(result.longTermSinkUsefulnessRate).toBeGreaterThanOrEqual(0);
    }
  });

  it('models all Phase 11C shop activity levels deterministically without live mutations', () => {
    const input = {
      seed: 11_300,
      playerCount: 100 as const,
      durationDays: 30 as const,
      starterDust: 250,
      inventoryCapacity: 12,
      globalDailySaleDustCap: 5_000,
    };
    const report = runPhase11CShopSimulationSuite(input);
    expect(runPhase11CShopSimulationSuite(input)).toEqual(report);
    expect(report.results.map((result) => result.activity)).toEqual(
      phase11cShopActivitySchema.options,
    );
    expect(report.playerBalancesMutated).toBe(false);
    expect(report.liveDataRead).toBe(false);
    expect(report.publishedTuningChanged).toBe(false);
    expect(report.sources).toContain('crop-sales');
    expect(report.sinks).toContain('seed-purchases');
  });

  it('covers shop loops, bounds, stock, concurrency, failures, rewards, and price versions', () => {
    const report = runPhase11CShopSimulationSuite({
      seed: 11_301,
      playerCount: 100 as const,
      durationDays: 90 as const,
      starterDust: 250,
      inventoryCapacity: 12,
      globalDailySaleDustCap: 200,
    });
    for (const result of report.results) {
      expect(result.seedPurchaseCount).toBeGreaterThan(0);
      expect(result.cropSaleCount).toBeGreaterThan(0);
      expect(result.soupSaleCount).toBeGreaterThan(0);
      expect(result.twineSaleCount).toBeGreaterThan(0);
      expect(result.ingredientPurchaseCount).toBeGreaterThan(0);
      expect(result.farmingCycles).toBeGreaterThan(0);
      expect(result.restockedUnits).toBeGreaterThan(0);
      expect(result.priceVersionChanges).toBe(1);
      expect(result.concurrentFinalUnitAttempts).toBe(2);
      expect(result.concurrentFinalUnitSuccesses).toBe(1);
      expect(result.duplicateStarterItemGrants).toBe(0);
      expect(result.tutorialRewardDuplicateSettlements).toBe(0);
      expect(result.negativeBalanceCount).toBe(0);
      expect(result.identifiedProfitLoops.join(' ')).toContain('Direct catalog buy-to-sell');
    }
    const high = report.results.find((result) => result.activity === 'high-activity');
    expect(high?.purchaseLimitBlocks).toBeGreaterThan(0);
    expect(high?.stockoutBlocks).toBeGreaterThan(0);
    expect(report.results.some((result) => result.globalLimitBlocks > 0)).toBe(true);
    expect(report.results.some((result) => result.inventoryFullBlocks > 0)).toBe(true);
  });
});
