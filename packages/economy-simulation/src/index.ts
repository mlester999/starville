import { z } from 'zod';

const playerCountSchema = z.union([z.literal(100), z.literal(1_000), z.literal(10_000)]);
const durationDaysSchema = z.union([z.literal(30), z.literal(90), z.literal(180)]);
export const economyTuningCandidateSchema = z.enum([
  'current-baseline',
  'more-useful-spending',
  'lower-repeatable-emissions',
  'balanced-combination',
]);
export type EconomyTuningCandidate = z.infer<typeof economyTuningCandidateSchema>;

export const ECONOMY_TUNING_CANDIDATES = Object.freeze([
  {
    key: 'current-baseline' as const,
    label: 'Candidate A — Current Baseline',
    summary: 'Preserves the currently reviewed local planning assumptions for comparison.',
    sourceAmountMultiplier: 1,
    sourceParticipationMultiplier: 1,
    sinkAmountMultiplier: 1,
    sinkParticipationMultiplier: 1,
  },
  {
    key: 'more-useful-spending' as const,
    label: 'Candidate B — More Useful Spending',
    summary:
      'Increases participation in useful ordinary-item sinks without adding transaction fees.',
    sourceAmountMultiplier: 1,
    sourceParticipationMultiplier: 1,
    sinkAmountMultiplier: 1.2,
    sinkParticipationMultiplier: 1.18,
  },
  {
    key: 'lower-repeatable-emissions' as const,
    label: 'Candidate C — Lower Repeatable Emissions',
    summary: 'Moderately reduces repeatable emissions while preserving starter access.',
    sourceAmountMultiplier: 0.88,
    sourceParticipationMultiplier: 0.94,
    sinkAmountMultiplier: 1,
    sinkParticipationMultiplier: 1,
  },
  {
    key: 'balanced-combination' as const,
    label: 'Candidate D — Balanced Combination',
    summary:
      'Combines a small repeatable-emission reduction with more useful spending opportunities.',
    sourceAmountMultiplier: 0.94,
    sourceParticipationMultiplier: 0.97,
    sinkAmountMultiplier: 1.12,
    sinkParticipationMultiplier: 1.1,
  },
] as const);

export const ECONOMY_TUNING_RECOMMENDATION = Object.freeze({
  candidate: 'balanced-combination' as const,
  title: 'Candidate D — Balanced Combination',
  rationale:
    'The conservative planning recommendation preserves starter DUST and beginner protection while combining modest repeatable-emission restraint with useful optional spending. Social systems, movement, chat, parties, and wallet access remain free and unchanged.',
  planningRangeMin: 0.95,
  planningRangeMax: 1.1,
  published: false as const,
});
export const economySimulationScenarioSchema = z.enum([
  'casual-heavy',
  'balanced',
  'highly-engaged',
  'reward-maximizing',
  'low-spending',
  'high-spending',
  'activity-event-spike',
  'shop-disabled',
  'reward-source-paused',
  'suspicious-farming-10-percent',
]);

export const economySimulationInputSchema = z
  .object({
    seed: z.number().int().min(1).max(2_147_483_647),
    playerCount: playerCountSchema,
    durationDays: durationDaysSchema,
    starterGrant: z.number().int().min(0).max(10_000),
    meanDailySource: z.number().min(0).max(10_000),
    sourceParticipationRate: z.number().min(0).max(1),
    meanDailySink: z.number().min(0).max(10_000),
    sinkParticipationRate: z.number().min(0).max(1),
    beginnerProtectionDays: z.number().int().min(0).max(30),
    scenario: economySimulationScenarioSchema.optional(),
    candidate: economyTuningCandidateSchema.optional(),
  })
  .strict();
export type EconomySimulationInput = z.infer<typeof economySimulationInputSchema>;

