import { z } from 'zod';

import {
  campaignIdSchema,
  nonnegativeTokenBaseUnitsSchema,
  policyVersionSchema,
  positiveLamportsSchema,
  safeText,
  timestampSchema,
  tokenBaseUnitsSchema,
  tokenDecimalsSchema,
  tokenProgramTypeSchema,
  toBaseUnits,
  treasuryIdentifierSchema,
  walletAddressSchema,
  walletNetworkSchema,
} from './common';

export const CLAIM_ARCHITECTURE_MODELS = [
  'backend_hot_wallet',
  'multisig_backend_planned',
  'dedicated_program_authorizations',
  'epoch_merkle_distributor',
  'third_party_custodial_service',
] as const;
export const claimArchitectureModelSchema = z.enum(CLAIM_ARCHITECTURE_MODELS);
export type ClaimArchitectureModel = z.infer<typeof claimArchitectureModelSchema>;

export const FUTURE_ARCHITECTURE_RECOMMENDATION = Object.freeze({
  model: 'dedicated_program_authorizations' as const,
  treasuryControl: 'reviewed_multisig' as const,
  approved: false as const,
  statement: 'Recommendation pending owner, security, treasury, and legal review.' as const,
});

export const claimCapPolicySchema = z
  .object({
    perReceiptBaseUnits: tokenBaseUnitsSchema,
    perPlayerDailyBaseUnits: tokenBaseUnitsSchema,
    perPlayerWeeklyBaseUnits: tokenBaseUnitsSchema,
    perPlayerMonthlyBaseUnits: tokenBaseUnitsSchema,
    perWalletDailyBaseUnits: tokenBaseUnitsSchema,
    perSourceBaseUnits: tokenBaseUnitsSchema,
    perActivityBaseUnits: tokenBaseUnitsSchema,
    perCampaignBaseUnits: tokenBaseUnitsSchema,
    globalDailyBaseUnits: tokenBaseUnitsSchema,
    globalWeeklyBaseUnits: tokenBaseUnitsSchema,
    epochBaseUnits: tokenBaseUnitsSchema,
  })
  .strict();
export type ClaimCapPolicy = z.infer<typeof claimCapPolicySchema>;

