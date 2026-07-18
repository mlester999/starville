import { z } from 'zod';

import {
  fromBaseUnits,
  nonnegativeTokenBaseUnitsSchema,
  policyVersionSchema,
  publicEpochIdSchema,
  safeText,
  timestampSchema,
  tokenBaseUnitsSchema,
  toBaseUnits,
} from './common';
import { claimEligibilitySourceCategorySchema } from './eligibility';

export const CLAIM_EPOCH_STATUSES = [
  'draft',
  'calculating',
  'review',
  'approved',
  'active',
  'paused',
  'completed',
  'expired',
  'cancelled',
] as const;
export const claimEpochStatusSchema = z.enum(CLAIM_EPOCH_STATUSES);
export type ClaimEpochStatus = z.infer<typeof claimEpochStatusSchema>;

export const CLAIM_EPOCH_TRANSITIONS: Readonly<
  Record<ClaimEpochStatus, readonly ClaimEpochStatus[]>
> = Object.freeze({
  draft: Object.freeze(['calculating', 'cancelled'] as const),
  calculating: Object.freeze(['review', 'draft', 'cancelled'] as const),
  review: Object.freeze(['approved', 'calculating', 'cancelled'] as const),
  approved: Object.freeze(['active', 'cancelled'] as const),
  active: Object.freeze(['paused', 'completed', 'expired', 'cancelled'] as const),
  paused: Object.freeze(['active', 'completed', 'expired', 'cancelled'] as const),
  completed: Object.freeze([] as const),
  expired: Object.freeze([] as const),
  cancelled: Object.freeze([] as const),
});

export const claimEpochSchema = z
  .object({
    publicEpochId: publicEpochIdSchema,
    name: safeText(3, 100),
    startAt: timestampSchema,
    endAt: timestampSchema,
    eligibilityCutoffAt: timestampSchema,
    claimStartAt: timestampSchema,
    claimExpiresAt: timestampSchema,
    maximumAllocationBaseUnits: tokenBaseUnitsSchema,
    sourceCategories: z.array(claimEligibilitySourceCategorySchema).min(1).max(4),
    eligibilityCount: z.number().int().nonnegative().max(10_000_000),
    authorizedAmountBaseUnits: nonnegativeTokenBaseUnitsSchema,
    confirmedAmountBaseUnits: nonnegativeTokenBaseUnitsSchema,
    cancelledAmountBaseUnits: nonnegativeTokenBaseUnitsSchema,
    remainingAllocationBaseUnits: nonnegativeTokenBaseUnitsSchema,
    policyVersion: policyVersionSchema,
    status: claimEpochStatusSchema,
    revision: z.number().int().positive(),
    mode: z.literal('architecture_mock'),
  })
  .strict()
  .superRefine((epoch, context) => {
    const start = Date.parse(epoch.startAt);
    const end = Date.parse(epoch.endAt);
    const cutoff = Date.parse(epoch.eligibilityCutoffAt);
    const claimStart = Date.parse(epoch.claimStartAt);
    const claimExpiry = Date.parse(epoch.claimExpiresAt);
    if (!(start < cutoff && cutoff <= end && end <= claimStart && claimStart < claimExpiry)) {
      context.addIssue({
        code: 'custom',
        path: ['startAt'],
        message:
          'Epoch, cutoff, and claim timestamps must follow their closed chronological order.',
      });
    }
    if (new Set(epoch.sourceCategories).size !== epoch.sourceCategories.length) {
      context.addIssue({
        code: 'custom',
        path: ['sourceCategories'],
        message: 'Epoch source categories must be unique.',
      });
    }
    const maximum = toBaseUnits(epoch.maximumAllocationBaseUnits);
    const authorized = toBaseUnits(epoch.authorizedAmountBaseUnits);
    const confirmed = toBaseUnits(epoch.confirmedAmountBaseUnits);
    const expectedRemaining =
      maximum > authorized + confirmed ? maximum - authorized - confirmed : 0n;
    if (authorized + confirmed > maximum) {
      context.addIssue({
        code: 'custom',
        path: ['authorizedAmountBaseUnits'],
        message: 'Active authorization and confirmed allocation cannot exceed the maximum.',
      });
    }
    if (toBaseUnits(epoch.remainingAllocationBaseUnits) !== expectedRemaining) {
      context.addIssue({
        code: 'custom',
        path: ['remainingAllocationBaseUnits'],
        message:
          'Remaining allocation must equal maximum less active authorization and confirmation.',
      });
    }
  });
export type ClaimEpoch = z.infer<typeof claimEpochSchema>;

export function calculateEpochRemaining(input: {
  readonly maximumAllocationBaseUnits: string;
  readonly authorizedAmountBaseUnits: string;
  readonly confirmedAmountBaseUnits: string;
}): string {
  const maximum = toBaseUnits(tokenBaseUnitsSchema.parse(input.maximumAllocationBaseUnits));
  const authorized = toBaseUnits(
    nonnegativeTokenBaseUnitsSchema.parse(input.authorizedAmountBaseUnits),
  );
  const confirmed = toBaseUnits(
    nonnegativeTokenBaseUnitsSchema.parse(input.confirmedAmountBaseUnits),
  );
  return fromBaseUnits(maximum > authorized + confirmed ? maximum - authorized - confirmed : 0n);
}

export function transitionClaimEpoch(
  rawEpoch: ClaimEpoch,
  input: { readonly expectedRevision: number; readonly nextStatus: ClaimEpochStatus },
): ClaimEpoch {
  const epoch = claimEpochSchema.parse(rawEpoch);
  if (epoch.revision !== input.expectedRevision) throw new Error('EPOCH_REVISION_CONFLICT');
  if (!CLAIM_EPOCH_TRANSITIONS[epoch.status].includes(input.nextStatus)) {
    throw new Error('EPOCH_TRANSITION_FORBIDDEN');
  }
  return claimEpochSchema.parse({
    ...epoch,
    revision: epoch.revision + 1,
    status: input.nextStatus,
  });
}