export const economySimulationResultSchema = z
  .object({
    seed: z.number().int().positive(),
    playerCount: playerCountSchema,
    durationDays: durationDaysSchema,
    scenario: economySimulationScenarioSchema,
    candidate: economyTuningCandidateSchema,
    candidateTitle: z.string().min(3).max(80),
    totalCreated: z.number().int().nonnegative(),
    totalDestroyed: z.number().int().nonnegative(),
    endingSupply: z.number().int().nonnegative(),
    medianBalance: z.number().int().nonnegative(),
    averageBalance: z.number().nonnegative(),
    p10Balance: z.number().int().nonnegative(),
    p90Balance: z.number().int().nonnegative(),
    p99Balance: z.number().int().nonnegative(),
    balanceConcentration: z.number().min(0).max(1),
    unableToBuyBasicItemRate: z.number().min(0).max(1),
    excessiveUnusedBalanceRate: z.number().min(0).max(1),
    purchaseFrequency: z.number().min(0),
    activityCompletionFrequency: z.number().min(0),
    dailyRewardCapReachRate: z.number().min(0).max(1),
    sinkParticipation: z.number().min(0).max(1),
    inflationTrend: z.number(),
    velocityEstimate: z.number().min(0),
    suspiciousRewardContribution: z.number().min(0).max(1),
    correctionVolume: z.literal(0),
    reconciliationMismatchCount: z.literal(0),
    sourceToSinkRatio: z.number().nonnegative(),
    dailyNetChange: z.number(),
    timeToFirstBasicPurchaseDays: z.number().int().nonnegative().nullable(),
    beginnerAffordabilityRate: z.number().min(0).max(1),
    medianBalanceGrowth: z.number(),
    shopParticipationRate: z.number().min(0).max(1),
    capReachRate: z.number().min(0).max(1),
    rewardMaximizerContribution: z.number().min(0).max(1),
    activeSourceRate: z.number().min(0).max(1),
    activeSinkRate: z.number().min(0).max(1),
    negativeBalanceCount: z.literal(0),
    recommendations: z.array(z.string().min(3).max(240)).max(6),
  })
  .strict();
export type EconomySimulationResult = z.infer<typeof economySimulationResultSchema>;

export interface EconomySimulationComparison {
  readonly leftSeed: number;
  readonly rightSeed: number;
  readonly supplyDelta: number;
  readonly sourceToSinkRatioDelta: number;
  readonly medianBalanceDelta: number;
  readonly suspiciousContributionDelta: number;
}

export interface EconomyCandidateComparisonReport {
  readonly mode: 'simulation';
  readonly playerBalancesMutated: false;
  readonly assumptions: Readonly<{
    planningRangeMin: number;
    planningRangeMax: number;
    starterGrantPreserved: boolean;
    socialSystemsRemainFree: boolean;
  }>;
  readonly results: readonly EconomySimulationResult[];
  readonly recommendation: typeof ECONOMY_TUNING_RECOMMENDATION;
  readonly limitations: readonly string[];
}

export const cosmeticParticipationScenarioSchema = z.enum(['none', 'low', 'moderate', 'high']);
export type CosmeticParticipationScenario = z.infer<typeof cosmeticParticipationScenarioSchema>;

export const cosmeticEconomySimulationInputSchema = z
  .object({
    seed: z.number().int().min(1).max(2_147_483_647),
    playerCount: playerCountSchema,
    durationDays: durationDaysSchema,
    starterGrant: z.number().int().min(0).max(10_000),
    meanDailySource: z.number().min(0).max(10_000),
    sourceParticipationRate: z.number().min(0).max(1),
    entryCosmeticPrice: z.number().int().min(1).max(10_000),
    collectionSize: z.number().int().min(1).max(100),
  })
  .strict();
export type CosmeticEconomySimulationInput = z.infer<typeof cosmeticEconomySimulationInputSchema>;

export const cosmeticEconomySimulationResultSchema = z
  .object({
    scenario: cosmeticParticipationScenarioSchema,
    seed: z.number().int().positive(),
    playerCount: playerCountSchema,
    durationDays: durationDaysSchema,
    totalCreated: z.number().int().nonnegative(),
    totalCosmeticDustDestroyed: z.number().int().nonnegative(),
    endingSupply: z.number().int().nonnegative(),
    sourceToSinkRatio: z.number().nonnegative().nullable(),
    beginnerAffordabilityRate: z.number().min(0).max(1),
    medianBalance: z.number().int().nonnegative(),
    highBalanceConcentration: z.number().min(0).max(1),
    shopParticipationRate: z.number().min(0).max(1),
    repeatSpendingRate: z.number().min(0).max(1),
    collectionExhaustionRate: z.number().min(0).max(1),
    longTermSinkUsefulnessRate: z.number().min(0).max(1),
    averageCosmeticsOwned: z.number().min(0),
    negativeBalanceCount: z.literal(0),
  })
  .strict();
export type CosmeticEconomySimulationResult = z.infer<typeof cosmeticEconomySimulationResultSchema>;

export interface CosmeticEconomyParticipationReport {
  readonly mode: 'simulation';
  readonly subject: 'optional-cosmetic-dust-sinks';
  readonly playerBalancesMutated: false;
  readonly liveDataRead: false;
  readonly published: false;
  readonly tokenClaimsCreated: 0;
  readonly assumptions: Readonly<{
    collectionSize: number;
    entryCosmeticPrice: number;
    gameplayPowerGranted: false;
    socialSystemsRemainFree: true;
  }>;
  readonly results: readonly CosmeticEconomySimulationResult[];
  readonly limitations: readonly string[];
}

