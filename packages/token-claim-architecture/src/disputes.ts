import { z } from 'zod';

import {
  auditCorrelationSchema,
  publicClaimIdSchema,
  publicDisputeIdSchema,
  safePlayerIdSchema,
  safeText,
  timestampSchema,
} from './common';

export const CLAIM_DISPUTE_STATES = [
  'opened',
  'acknowledged',
  'investigating',
  'resolved_eligible',
  'resolved_ineligible',
  'closed',
] as const;
export const claimDisputeStateSchema = z.enum(CLAIM_DISPUTE_STATES);
export type ClaimDisputeState = z.infer<typeof claimDisputeStateSchema>;

export const CLAIM_DISPUTE_TRANSITIONS: Readonly<
  Record<ClaimDisputeState, readonly ClaimDisputeState[]>
> = Object.freeze({
  opened: Object.freeze(['acknowledged'] as const),
  acknowledged: Object.freeze(['investigating'] as const),
  investigating: Object.freeze(['resolved_eligible', 'resolved_ineligible'] as const),
  resolved_eligible: Object.freeze(['closed'] as const),
  resolved_ineligible: Object.freeze(['closed'] as const),
  closed: Object.freeze([] as const),
});

export const claimDisputeReasonSchema = z.enum([
  'eligibility_not_found',
  'eligibility_rejected',
  'wallet_binding_question',
  'amount_question',
  'expiry_question',
  'quarantine_question',
  'other_bounded',
]);

const claimDisputeBaseSchema = z
  .object({
    publicDisputeId: publicDisputeIdSchema,
    publicClaimId: publicClaimIdSchema,
    safePlayerId: safePlayerIdSchema,
    reasonCategory: claimDisputeReasonSchema,
    state: claimDisputeStateSchema,
    playerVisibleSummary: safeText(12, 500),
    privateStaffNotes: safeText(12, 2_000),
    evidenceReferences: z
      .array(
        z
          .string()
          .min(3)
          .max(100)
          .regex(/^[A-Za-z0-9:_-]+$/u),
      )
      .max(30),
    resolution: z.enum(['pending', 'eligible_mock', 'ineligible_mock']).nullable(),
    createdAt: timestampSchema,
    acknowledgedAt: timestampSchema.nullable(),
    resolvedAt: timestampSchema.nullable(),
    closedAt: timestampSchema.nullable(),
    updatedAt: timestampSchema,
    auditCorrelation: auditCorrelationSchema,
    revision: z.number().int().positive(),
    mode: z.literal('architecture_mock'),
  })
  .strict();

function validateDisputeResolution(
  value: z.infer<typeof claimDisputeBaseSchema>,
  context: z.RefinementCtx,
): void {
  const retainsResolution =
    value.state === 'resolved_eligible' ||
    value.state === 'resolved_ineligible' ||
    value.state === 'closed';
  if (retainsResolution !== (value.resolvedAt !== null && value.resolution !== null)) {
    context.addIssue({
      code: 'custom',
      path: ['resolution'],
      message: 'Resolved dispute states require a bounded resolution and timestamp.',
    });
  }
  if (value.state === 'closed' && (value.closedAt === null || value.resolution === null)) {
    context.addIssue({
      code: 'custom',
      path: ['closedAt'],
      message: 'Closed disputes retain their resolution and close timestamp.',
    });
  }
}

export const claimDisputeSchema = claimDisputeBaseSchema.superRefine(validateDisputeResolution);
export type ClaimDispute = z.infer<typeof claimDisputeSchema>;

export const publicClaimDisputeSchema = claimDisputeBaseSchema
  .omit({ privateStaffNotes: true })
  .strict();
export type PublicClaimDispute = z.infer<typeof publicClaimDisputeSchema>;

export function toPublicClaimDispute(rawDispute: ClaimDispute): PublicClaimDispute {
  const dispute = claimDisputeSchema.parse(rawDispute);
  return publicClaimDisputeSchema.parse({
    publicDisputeId: dispute.publicDisputeId,
    publicClaimId: dispute.publicClaimId,
    safePlayerId: dispute.safePlayerId,
    reasonCategory: dispute.reasonCategory,
    state: dispute.state,
    playerVisibleSummary: dispute.playerVisibleSummary,
    evidenceReferences: dispute.evidenceReferences,
    resolution: dispute.resolution,
    createdAt: dispute.createdAt,
    acknowledgedAt: dispute.acknowledgedAt,
    resolvedAt: dispute.resolvedAt,
    closedAt: dispute.closedAt,
    updatedAt: dispute.updatedAt,
    auditCorrelation: dispute.auditCorrelation,
    revision: dispute.revision,
    mode: dispute.mode,
  });
}

export function transitionClaimDispute(
  rawDispute: ClaimDispute,
  input: {
    readonly expectedRevision: number;
    readonly nextState: ClaimDisputeState;
    readonly at: string;
    readonly resolution?: 'eligible_mock' | 'ineligible_mock';
  },
): ClaimDispute {
  const dispute = claimDisputeSchema.parse(rawDispute);
  if (dispute.revision !== input.expectedRevision) throw new Error('DISPUTE_REVISION_CONFLICT');
  if (!CLAIM_DISPUTE_TRANSITIONS[dispute.state].includes(input.nextState)) {
    throw new Error('DISPUTE_TRANSITION_FORBIDDEN');
  }
  const at = timestampSchema.parse(input.at);
  const resolution =
    input.nextState === 'resolved_eligible'
      ? 'eligible_mock'
      : input.nextState === 'resolved_ineligible'
        ? 'ineligible_mock'
        : dispute.resolution;
  if (input.resolution !== undefined && input.resolution !== resolution) {
    throw new Error('DISPUTE_RESOLUTION_MISMATCH');
  }
  return claimDisputeSchema.parse({
    ...dispute,
    state: input.nextState,
    resolution,
    acknowledgedAt: input.nextState === 'acknowledged' ? at : dispute.acknowledgedAt,
    resolvedAt:
      input.nextState === 'resolved_eligible' || input.nextState === 'resolved_ineligible'
        ? at
        : dispute.resolvedAt,
    closedAt: input.nextState === 'closed' ? at : dispute.closedAt,
    updatedAt: at,
    revision: dispute.revision + 1,
  });
}
