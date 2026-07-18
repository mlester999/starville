import { z } from 'zod';

export const progressionSimulationInputSchema = z
  .object({
    thresholds: z.array(z.number().int().nonnegative()).min(2).max(50),
    eventsPerDay: z.number().int().min(1).max(10_000),
    xpPerEvent: z.number().int().min(1).max(10_000),
    multiplier: z.number().min(0.5).max(2).default(1),
    playerCount: z.number().int().min(1).max(1_000_000).default(1_000),
  })
  .strict();
export type ProgressionSimulationInput = z.infer<typeof progressionSimulationInputSchema>;

export const progressionSimulationResultSchema = z
  .object({
    valid: z.boolean(),
    blockingErrors: z.array(z.string()),
    warnings: z.array(z.string()),
    dailyXp: z.number().int().nonnegative(),
    levels: z.array(
      z
        .object({
          level: z.number().int().positive(),
          cumulativeXp: z.number().int().nonnegative(),
          projectedDays: z.number().nonnegative(),
        })
        .strict(),
    ),
    projectedLevelDistribution: z.record(z.string(), z.number().int().nonnegative()),
    autoMigratesPlayers: z.literal(false),
  })
  .strict();
export type ProgressionSimulationResult = z.infer<typeof progressionSimulationResultSchema>;

export function runProgressionSimulation(
  raw: ProgressionSimulationInput,
): ProgressionSimulationResult {
  const input = progressionSimulationInputSchema.parse(raw);
  const blockingErrors: string[] = [];
  if (input.thresholds[0] !== 0) blockingErrors.push('level_one_must_start_at_zero');
  if (input.thresholds.some((value, index) => index > 0 && value <= input.thresholds[index - 1]!)) {
    blockingErrors.push('thresholds_must_be_strictly_increasing');
  }
  const dailyXp = Math.floor(input.eventsPerDay * input.xpPerEvent * input.multiplier);
  const warnings: string[] = [];
  if ((input.thresholds[1] ?? 0) / dailyXp > 7) warnings.push('extreme_early_grind');
  if (input.thresholds.at(-1)! / dailyXp > 365) warnings.push('extreme_late_grind');
  const levels = input.thresholds.map((cumulativeXp, index) => ({
    level: index + 1,
    cumulativeXp,
    projectedDays: Number((cumulativeXp / dailyXp).toFixed(2)),
  }));
  const projectedLevelDistribution = Object.fromEntries(
    levels.map(({ level }, index) => [
      String(level),
      Math.max(0, Math.round(input.playerCount / 2 ** index)),
    ]),
  );
  return progressionSimulationResultSchema.parse({
    valid: blockingErrors.length === 0,
    blockingErrors,
    warnings,
    dailyXp,
    levels,
    projectedLevelDistribution,
    autoMigratesPlayers: false,
  });
}