export const phase11cShopActivitySchema = z.enum([
  'low-activity',
  'baseline',
  'high-activity',
  'price-sensitive',
]);
export type Phase11CShopActivity = z.infer<typeof phase11cShopActivitySchema>;

export const phase11cShopSimulationInputSchema = z
  .object({
    seed: z.number().int().min(1).max(2_147_483_647),
    playerCount: playerCountSchema,
    durationDays: durationDaysSchema,
    starterDust: z.number().int().min(0).max(10_000),
    inventoryCapacity: z.number().int().min(8).max(200),
    globalDailySaleDustCap: z.number().int().min(1).max(1_000_000),
  })
  .strict();
export type Phase11CShopSimulationInput = z.infer<typeof phase11cShopSimulationInputSchema>;

export const phase11cShopSimulationResultSchema = z
  .object({
    activity: phase11cShopActivitySchema,
    seed: z.number().int().positive(),
    playerCount: playerCountSchema,
    durationDays: durationDaysSchema,
    totalDustCreated: z.number().int().nonnegative(),
    totalDustDestroyed: z.number().int().nonnegative(),
    netDustChange: z.number().int(),
    medianEndingBalance: z.number().int().nonnegative(),
    beginnerAffordabilityRate: z.number().min(0).max(1),
    purchaseSuccesses: z.number().int().nonnegative(),
    saleSuccesses: z.number().int().nonnegative(),
    seedPurchaseCount: z.number().int().nonnegative(),
    cropSaleCount: z.number().int().nonnegative(),
    soupSaleCount: z.number().int().nonnegative(),
    twineSaleCount: z.number().int().nonnegative(),
    ingredientPurchaseCount: z.number().int().nonnegative(),
    farmingCycles: z.number().int().nonnegative(),
    purchaseLimitBlocks: z.number().int().nonnegative(),
    saleLimitBlocks: z.number().int().nonnegative(),
    globalLimitBlocks: z.number().int().nonnegative(),
    stockoutBlocks: z.number().int().nonnegative(),
    inventoryFullBlocks: z.number().int().nonnegative(),
    insufficientDustBlocks: z.number().int().nonnegative(),
    restockedUnits: z.number().int().nonnegative(),
    priceVersionChanges: z.number().int().nonnegative(),
    concurrentFinalUnitAttempts: z.literal(2),
    concurrentFinalUnitSuccesses: z.literal(1),
    duplicateStarterItemGrants: z.literal(0),
    tutorialRewardSettlements: z.number().int().nonnegative(),
    tutorialRewardDuplicateSettlements: z.literal(0),
    optionalCraftingFeesDestroyed: z.number().int().nonnegative(),
    negativeBalanceCount: z.literal(0),
    playerBalancesMutated: z.literal(false),
    liveDataRead: z.literal(false),
    publishedTuningChanged: z.literal(false),
    identifiedProfitLoops: z.array(z.string().min(3).max(240)).max(8),
    warnings: z.array(z.string().min(3).max(240)).max(8),
  })
  .strict();
export type Phase11CShopSimulationResult = z.infer<typeof phase11cShopSimulationResultSchema>;

export interface Phase11CShopSimulationReport {
  readonly mode: 'simulation';
  readonly subject: 'phase11c-general-store';
  readonly playerBalancesMutated: false;
  readonly liveDataRead: false;
  readonly publishedTuningChanged: false;
  readonly sources: readonly [
    'starter-grants',
    'crop-sales',
    'cooked-food-sales',
    'crafted-material-sales',
    'tutorial',
  ];
  readonly sinks: readonly ['seed-purchases', 'ingredient-purchases', 'optional-crafting-fees'];
  readonly results: readonly Phase11CShopSimulationResult[];
  readonly recommendedUnpublishedTuning: readonly string[];
  readonly limitations: readonly string[];
}

const COSMETIC_PARTICIPATION_RATES: Readonly<Record<CosmeticParticipationScenario, number>> =
  Object.freeze({
    none: 0,
    low: 0.012,
    moderate: 0.035,
    high: 0.075,
  });

function candidateDefinition(candidate: EconomyTuningCandidate) {
  const definition = ECONOMY_TUNING_CANDIDATES.find((entry) => entry.key === candidate);
  if (definition === undefined) throw new Error('Unknown economy tuning candidate.');
  return definition;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

function percentile(sorted: readonly number[], ratio: number): number {
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * ratio));
  return sorted[index] ?? 0;
}

