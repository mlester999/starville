import {
  createFixtureEligibilityCore,
  createFixtureEpoch,
  createFixtureTreasuryPolicy,
  createFixtureTreasuryReserve,
  InMemoryClaimAuthority,
  type ClaimIntent,
  type InMemoryClaimAuthoritySnapshot,
} from '../src';

export const CLAIM_TIME = '2026-08-16T12:00:00.000Z';

export function createAuthority(
  input: {
    readonly policy?: ReturnType<typeof createFixtureTreasuryPolicy>;
    readonly reserve?: ReturnType<typeof createFixtureTreasuryReserve>;
    readonly epoch?: ReturnType<typeof createFixtureEpoch> | null;
  } = {},
): InMemoryClaimAuthority {
  return new InMemoryClaimAuthority({
    policy: input.policy ?? createFixtureTreasuryPolicy(),
    reserve: input.reserve ?? createFixtureTreasuryReserve(),
    epoch: input.epoch === undefined ? createFixtureEpoch() : input.epoch,
  });
}

export async function seedClaim(
  authority: InMemoryClaimAuthority,
  input: Parameters<typeof createFixtureEligibilityCore>[0] & { readonly sequence?: number } = {},
): Promise<ClaimIntent> {
  const sequence = input.sequence ?? 1;
  const eligibility = await authority.createEligibility(
    createFixtureEligibilityCore({ ...input, sequence }),
  );
  const claim = await authority.createClaimIntent({
    publicEligibilityId: eligibility.value.publicEligibilityId,
    recipientWallet: eligibility.value.verifiedRecipientWallet,
    idempotencyKey: `fixture:intent:${sequence.toString().padStart(8, '0')}`,
    expectedEligibilityRevision: eligibility.value.revision,
    requestedAt: CLAIM_TIME,
  });
  return claim.value;
}

export function totalReserved(snapshot: InMemoryClaimAuthoritySnapshot): bigint {
  return BigInt(snapshot.reserve.authorizedUnclaimedBaseUnits);
}
