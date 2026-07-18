import { z } from 'zod';

export const housingSimulationInputSchema = z
  .object({
    tierOneFurnitureCapacity: z.number().int().min(1).max(200).default(8),
    tierTwoFurnitureCapacity: z.number().int().min(1).max(200).default(12),
    tierOneStorageCapacity: z.number().int().min(1).max(500).default(16),
    tierTwoStorageCapacity: z.number().int().min(1).max(500).default(24),
    upgradeDustCost: z.number().int().min(1).max(1_000_000).default(250),
    playerDustBalance: z.number().int().min(0).max(9_000_000_000_000_000).default(500),
    placementCount: z.number().int().min(0).max(200).default(8),
    storageSlotsUsed: z.number().int().min(0).max(500).default(15),
    layoutPayloadBytes: z.number().int().min(2).max(1_048_576).default(8_192),
    replayCount: z.number().int().min(1).max(1_000).default(2),
    gameTest: z.boolean().default(false),
  })
  .strict();
export type HousingSimulationInput = z.infer<typeof housingSimulationInputSchema>;

export const housingSimulationResultSchema = z
  .object({
    valid: z.boolean(),
    blockingErrors: z.array(z.string()),
    warnings: z.array(z.string()),
    tierOne: z
      .object({ furnitureRemaining: z.number().int(), storageRemaining: z.number().int() })
      .strict(),
    tierTwo: z
      .object({ furnitureRemaining: z.number().int(), storageRemaining: z.number().int() })
      .strict(),
    upgradeAffordable: z.boolean(),
    dustAfterUpgrade: z.number().int().nonnegative(),
    itemSettlementCount: z.literal(1),
    replaySettlementCount: z.literal(0),
    estimatedSaveMilliseconds: z.number().nonnegative(),
    persistentWrites: z.number().int().nonnegative(),
    abuseRisks: z.array(z.string()),
    recommendations: z.array(z.string()),
    autoActivatesTuning: z.literal(false),
  })
  .strict();
export type HousingSimulationResult = z.infer<typeof housingSimulationResultSchema>;

export function runHousingSimulation(raw: HousingSimulationInput): HousingSimulationResult {
  const input = housingSimulationInputSchema.parse(raw);
  const blockingErrors: string[] = [];
  const warnings: string[] = [];
  if (input.tierTwoFurnitureCapacity <= input.tierOneFurnitureCapacity)
    blockingErrors.push('tier_two_furniture_capacity_must_increase');
  if (input.tierTwoStorageCapacity <= input.tierOneStorageCapacity)
    blockingErrors.push('tier_two_storage_capacity_must_increase');
  if (input.placementCount > input.tierOneFurnitureCapacity)
    warnings.push('tier_one_furniture_capacity_reached');
  if (input.storageSlotsUsed >= input.tierOneStorageCapacity)
    warnings.push('tier_one_storage_near_or_at_capacity');
  if (input.layoutPayloadBytes > 256_000) warnings.push('layout_payload_near_server_limit');
  const upgradeAffordable = input.playerDustBalance >= input.upgradeDustCost;
  if (!upgradeAffordable) warnings.push('upgrade_not_affordable');
  const abuseRisks = [
    ...(input.replayCount > 1 ? ['replay_requires_exactly_once_receipt'] : []),
    ...(input.placementCount > 100 ? ['large_layout_requires_strict_payload_and_cpu_bounds'] : []),
    ...(input.storageSlotsUsed > 100 ? ['storage_projection_requires_bounded_pagination'] : []),
  ];
  const recommendations = [
    'Keep Tier 1 at eight furniture weight and sixteen storage slots until owner playtesting.',
    'Keep Tier 2 unpublished at twelve furniture weight, twenty-four storage slots, and 250 DUST.',
    'Retain strict expected revisions and whole-layout atomic settlement.',
  ];
  return housingSimulationResultSchema.parse({
    valid: blockingErrors.length === 0,
    blockingErrors,
    warnings,
    tierOne: {
      furnitureRemaining: input.tierOneFurnitureCapacity - input.placementCount,
      storageRemaining: input.tierOneStorageCapacity - input.storageSlotsUsed,
    },
    tierTwo: {
      furnitureRemaining: input.tierTwoFurnitureCapacity - input.placementCount,
      storageRemaining: input.tierTwoStorageCapacity - input.storageSlotsUsed,
    },
    upgradeAffordable,
    dustAfterUpgrade: upgradeAffordable
      ? input.playerDustBalance - input.upgradeDustCost
      : input.playerDustBalance,
    itemSettlementCount: 1,
    replaySettlementCount: 0,
    estimatedSaveMilliseconds: Number(
      (2 + input.placementCount * 0.35 + input.layoutPayloadBytes / 32_768).toFixed(2),
    ),
    persistentWrites: input.gameTest ? 0 : 1,
    abuseRisks,
    recommendations,
    autoActivatesTuning: false,
  });
}