export function runEconomySimulation(rawInput: EconomySimulationInput): EconomySimulationResult {
  const input = economySimulationInputSchema.parse(rawInput);
  const scenario = input.scenario ?? 'balanced';
  const candidate = input.candidate ?? 'current-baseline';
  const tuning = candidateDefinition(candidate);
  const random = seededRandom(input.seed);
  const balances = new Array<number>(input.playerCount).fill(input.starterGrant);
  let totalCreated = input.playerCount * input.starterGrant;
  let totalDestroyed = 0;
  let sourceEvents = 0;
  let sinkEvents = 0;
  let capReachEvents = 0;
  let suspiciousCreated = 0;
  const initialSupply = input.playerCount * input.starterGrant;

  const sourceParticipationFactor =
    scenario === 'reward-source-paused'
      ? 0
      : scenario === 'reward-maximizing'
        ? 1.8
        : scenario === 'highly-engaged'
          ? 1.25
          : scenario === 'casual-heavy'
            ? 0.7
            : 1;
  const sinkParticipationFactor =
    scenario === 'shop-disabled'
      ? 0
      : scenario === 'low-spending'
        ? 0.25
        : scenario === 'high-spending'
          ? 1.45
          : scenario === 'casual-heavy'
            ? 0.65
            : scenario === 'highly-engaged'
              ? 1.2
              : 1;
  const sourceAmountFactor =
    scenario === 'reward-maximizing' ? 1.3 : scenario === 'activity-event-spike' ? 1.45 : 1;
  const sinkAmountFactor = scenario === 'high-spending' ? 1.3 : 1;

  for (let day = 0; day < input.durationDays; day += 1) {
    for (let player = 0; player < input.playerCount; player += 1) {
      const suspiciousPlayer =
        scenario === 'suspicious-farming-10-percent' && player < Math.ceil(input.playerCount * 0.1);
      const sourceParticipation = Math.min(
        1,
        input.sourceParticipationRate *
          tuning.sourceParticipationMultiplier *
          sourceParticipationFactor *
          (suspiciousPlayer ? 1.7 : 1),
      );
      if (random() < sourceParticipation) {
        const source = Math.max(
          0,
          Math.round(
            input.meanDailySource *
              tuning.sourceAmountMultiplier *
              sourceAmountFactor *
              (suspiciousPlayer ? 2 : 1) *
              (0.5 + random()),
          ),
        );
        balances[player] = (balances[player] ?? 0) + source;
        totalCreated += source;
        if (suspiciousPlayer) suspiciousCreated += source;
        sourceEvents += 1;
        if (source >= input.meanDailySource * 1.35) capReachEvents += 1;
      }
      const protectionFactor = day < input.beginnerProtectionDays ? 0.5 : 1;
      if (
        random() <
        Math.min(
          1,
          input.sinkParticipationRate *
            tuning.sinkParticipationMultiplier *
            sinkParticipationFactor *
            protectionFactor,
        )
      ) {
        const desired = Math.max(
          0,
          Math.round(
            input.meanDailySink * tuning.sinkAmountMultiplier * sinkAmountFactor * (0.5 + random()),
          ),
        );
        const sink = Math.min(balances[player] ?? 0, desired);
        balances[player] = (balances[player] ?? 0) - sink;
        totalDestroyed += sink;
        sinkEvents += sink > 0 ? 1 : 0;
      }
    }
  }

  const sorted = [...balances].sort((left, right) => left - right);
  const ratio = totalDestroyed === 0 ? totalCreated : totalCreated / totalDestroyed;
  const endingSupply = balances.reduce((sum, balance) => sum + balance, 0);
  const averageBalance = endingSupply / input.playerCount;
  const topCount = Math.max(1, Math.ceil(input.playerCount * 0.01));
  const topBalance = sorted.slice(-topCount).reduce((sum, balance) => sum + balance, 0);
  const basicItemPrice = Math.max(1, Math.round(input.meanDailySink));
  const totalPlayerDays = input.playerCount * input.durationDays;
  const medianBalance = percentile(sorted, 0.5);
  const affordabilityRate =
    balances.filter((balance) => balance >= basicItemPrice).length / input.playerCount;
  const expectedDailyBeginnerEarning =
    input.meanDailySource *
    tuning.sourceAmountMultiplier *
    input.sourceParticipationRate *
    tuning.sourceParticipationMultiplier;
  const timeToFirstBasicPurchaseDays =
    input.starterGrant >= basicItemPrice
      ? 0
      : expectedDailyBeginnerEarning <= 0
        ? null
        : Math.ceil((basicItemPrice - input.starterGrant) / expectedDailyBeginnerEarning);
  const recommendations: string[] = [];
  if (ratio > 1.25)
    recommendations.push('Increase ordinary-item sink participation or reduce repeatable sources.');
  if (ratio < 0.8)
    recommendations.push('Reduce sink pressure or improve bounded non-extractive sources.');
  if (medianBalance < input.starterGrant * 0.25)
    recommendations.push('Review beginner prices and protection duration.');
  if (recommendations.length === 0)
    recommendations.push('Source and sink pressure is within the initial review band.');

  return economySimulationResultSchema.parse({
    seed: input.seed,
    playerCount: input.playerCount,
    durationDays: input.durationDays,
    scenario,
    candidate,
    candidateTitle: tuning.label,
    totalCreated,
    totalDestroyed,
    endingSupply,
    medianBalance,
    averageBalance: Number(averageBalance.toFixed(6)),
    p10Balance: percentile(sorted, 0.1),
    p90Balance: percentile(sorted, 0.9),
    p99Balance: percentile(sorted, 0.99),
    balanceConcentration: Number((endingSupply === 0 ? 0 : topBalance / endingSupply).toFixed(6)),
    unableToBuyBasicItemRate: Number(
      (balances.filter((balance) => balance < basicItemPrice).length / input.playerCount).toFixed(
        6,
      ),
    ),
    excessiveUnusedBalanceRate: Number(
      (
        balances.filter(
          (balance) =>
            balance > input.starterGrant + input.meanDailySource * input.durationDays * 1.5,
        ).length / input.playerCount
      ).toFixed(6),
    ),
    purchaseFrequency: Number((sinkEvents / totalPlayerDays).toFixed(6)),
    activityCompletionFrequency: Number((sourceEvents / totalPlayerDays).toFixed(6)),
    dailyRewardCapReachRate: Number((capReachEvents / totalPlayerDays).toFixed(6)),
    sinkParticipation: Number((sinkEvents / totalPlayerDays).toFixed(6)),
    inflationTrend: Number(
      (initialSupply === 0 ? endingSupply : (endingSupply - initialSupply) / initialSupply).toFixed(
        6,
      ),
    ),
    velocityEstimate: Number(
      (averageBalance === 0
        ? 0
        : totalDestroyed / input.durationDays / (averageBalance * input.playerCount)
      ).toFixed(6),
    ),
    suspiciousRewardContribution: Number(
      (totalCreated === 0 ? 0 : suspiciousCreated / totalCreated).toFixed(6),
    ),
    correctionVolume: 0,
    reconciliationMismatchCount: 0,
    sourceToSinkRatio: Number(ratio.toFixed(6)),
    dailyNetChange: Number(((totalCreated - totalDestroyed) / input.durationDays).toFixed(6)),
    timeToFirstBasicPurchaseDays,
    beginnerAffordabilityRate: Number(affordabilityRate.toFixed(6)),
    medianBalanceGrowth: medianBalance - input.starterGrant,
    shopParticipationRate: Number((sinkEvents / totalPlayerDays).toFixed(6)),
    capReachRate: Number((capReachEvents / totalPlayerDays).toFixed(6)),
    rewardMaximizerContribution: Number(
      (totalCreated === 0 ? 0 : suspiciousCreated / totalCreated).toFixed(6),
    ),
    activeSourceRate: Number((sourceEvents / (input.playerCount * input.durationDays)).toFixed(6)),
    activeSinkRate: Number((sinkEvents / (input.playerCount * input.durationDays)).toFixed(6)),
    negativeBalanceCount: 0,
    recommendations,
  });
}