export const treasuryPolicySchema = z
  .object({
    schemaVersion: z.literal(1),
    mode: z.literal('architecture_draft'),
    featureEnabled: z.literal(false),
    publicationStatus: z.enum(['architecture_draft', 'validated_mock', 'review_mock']),
    policyVersion: policyVersionSchema,
    revision: z.number().int().positive(),
    network: walletNetworkSchema,
    tokenMint: walletAddressSchema,
    tokenProgram: tokenProgramTypeSchema,
    decimals: tokenDecimalsSchema,
    treasuryIdentifier: treasuryIdentifierSchema,
    treasuryPublicAddress: walletAddressSchema.nullable(),
    claimArchitecture: claimArchitectureModelSchema,
    signerMode: z.enum(['disabled', 'mock_fixture']),
    minimumClaimBaseUnits: tokenBaseUnitsSchema,
    maximumClaimBaseUnits: tokenBaseUnitsSchema,
    caps: claimCapPolicySchema,
    minimumTokenReserveBaseUnits: nonnegativeTokenBaseUnitsSchema,
    minimumSolFeeReserveLamports: positiveLamportsSchema,
    pendingClaimReserveBaseUnits: nonnegativeTokenBaseUnitsSchema,
    safetyBufferBaseUnits: nonnegativeTokenBaseUnitsSchema,
    authorizationLifetimeSeconds: z.number().int().min(60).max(86_400),
    confirmationPolicy: z.literal('architecture_only'),
    retryLimit: z.number().int().min(0).max(5),
    maintenanceBehavior: z.enum(['pause_new_intents', 'pause_mock_authorizations']),
    emergencyPaused: z.literal(true),
    complianceReviewThresholdBaseUnits: tokenBaseUnitsSchema,
    highRiskReviewThresholdBaseUnits: tokenBaseUnitsSchema,
    effectiveAt: timestampSchema.nullable(),
    immutablePublishedVersionDesign: z.literal(true),
    published: z.literal(false),
    campaignId: campaignIdSchema,
    staffSummary: safeText(12, 500),
  })
  .strict()
  .superRefine((policy, context) => {
    const minimum = toBaseUnits(policy.minimumClaimBaseUnits);
    const maximum = toBaseUnits(policy.maximumClaimBaseUnits);
    if (minimum > maximum) {
      context.addIssue({
        code: 'custom',
        path: ['minimumClaimBaseUnits'],
        message: 'Minimum claim cannot exceed maximum claim.',
      });
    }
    const requiredCapMinimums: readonly [keyof ClaimCapPolicy, bigint][] = [
      ['perReceiptBaseUnits', maximum],
      ['perPlayerDailyBaseUnits', maximum],
      ['perPlayerWeeklyBaseUnits', maximum],
      ['perPlayerMonthlyBaseUnits', maximum],
      ['perWalletDailyBaseUnits', maximum],
      ['perSourceBaseUnits', maximum],
      ['perActivityBaseUnits', maximum],
      ['perCampaignBaseUnits', maximum],
      ['globalDailyBaseUnits', maximum],
      ['globalWeeklyBaseUnits', maximum],
      ['epochBaseUnits', maximum],
    ];
    for (const [key, required] of requiredCapMinimums) {
      if (toBaseUnits(policy.caps[key]) < required) {
        context.addIssue({
          code: 'custom',
          path: ['caps', key],
          message: 'Every layered cap must permit at least one maximum-size claim.',
        });
      }
    }
    if (toBaseUnits(policy.complianceReviewThresholdBaseUnits) > maximum) {
      context.addIssue({
        code: 'custom',
        path: ['complianceReviewThresholdBaseUnits'],
        message: 'Compliance threshold cannot exceed the per-claim maximum.',
      });
    }
    if (toBaseUnits(policy.highRiskReviewThresholdBaseUnits) > maximum) {
      context.addIssue({
        code: 'custom',
        path: ['highRiskReviewThresholdBaseUnits'],
        message: 'High-risk threshold cannot exceed the per-claim maximum.',
      });
    }
  });
export type TreasuryPolicy = z.infer<typeof treasuryPolicySchema>;

export const claimAmountModelSchema = z.enum([
  'fixed_per_approved_receipt',
  'fixed_per_campaign_tier',
  'bounded_proportional_allocation',
  'epoch_allocation_share',
  'reviewed_manual_allocation',
]);
export type ClaimAmountModel = z.infer<typeof claimAmountModelSchema>;

export const CLAIM_AMOUNT_MODEL_REGISTRY: Readonly<
  Record<
    ClaimAmountModel,
    { readonly label: string; readonly active: false; readonly bounded: true }
  >
> = Object.freeze({
  fixed_per_approved_receipt: Object.freeze({
    label: 'Fixed amount per approved receipt',
    active: false,
    bounded: true,
  }),
  fixed_per_campaign_tier: Object.freeze({
    label: 'Fixed amount per campaign tier',
    active: false,
    bounded: true,
  }),
  bounded_proportional_allocation: Object.freeze({
    label: 'Bounded proportional allocation',
    active: false,
    bounded: true,
  }),
  epoch_allocation_share: Object.freeze({
    label: 'Epoch allocation share',
    active: false,
    bounded: true,
  }),
  reviewed_manual_allocation: Object.freeze({
    label: 'Reviewed manual allocation',
    active: false,
    bounded: true,
  }),
});

export const claimAmountModelDraftSchema = z
  .object({
    model: claimAmountModelSchema,
    active: z.literal(false),
    minimumBaseUnits: tokenBaseUnitsSchema,
    maximumBaseUnits: tokenBaseUnitsSchema,
    campaignTierKey: z
      .string()
      .min(3)
      .max(40)
      .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u)
      .nullable(),
    reviewedByOwner: z.literal(false),
  })
  .strict()
  .refine((value) => toBaseUnits(value.minimumBaseUnits) <= toBaseUnits(value.maximumBaseUnits), {
    path: ['minimumBaseUnits'],
    message: 'Amount-model minimum cannot exceed maximum.',
  });
