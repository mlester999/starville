import { z } from 'zod';

import {
  auditCorrelationSchema,
  campaignIdSchema,
  deterministicFixtureDigest,
  idempotencyKeySchema,
  policyVersionSchema,
  publicEligibilityIdSchema,
  publicEpochIdSchema,
  safePlayerIdSchema,
  safeText,
  sourceReceiptDigestSchema,
  sourceReceiptIdSchema,
  timestampSchema,
  tokenBaseUnitsSchema,
  tokenDecimalsSchema,
  tokenProgramTypeSchema,
  walletAddressSchema,
  walletNetworkSchema,
} from './common';

export const CLAIM_ELIGIBILITY_SOURCE_CATEGORIES = [
  'cooperative_activity_completion',
  'approved_economy_reward',
  'approved_seasonal_event',
  'approved_administrative_reward',
] as const;
export const claimEligibilitySourceCategorySchema = z.enum(CLAIM_ELIGIBILITY_SOURCE_CATEGORIES);
export type ClaimEligibilitySourceCategory = z.infer<typeof claimEligibilitySourceCategorySchema>;

export const CLAIM_REWARD_CATEGORIES = [
  'cooperative_contribution',
  'seasonal_participation',
  'community_restoration',
  'reviewed_administrative_reward',
] as const;
export const claimRewardCategorySchema = z.enum(CLAIM_REWARD_CATEGORIES);

export const claimEligibilityStatusSchema = z.enum([
  'pending_mock',
  'approved_mock',
  'review_required_mock',
  'disqualified_mock',
  'expired_mock',
  'cancelled_mock',
]);
export type ClaimEligibilityStatus = z.infer<typeof claimEligibilityStatusSchema>;

export const eligibilityDisqualificationStateSchema = z.enum([
  'none',
  'review_required_mock',
  'disqualified_mock',
]);
export const eligibilityDisqualificationReasonSchema = z.enum([
  'duplicate_source_receipt',
  'source_receipt_invalidated',
  'player_suspended',
  'wallet_verification_conflict',
  'policy_mismatch',
  'campaign_closed',
  'compliance_review_required',
  'risk_review_required',
]);

export const claimEligibilityCoreSchema = z
  .object({
    safePlayerId: safePlayerIdSchema,
    verifiedRecipientWallet: walletAddressSchema,
    sourceReceiptId: sourceReceiptIdSchema,
    sourceReceiptDigest: sourceReceiptDigestSchema,
    sourceCategory: claimEligibilitySourceCategorySchema,
    sourceKey: z
      .string()
      .min(3)
      .max(80)
      .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u),
    activityKey: z
      .string()
      .min(3)
      .max(80)
      .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u)
      .nullable(),
    rewardCategory: claimRewardCategorySchema,
    tokenMint: walletAddressSchema,
    tokenProgram: tokenProgramTypeSchema,
    network: walletNetworkSchema,
    amountBaseUnits: tokenBaseUnitsSchema,
    decimals: tokenDecimalsSchema,
    policyVersion: policyVersionSchema,
    campaignId: campaignIdSchema,
    epochId: publicEpochIdSchema.nullable(),
    earliestClaimAt: timestampSchema,
    expiresAt: timestampSchema,
    reasonCategory: z.enum([
      'cooperative_completion',
      'economy_reward',
      'seasonal_reward',
      'administrative_reviewed_reward',
    ]),
    safeReasonSummary: safeText(3, 240),
    idempotencyKey: idempotencyKeySchema,
    auditCorrelation: auditCorrelationSchema,
    createdAt: timestampSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const created = Date.parse(value.createdAt);
    const earliest = Date.parse(value.earliestClaimAt);
    const expiry = Date.parse(value.expiresAt);
    if (earliest < created) {
      context.addIssue({
        code: 'custom',
        path: ['earliestClaimAt'],
        message: 'Earliest claim time cannot precede eligibility creation.',
      });
    }
    if (expiry <= earliest) {
      context.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: 'Eligibility expiry must follow the earliest claim time.',
      });
    }
    if (value.sourceCategory === 'cooperative_activity_completion' && value.activityKey === null) {
      context.addIssue({
        code: 'custom',
        path: ['activityKey'],
        message: 'Cooperative activity eligibility requires a closed activity key.',
      });
    }
  });
export type ClaimEligibilityCore = z.infer<typeof claimEligibilityCoreSchema>;

export const claimEligibilitySchema = z
  .object({
    publicEligibilityId: publicEligibilityIdSchema,
    revision: z.number().int().positive(),
    status: claimEligibilityStatusSchema,
    disqualificationState: eligibilityDisqualificationStateSchema,
    disqualificationReason: eligibilityDisqualificationReasonSchema.nullable(),
    statusUpdatedAt: timestampSchema,
    immutableAfterApproval: z.literal(true),
    mode: z.literal('architecture_mock'),
  })
  .extend(claimEligibilityCoreSchema.shape)
  .strict()
  .superRefine((value, context) => {
    const hasReason = value.disqualificationReason !== null;
    if ((value.disqualificationState === 'none') === hasReason) {
      context.addIssue({
        code: 'custom',
        path: ['disqualificationReason'],
        message: 'Disqualification state and reason must remain consistent.',
      });
    }
  });
export type ClaimEligibility = z.infer<typeof claimEligibilitySchema>;

export function createMockEligibilityId(core: ClaimEligibilityCore): string {
  const input = claimEligibilityCoreSchema.parse(core);
  return publicEligibilityIdSchema.parse(
    `ELIG-MOCK-${deterministicFixtureDigest('starville.mock.eligibility.v1', [
      input.sourceCategory,
      input.sourceReceiptId,
      input.sourceReceiptDigest,
      input.safePlayerId,
    ])}`,
  );
}

export function createMockEligibility(core: ClaimEligibilityCore): ClaimEligibility {
  const input = claimEligibilityCoreSchema.parse(core);
  return claimEligibilitySchema.parse({
    ...input,
    publicEligibilityId: createMockEligibilityId(input),
    revision: 1,
    status: 'approved_mock',
    disqualificationState: 'none',
    disqualificationReason: null,
    statusUpdatedAt: input.createdAt,
    immutableAfterApproval: true,
    mode: 'architecture_mock',
  });
}