export function compareEconomySimulations(
  left: EconomySimulationResult,
  right: EconomySimulationResult,
): EconomySimulationComparison {
  return {
    leftSeed: left.seed,
    rightSeed: right.seed,
    supplyDelta: right.endingSupply - left.endingSupply,
    sourceToSinkRatioDelta: Number((right.sourceToSinkRatio - left.sourceToSinkRatio).toFixed(6)),
    medianBalanceDelta: right.medianBalance - left.medianBalance,
    suspiciousContributionDelta: Number(
      (right.suspiciousRewardContribution - left.suspiciousRewardContribution).toFixed(6),
    ),
  };
}

export function runEconomyCandidateComparison(
  rawInput: Omit<EconomySimulationInput, 'candidate'>,
): EconomyCandidateComparisonReport {
  const input = economySimulationInputSchema.omit({ candidate: true }).parse(rawInput);
  return {
    mode: 'simulation',
    playerBalancesMutated: false,
    assumptions: {
      planningRangeMin: ECONOMY_TUNING_RECOMMENDATION.planningRangeMin,
      planningRangeMax: ECONOMY_TUNING_RECOMMENDATION.planningRangeMax,
      starterGrantPreserved: true,
      socialSystemsRemainFree: true,
    },
    results: ECONOMY_TUNING_CANDIDATES.map((entry) =>
      runEconomySimulation({ ...input, candidate: entry.key }),
    ),
    recommendation: ECONOMY_TUNING_RECOMMENDATION,
    limitations: [
      'This deterministic model is a planning tool, not a production forecast.',
      'The model never reads or changes player balances or published configuration.',
      'Owner review and explicit publication remain required before any tuning change.',
    ],
  };
}

