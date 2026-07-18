import { z } from 'zod';

import {
  auditCorrelationSchema,
  publicClaimIdSchema,
  publicEligibilityIdSchema,
  publicQuarantineIdSchema,
  safePlayerIdSchema,
  safeText,
  timestampSchema,
} from './common';

export const CLAIM_QUARANTINE_TRIGGERS = [
  'duplicate_source_receipt',
  'ledger_mismatch',
  'suspended_player',
  'wallet_verification_conflict',
  'claim_above_review_threshold',
  'source_receipt_invalidated',
  'policy_mismatch',
  'wrong_mint',
  'wrong_network',
  'abnormal_velocity',
  'suspected_multi_account_farming',
  'treasury_reserve_conflict',
] as const;
export const claimQuarantineTriggerSchema = z.enum(CLAIM_QUARANTINE_TRIGGERS);
export type ClaimQuarantineTrigger = z.infer<typeof claimQuarantineTriggerSchema>;

export const claimQuarantineStatusSchema = z.enum([
  'open_mock',
  'reviewing_mock',
  'released_mock',
  'confirmed_mock',
  'expired_mock',
]);
export type ClaimQuarantineStatus = z.infer<typeof claimQuarantineStatusSchema>;

export const CLAIM_QUARANTINE_TRANSITIONS: Readonly<
  Record<ClaimQuarantineStatus, readonly ClaimQuarantineStatus[]>
> = Object.freeze({
  open_mock: Object.freeze(['reviewing_mock', 'released_mock', 'expired_mock'] as const),
  reviewing_mock: Object.freeze(['released_mock', 'confirmed_mock', 'expired_mock'] as const),
  released_mock: Object.freeze([] as const),
  confirmed_mock: Object.freeze([] as const),
  expired_mock: Object.freeze([] as const),
});

export const claimQuarantineSchema = z
  .object({
    publicQuarantineId: publicQuarantineIdSchema,
    publicClaimId: publicClaimIdSchema,
    publicEligibilityId: publicEligibilityIdSchema,
    safePlayerId: safePlayerIdSchema,
    trigger: claimQuarantineTriggerSchema,
    status: claimQuarantineStatusSchema,
    safeSummary: safeText(12, 300),
    evidenceReferences: z
      .array(
        z
          .string()
          .min(3)
          .max(100)
          .regex(/^[A-Za-z0-9:_-]+$/u),
      )
      .max(20),
    auditCorrelation: auditCorrelationSchema,
    reviewExpiresAt: timestampSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    revision: z.number().int().positive(),
    staffOnly: z.literal(true),
    heuristicAlonePermanentlyDenies: z.literal(false),
    mode: z.literal('architecture_mock'),
  })
  .strict()
  .refine((value) => Date.parse(value.reviewExpiresAt) > Date.parse(value.createdAt), {
    path: ['reviewExpiresAt'],
    message: 'Quarantine review must be time-bounded.',
  });
export type ClaimQuarantine = z.infer<typeof claimQuarantineSchema>;

export function transitionClaimQuarantine(
  rawQuarantine: ClaimQuarantine,
  input: {
    readonly expectedRevision: number;
    readonly nextStatus: ClaimQuarantineStatus;
    readonly at: string;
  },
): ClaimQuarantine {
  const quarantine = claimQuarantineSchema.parse(rawQuarantine);
  if (quarantine.revision !== input.expectedRevision) {
    throw new Error('QUARANTINE_REVISION_CONFLICT');
  }
  if (!CLAIM_QUARANTINE_TRANSITIONS[quarantine.status].includes(input.nextStatus)) {
    throw new Error('QUARANTINE_TRANSITION_FORBIDDEN');
  }
  return claimQuarantineSchema.parse({
    ...quarantine,
    status: input.nextStatus,
    revision: quarantine.revision + 1,
    updatedAt: timestampSchema.parse(input.at),
  });
}
