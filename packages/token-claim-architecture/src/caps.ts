import { z } from 'zod';

import { nonnegativeTokenBaseUnitsSchema, tokenBaseUnitsSchema, toBaseUnits } from './common';
import { treasuryPolicySchema, type TreasuryPolicy } from './policy';

export const claimCapUsageSchema = z
  .object({
    requestedAmountBaseUnits: tokenBaseUnitsSchema,
    receiptUsedBaseUnits: nonnegativeTokenBaseUnitsSchema,
    playerDailyUsedBaseUnits: nonnegativeTokenBaseUnitsSchema,
    playerWeeklyUsedBaseUnits: nonnegativeTokenBaseUnitsSchema,
    playerMonthlyUsedBaseUnits: nonnegativeTokenBaseUnitsSchema,
    walletDailyUsedBaseUnits: nonnegativeTokenBaseUnitsSchema,
    sourceUsedBaseUnits: nonnegativeTokenBaseUnitsSchema,
    activityUsedBaseUnits: nonnegativeTokenBaseUnitsSchema,
    campaignUsedBaseUnits: nonnegativeTokenBaseUnitsSchema,
    epochUsedBaseUnits: nonnegativeTokenBaseUnitsSchema,
    globalDailyUsedBaseUnits: nonnegativeTokenBaseUnitsSchema,
    globalWeeklyUsedBaseUnits: nonnegativeTokenBaseUnitsSchema,
    treasuryAvailableBaseUnits: nonnegativeTokenBaseUnitsSchema,
    activityCapApplicable: z.boolean(),
    epochCapApplicable: z.boolean(),
  })
  .strict();
export type ClaimCapUsage = z.infer<typeof claimCapUsageSchema>;

export const CLAIM_CAP_REJECTION_CODES = [
  'below_claim_minimum',
  'per_claim_cap',
  'per_receipt_cap',
  'player_daily_cap',
  'player_weekly_cap',
  'player_monthly_cap',
  'wallet_daily_cap',
  'source_cap',
  'activity_cap',
  'campaign_cap',
  'epoch_cap',
  'global_daily_cap',
  'global_weekly_cap',
  'treasury_available_cap',
] as const;
export const claimCapRejectionCodeSchema = z.enum(CLAIM_CAP_REJECTION_CODES);
export type ClaimCapRejectionCode = z.infer<typeof claimCapRejectionCodeSchema>;

export const claimCapEvaluationSchema = z
  .object({
    allowed: z.boolean(),
    rejectionCodes: z.array(claimCapRejectionCodeSchema),
    requestedAmountBaseUnits: tokenBaseUnitsSchema,
    evaluatedLayers: z.array(
      z.enum([
        'claim',
        'receipt',
        'player_daily',
        'player_weekly',
        'player_monthly',
        'wallet_daily',
        'source',
        'activity',
        'campaign',
        'epoch',
        'global_daily',
        'global_weekly',
        'treasury',
      ]),
    ),
    serverAuthoritativeFutureBoundary: z.literal(true),
    mode: z.literal('architecture_mock'),
  })
  .strict();
export type ClaimCapEvaluation = z.infer<typeof claimCapEvaluationSchema>;

function exceeds(current: string, requested: bigint, limit: string): boolean {
  return toBaseUnits(current) + requested > toBaseUnits(limit);
}

export function evaluateClaimCaps(
  rawPolicy: TreasuryPolicy,
  rawUsage: ClaimCapUsage,
): ClaimCapEvaluation {
  const policy = treasuryPolicySchema.parse(rawPolicy);
  const usage = claimCapUsageSchema.parse(rawUsage);
  const amount = toBaseUnits(usage.requestedAmountBaseUnits);
  const rejectionCodes: ClaimCapRejectionCode[] = [];
  const evaluatedLayers: ClaimCapEvaluation['evaluatedLayers'][number][] = [
    'claim',
    'receipt',
    'player_daily',
    'player_weekly',
    'player_monthly',
    'wallet_daily',
    'source',
  ];

  if (amount < toBaseUnits(policy.minimumClaimBaseUnits)) {
    rejectionCodes.push('below_claim_minimum');
  }
  if (amount > toBaseUnits(policy.maximumClaimBaseUnits)) rejectionCodes.push('per_claim_cap');
  if (exceeds(usage.receiptUsedBaseUnits, amount, policy.caps.perReceiptBaseUnits)) {
    rejectionCodes.push('per_receipt_cap');
  }
  if (exceeds(usage.playerDailyUsedBaseUnits, amount, policy.caps.perPlayerDailyBaseUnits)) {
    rejectionCodes.push('player_daily_cap');
  }
  if (exceeds(usage.playerWeeklyUsedBaseUnits, amount, policy.caps.perPlayerWeeklyBaseUnits)) {
    rejectionCodes.push('player_weekly_cap');
  }
  if (exceeds(usage.playerMonthlyUsedBaseUnits, amount, policy.caps.perPlayerMonthlyBaseUnits)) {
    rejectionCodes.push('player_monthly_cap');
  }
  if (exceeds(usage.walletDailyUsedBaseUnits, amount, policy.caps.perWalletDailyBaseUnits)) {
    rejectionCodes.push('wallet_daily_cap');
  }
  if (exceeds(usage.sourceUsedBaseUnits, amount, policy.caps.perSourceBaseUnits)) {
    rejectionCodes.push('source_cap');
  }
  if (usage.activityCapApplicable) {
    evaluatedLayers.push('activity');
    if (exceeds(usage.activityUsedBaseUnits, amount, policy.caps.perActivityBaseUnits)) {
      rejectionCodes.push('activity_cap');
    }
  }
  evaluatedLayers.push('campaign');
  if (exceeds(usage.campaignUsedBaseUnits, amount, policy.caps.perCampaignBaseUnits)) {
    rejectionCodes.push('campaign_cap');
  }
  if (usage.epochCapApplicable) {
    evaluatedLayers.push('epoch');
    if (exceeds(usage.epochUsedBaseUnits, amount, policy.caps.epochBaseUnits)) {
      rejectionCodes.push('epoch_cap');
    }
  }
  evaluatedLayers.push('global_daily');
  if (exceeds(usage.globalDailyUsedBaseUnits, amount, policy.caps.globalDailyBaseUnits)) {
    rejectionCodes.push('global_daily_cap');
  }
  evaluatedLayers.push('global_weekly');
  if (exceeds(usage.globalWeeklyUsedBaseUnits, amount, policy.caps.globalWeeklyBaseUnits)) {
    rejectionCodes.push('global_weekly_cap');
  }
  evaluatedLayers.push('treasury');
  if (amount > toBaseUnits(usage.treasuryAvailableBaseUnits)) {
    rejectionCodes.push('treasury_available_cap');
  }

  return claimCapEvaluationSchema.parse({
    allowed: rejectionCodes.length === 0,
    rejectionCodes,
    requestedAmountBaseUnits: usage.requestedAmountBaseUnits,
    evaluatedLayers,
    serverAuthoritativeFutureBoundary: true,
    mode: 'architecture_mock',
  });
}