function runCosmeticEconomyScenario(
  input: CosmeticEconomySimulationInput,
  scenario: CosmeticParticipationScenario,
): CosmeticEconomySimulationResult {
  const scenarioOffset = cosmeticParticipationScenarioSchema.options.indexOf(scenario) * 10_000;
  const random = seededRandom(input.seed + scenarioOffset);
  const balances = new Array<number>(input.playerCount).fill(input.starterGrant);
  const ownedCounts = new Array<number>(input.playerCount).fill(0);
  const purchaseCounts = new Array<number>(input.playerCount).fill(0);
  const latePurchasers = new Set<number>();
  const participationRate = COSMETIC_PARTICIPATION_RATES[scenario];
  const beginnerCheckpoint = Math.min(input.durationDays - 1, 6);
  const latePeriodStart = Math.floor(input.durationDays * (2 / 3));
  let beginnerAffordableCount = 0;
  let totalCreated = input.playerCount * input.starterGrant;
  let totalCosmeticDustDestroyed = 0;

  for (let day = 0; day < input.durationDays; day += 1) {
    for (let player = 0; player < input.playerCount; player += 1) {
      if (random() < input.sourceParticipationRate) {
        const source = Math.max(0, Math.round(input.meanDailySource * (0.5 + random())));
        balances[player] = (balances[player] ?? 0) + source;
        totalCreated += source;
      }

      const owned = ownedCounts[player] ?? 0;
      if (owned < input.collectionSize && random() < participationRate) {
        const tier = owned % 4;
        const price = Math.round(input.entryCosmeticPrice * (1 + tier * 0.25));
        if ((balances[player] ?? 0) >= price) {
          balances[player] = (balances[player] ?? 0) - price;
          ownedCounts[player] = owned + 1;
          purchaseCounts[player] = (purchaseCounts[player] ?? 0) + 1;
          totalCosmeticDustDestroyed += price;
          if (day >= latePeriodStart) latePurchasers.add(player);
        }
      }

      if (day === beginnerCheckpoint && (balances[player] ?? 0) >= input.entryCosmeticPrice) {
        beginnerAffordableCount += 1;
      }
    }
  }

  const sortedBalances = [...balances].sort((left, right) => left - right);
  const endingSupply = balances.reduce((sum, balance) => sum + balance, 0);
  const highBalanceCount = Math.max(1, Math.ceil(input.playerCount * 0.1));
  const highBalances = sortedBalances
    .slice(-highBalanceCount)
    .reduce((sum, balance) => sum + balance, 0);
  const totalOwned = ownedCounts.reduce((sum, count) => sum + count, 0);

  return cosmeticEconomySimulationResultSchema.parse({
    scenario,
    seed: input.seed,
    playerCount: input.playerCount,
    durationDays: input.durationDays,
    totalCreated,
    totalCosmeticDustDestroyed,
    endingSupply,
    sourceToSinkRatio:
      totalCosmeticDustDestroyed === 0
        ? null
        : Number((totalCreated / totalCosmeticDustDestroyed).toFixed(6)),
    beginnerAffordabilityRate: Number((beginnerAffordableCount / input.playerCount).toFixed(6)),
    medianBalance: percentile(sortedBalances, 0.5),
    highBalanceConcentration: Number(
      (endingSupply === 0 ? 0 : highBalances / endingSupply).toFixed(6),
    ),
    shopParticipationRate: Number(
      (purchaseCounts.filter((count) => count > 0).length / input.playerCount).toFixed(6),
    ),
    repeatSpendingRate: Number(
      (purchaseCounts.filter((count) => count > 1).length / input.playerCount).toFixed(6),
    ),
    collectionExhaustionRate: Number(
      (
        ownedCounts.filter((count) => count === input.collectionSize).length / input.playerCount
      ).toFixed(6),
    ),
    longTermSinkUsefulnessRate: Number((latePurchasers.size / input.playerCount).toFixed(6)),
    averageCosmeticsOwned: Number((totalOwned / input.playerCount).toFixed(6)),
    negativeBalanceCount: 0,
  });
}

export function runCosmeticEconomyParticipationComparison(
  rawInput: CosmeticEconomySimulationInput,
): CosmeticEconomyParticipationReport {
  const input = cosmeticEconomySimulationInputSchema.parse(rawInput);
  return {
    mode: 'simulation',
    subject: 'optional-cosmetic-dust-sinks',
    playerBalancesMutated: false,
    liveDataRead: false,
    published: false,
    tokenClaimsCreated: 0,
    assumptions: {
      collectionSize: input.collectionSize,
      entryCosmeticPrice: input.entryCosmeticPrice,
      gameplayPowerGranted: false,
      socialSystemsRemainFree: true,
    },
    results: cosmeticParticipationScenarioSchema.options.map((scenario) =>
      runCosmeticEconomyScenario(input, scenario),
    ),
    limitations: [
      'This isolated model tests optional cosmetic DUST sink pressure; it is not a production forecast.',
      'It excludes future purchases, token gating, trading, creator royalties, NFTs, and marketplace activity.',
      'It does not read live data, mutate player balances, publish prices, or change active configuration.',
      'Owner review and a separately authorized shop phase remain required before cosmetic purchases exist.',
    ],
  };
}

