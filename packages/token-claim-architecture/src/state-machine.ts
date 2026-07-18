import { z } from 'zod';

import {
  deterministicFixtureDigest,
  policyVersionSchema,
  publicClaimIdSchema,
  publicEligibilityIdSchema,
  publicEpochIdSchema,
  safePlayerIdSchema,
  timestampSchema,
  tokenBaseUnitsSchema,
  tokenDecimalsSchema,
  tokenProgramTypeSchema,
  walletAddressSchema,
  walletNetworkSchema,
} from './common';
import { mockAuthorizationSnapshotSchema } from './authorization';

export const PHASE_9B_A_CLAIM_STATES = [
  'draft',
  'ineligible',
  'eligible_mock',
  'review_required_mock',
  'quarantined_mock',
  'authorized_mock',
  'expired_mock',
  'cancelled_mock',
] as const;
export const phase9BAClaimStateSchema = z.enum(PHASE_9B_A_CLAIM_STATES);
export type Phase9BAClaimState = z.infer<typeof phase9BAClaimStateSchema>;

export const CLAIM_STATE_TRANSITIONS: Readonly<
  Record<Phase9BAClaimState, readonly Phase9BAClaimState[]>
> = Object.freeze({
  draft: Object.freeze([
    'ineligible',
    'eligible_mock',
    'review_required_mock',
    'quarantined_mock',
    'expired_mock',
    'cancelled_mock',
  ] as const),
  ineligible: Object.freeze([] as const),
  eligible_mock: Object.freeze([
    'review_required_mock',
    'quarantined_mock',
    'authorized_mock',
    'expired_mock',
    'cancelled_mock',
  ] as const),
  review_required_mock: Object.freeze([
    'ineligible',
    'eligible_mock',
    'quarantined_mock',
    'expired_mock',
    'cancelled_mock',
  ] as const),
  quarantined_mock: Object.freeze([
    'ineligible',
    'eligible_mock',
    'expired_mock',
    'cancelled_mock',
  ] as const),
  authorized_mock: Object.freeze(['quarantined_mock', 'expired_mock', 'cancelled_mock'] as const),
  expired_mock: Object.freeze([] as const),
  cancelled_mock: Object.freeze([] as const),
});

export const claimStateReasonSchema = z.enum([
  'eligibility_approved_mock',
  'eligibility_rejected',
  'review_threshold_mock',
  'quarantine_trigger_mock',
  'mock_authorization_created',
  'eligibility_expired',
  'authorization_expired',
  'wallet_changed',
  'player_suspended',
  'policy_mismatch',
  'cancelled_by_review',
  'dispute_review',
]);

export const claimIntentSchema = z
  .object({
    publicClaimId: publicClaimIdSchema,
    publicEligibilityId: publicEligibilityIdSchema,
    safePlayerId: safePlayerIdSchema,
    recipientWallet: walletAddressSchema,
    tokenMint: walletAddressSchema,
    tokenProgram: tokenProgramTypeSchema,
    network: walletNetworkSchema,
    amountBaseUnits: tokenBaseUnitsSchema,
    decimals: tokenDecimalsSchema,
    policyVersion: policyVersionSchema,
    epochId: publicEpochIdSchema.nullable(),
    revision: z.number().int().positive(),
    state: phase9BAClaimStateSchema,
    stateReason: claimStateReasonSchema,
    authorization: mockAuthorizationSnapshotSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    mode: z.literal('architecture_mock'),
    liveSettlementEnabled: z.literal(false),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.state === 'authorized_mock' && value.authorization === null) {
      context.addIssue({
        code: 'custom',
        path: ['authorization'],
        message: 'The authorized mock state requires an immutable mock authorization snapshot.',
      });
    }
    if (value.authorization !== null) {
      const payload = value.authorization.payload;
      const mismatched =
        payload.claimPublicId !== value.publicClaimId ||
        payload.eligibilityPublicId !== value.publicEligibilityId ||
        payload.safePlayerId !== value.safePlayerId ||
        payload.recipientWallet !== value.recipientWallet ||
        payload.tokenMint !== value.tokenMint ||
        payload.tokenProgram !== value.tokenProgram ||
        payload.network !== value.network ||
        payload.amountBaseUnits !== value.amountBaseUnits ||
        payload.decimals !== value.decimals ||
        payload.policyVersion !== value.policyVersion ||
        payload.epochId !== value.epochId;
      if (mismatched) {
        context.addIssue({
          code: 'custom',
          path: ['authorization'],
          message: 'Mock authorization fields must remain bound to their claim intent.',
        });
      }
    }
  });
export type ClaimIntent = z.infer<typeof claimIntentSchema>;

export function createMockClaimId(publicEligibilityId: string): string {
  const eligibilityId = publicEligibilityIdSchema.parse(publicEligibilityId);
  return publicClaimIdSchema.parse(
    `CLAIM-MOCK-${deterministicFixtureDigest('starville.mock.claim.v1', [eligibilityId])}`,
  );
}

export function canTransitionClaimState(
  current: Phase9BAClaimState,
  next: Phase9BAClaimState,
): boolean {
  return CLAIM_STATE_TRANSITIONS[current].includes(next);
}

export function transitionClaimIntent(
  current: ClaimIntent,
  input: {
    readonly expectedRevision: number;
    readonly nextState: Phase9BAClaimState;
    readonly reason: z.infer<typeof claimStateReasonSchema>;
    readonly at: string;
    readonly authorization?: z.infer<typeof mockAuthorizationSnapshotSchema> | null;
  },
): ClaimIntent {
  const claim = claimIntentSchema.parse(current);
  if (claim.revision !== input.expectedRevision) {
    throw new Error('CLAIM_REVISION_CONFLICT');
  }
  if (!canTransitionClaimState(claim.state, input.nextState)) {
    throw new Error('CLAIM_TRANSITION_FORBIDDEN');
  }
  const authorization =
    input.authorization === undefined ? claim.authorization : input.authorization;
  if (claim.authorization !== null && authorization !== claim.authorization) {
    const left = JSON.stringify(claim.authorization);
    const right = JSON.stringify(authorization);
    if (left !== right) throw new Error('AUTHORIZED_FIELDS_IMMUTABLE');
  }
  return claimIntentSchema.parse({
    ...claim,
    revision: claim.revision + 1,
    state: input.nextState,
    stateReason: input.reason,
    authorization,
    updatedAt: timestampSchema.parse(input.at),
  });
}