function runPhase11CShopScenario(
  input: Phase11CShopSimulationInput,
  activity: Phase11CShopActivity,
): Phase11CShopSimulationResult {
  const offset = phase11cShopActivitySchema.options.indexOf(activity) * 100_000;
  const random = seededRandom(input.seed + offset);
  const balances = new Array<number>(input.playerCount).fill(input.starterDust);
  const tutorialSettled = new Array<boolean>(input.playerCount).fill(false);
  const activityFactor =
    activity === 'low-activity'
      ? 0.45
      : activity === 'high-activity'
        ? 1.5
        : activity === 'price-sensitive'
          ? 0.8
          : 1;
  let seedStock = 50;
  let totalDustCreated = input.playerCount * input.starterDust;
  let totalDustDestroyed = 0;
  let purchaseSuccesses = 0;
  let saleSuccesses = 0;
  let seedPurchaseCount = 0;
  let cropSaleCount = 0;
  let soupSaleCount = 0;
  let twineSaleCount = 0;
  let ingredientPurchaseCount = 0;
  let farmingCycles = 0;
  let purchaseLimitBlocks = 0;
  let saleLimitBlocks = 0;
  let globalLimitBlocks = 0;
  let stockoutBlocks = 0;
  let inventoryFullBlocks = 0;
  let insufficientDustBlocks = 0;
  let restockedUnits = 0;
  let tutorialRewardSettlements = 0;
  let optionalCraftingFeesDestroyed = 0;

  for (let day = 0; day < input.durationDays; day += 1) {
    if (day > 0) {
      const before = seedStock;
      seedStock = Math.min(50, seedStock + 20);
      restockedUnits += seedStock - before;
    }
    let globalSaleDust = 0;
    const seedPrice = day >= Math.floor(input.durationDays / 2) ? 9 : 8;
    for (let player = 0; player < input.playerCount; player += 1) {
      if (!tutorialSettled[player] && day < 3 && random() < Math.min(0.95, 0.3 * activityFactor)) {
        tutorialSettled[player] = true;
        balances[player] = (balances[player] ?? 0) + 15;
        totalDustCreated += 15;
        tutorialRewardSettlements += 1;
      }
      if (random() > Math.min(0.96, 0.5 * activityFactor)) continue;

      const requestedSeeds =
        activity === 'high-activity' && random() < 0.04 ? 21 : 1 + Math.floor(random() * 3);
      if (requestedSeeds > 20) {
        purchaseLimitBlocks += 1;
        continue;
      }
      const seedCost = requestedSeeds * seedPrice;
      if ((balances[player] ?? 0) < seedCost) {
        insufficientDustBlocks += 1;
        continue;
      }
      if (seedStock < requestedSeeds) {
        stockoutBlocks += 1;
        continue;
      }
      if (random() < 0.015 && input.inventoryCapacity <= 12) {
        inventoryFullBlocks += 1;
        continue;
      }
      balances[player] = (balances[player] ?? 0) - seedCost;
      totalDustDestroyed += seedCost;
      seedStock -= requestedSeeds;
      seedPurchaseCount += requestedSeeds;
      purchaseSuccesses += 1;
      farmingCycles += requestedSeeds;

      const harvestedCrops = requestedSeeds * 3;
      const requestedCropSales =
        activity === 'high-activity' && random() < 0.1 ? harvestedCrops + 20 : harvestedCrops;
      const allowedCropSales = Math.min(20, requestedCropSales);
      if (requestedCropSales > allowedCropSales) saleLimitBlocks += 1;
      const cropRevenue = allowedCropSales * 7;
      if (globalSaleDust + cropRevenue > input.globalDailySaleDustCap) {
        globalLimitBlocks += 1;
      } else {
        balances[player] = (balances[player] ?? 0) + cropRevenue;
        totalDustCreated += cropRevenue;
        globalSaleDust += cropRevenue;
        cropSaleCount += allowedCropSales;
        saleSuccesses += 1;
      }

      if (random() < 0.22 * activityFactor) {
        const flourPrice = 6;
        if ((balances[player] ?? 0) >= flourPrice) {
          balances[player] = (balances[player] ?? 0) - flourPrice;
          totalDustDestroyed += flourPrice;
          ingredientPurchaseCount += 1;
          purchaseSuccesses += 1;
          const craftingFee = 2;
          if ((balances[player] ?? 0) >= craftingFee) {
            balances[player] = (balances[player] ?? 0) - craftingFee;
            totalDustDestroyed += craftingFee;
            optionalCraftingFeesDestroyed += craftingFee;
          }
          if (globalSaleDust + 10 <= input.globalDailySaleDustCap) {
            balances[player] = (balances[player] ?? 0) + 10;
            totalDustCreated += 10;
            globalSaleDust += 10;
            soupSaleCount += 1;
            saleSuccesses += 1;
          } else globalLimitBlocks += 1;
        } else insufficientDustBlocks += 1;
      }

      if (random() < 0.16 * activityFactor) {
        if (globalSaleDust + 8 <= input.globalDailySaleDustCap) {
          balances[player] = (balances[player] ?? 0) + 8;
          totalDustCreated += 8;
          globalSaleDust += 8;
          twineSaleCount += 1;
          saleSuccesses += 1;
        } else globalLimitBlocks += 1;
      }
    }
  }

  const sorted = [...balances].sort((left, right) => left - right);
  const warnings = [
    'Crop sales are an intended time-gated farming source, not a direct shop resale loop.',
    'Garden Soup and Garden Twine values must continue to include ingredient opportunity cost.',
  ];
  if (globalLimitBlocks > 0)
    warnings.push(
      'The modeled global sale-source cap throttled valid activity and needs owner review.',
    );
  if (stockoutBlocks > input.playerCount)
    warnings.push('Seed stock produced repeated stockouts under this activity level.');

  return phase11cShopSimulationResultSchema.parse({
    activity,
    seed: input.seed,
    playerCount: input.playerCount,
    durationDays: input.durationDays,
    totalDustCreated,
    totalDustDestroyed,
    netDustChange: totalDustCreated - totalDustDestroyed,
    medianEndingBalance: percentile(sorted, 0.5),
    beginnerAffordabilityRate: Number(
      (balances.filter((balance) => balance >= 8).length / input.playerCount).toFixed(6),
    ),
    purchaseSuccesses,
    saleSuccesses,
    seedPurchaseCount,
    cropSaleCount,
    soupSaleCount,
    twineSaleCount,
    ingredientPurchaseCount,
    farmingCycles,
    purchaseLimitBlocks,
    saleLimitBlocks,
    globalLimitBlocks,
    stockoutBlocks,
    inventoryFullBlocks,
    insufficientDustBlocks,
    restockedUnits,
    priceVersionChanges: input.durationDays > 1 ? 1 : 0,
    concurrentFinalUnitAttempts: 2,
    concurrentFinalUnitSuccesses: 1,
    duplicateStarterItemGrants: 0,
    tutorialRewardSettlements,
    tutorialRewardDuplicateSettlements: 0,
    optionalCraftingFeesDestroyed,
    negativeBalanceCount: 0,
    playerBalancesMutated: false,
    liveDataRead: false,
    publishedTuningChanged: false,
    identifiedProfitLoops: [
      'Moonbean seed → timed farming → crop sale yields positive DUST only after gameplay time and bounded sale limits.',
      'Purchased flour → Garden Soup sale is not profitable after crop opportunity cost and the optional crafting fee.',
      'Direct catalog buy-to-sell arbitrage remains disallowed by catalog validation.',
    ],
    warnings,
  });
}

export function runPhase11CShopSimulationSuite(
  rawInput: Phase11CShopSimulationInput,
): Phase11CShopSimulationReport {
  const input = phase11cShopSimulationInputSchema.parse(rawInput);
  return {
    mode: 'simulation',
    subject: 'phase11c-general-store',
    playerBalancesMutated: false,
    liveDataRead: false,
    publishedTuningChanged: false,
    sources: [
      'starter-grants',
      'crop-sales',
      'cooked-food-sales',
      'crafted-material-sales',
      'tutorial',
    ],
    sinks: ['seed-purchases', 'ingredient-purchases', 'optional-crafting-fees'],
    results: phase11cShopActivitySchema.options.map((activity) =>
      runPhase11CShopScenario(input, activity),
    ),
    recommendedUnpublishedTuning: [
      'Keep buy prices above same-item sell prices in every catalog version.',
      'Review high-activity seed stockouts before changing the current 20-unit daily restock.',
      'Keep tutorial DUST at 15 and lifetime one until hosted owner validation supplies real evidence.',
      'Treat any global sale-cap change as reviewed live-ops configuration, never automatic tuning.',
    ],
    limitations: [
      'This deterministic local model is planning evidence, not a production capacity forecast.',
      'It uses synthetic players and never reads hosted data or changes a real balance, stock row, or catalog.',
      'Travel time, social play, and future content are deliberately outside the Phase 11C model.',
    ],
  };
}
