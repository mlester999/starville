import { describe, expect, it } from 'vitest';

import {
  assessTokenCompatibility,
  createClaimInstructionPlan,
  createFixtureEligibilityCore,
  createFixtureEpoch,
  createFixturePlayerId,
  createFixtureTreasuryPolicy,
  createFixtureTreasuryReserve,
  createFixtureWallet,
  claimEpochSchema,
  type ClaimAuthorityError,
  type ClaimIntent,
  type InMemoryClaimAuthority,
} from '../src';
import { CLAIM_TIME, createAuthority, seedClaim } from './helpers';

async function authorize(
  authority: InMemoryClaimAuthority,
  claim: ClaimIntent,
  suffix: string,
  fee = '5000',
) {
  return authority.authorizeMock({
    publicClaimId: claim.publicClaimId,
    currentVerifiedWallet: claim.recipientWallet,
    idempotencyKey: `fixture:authorization:${suffix}`,
    expectedClaimRevision: claim.revision,
    requestedAt: CLAIM_TIME,
    fixtureFeeEstimateLamports: fee,
  });
}

function rejectionCodes(results: readonly PromiseSettledResult<unknown>[]): readonly string[] {
  return results
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map(({ reason }) => (reason as ClaimAuthorityError).code)
    .sort();
}

describe('revision and identity races', () => {
  it.each(['cancel', 'expire', 'quarantine'] as const)(
    'permits one revision winner for authorization versus %s',
    async (operation) => {
      const authority = createAuthority();
      const claim = await seedClaim(authority);
      const competing =
        operation === 'cancel'
          ? authority.cancelClaim({
              publicClaimId: claim.publicClaimId,
              expectedRevision: 1,
              at: CLAIM_TIME,
            })
          : operation === 'expire'
            ? authority.expireClaim({
                publicClaimId: claim.publicClaimId,
                expectedRevision: 1,
                at: '2026-08-31T00:00:00.000Z',
              })
            : authority.quarantineClaim({
                publicClaimId: claim.publicClaimId,
                expectedRevision: 1,
                at: CLAIM_TIME,
              });
      const results = await Promise.allSettled([authorize(authority, claim, operation), competing]);
      expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
      expect(rejectionCodes(results)).toEqual(['CLAIM_REVISION_CONFLICT']);
      expect(authority.snapshot().claims).toHaveLength(1);
      expect(['authorized_mock', 'cancelled_mock', 'expired_mock', 'quarantined_mock']).toContain(
        authority.getClaim(claim.publicClaimId)?.state,
      );
    },
  );

  it('never redirects a claim during a wallet-update versus authorization race', async () => {
    const authority = createAuthority();
    const claim = await seedClaim(authority);
    await Promise.allSettled([
      authorize(authority, claim, 'wallet-race'),
      authority.updateVerifiedWallet({
        safePlayerId: claim.safePlayerId,
        newVerifiedWallet: createFixtureWallet(999),
        at: CLAIM_TIME,
      }),
    ]);
    const final = authority.getClaim(claim.publicClaimId);
    expect(final?.recipientWallet).toBe(claim.recipientWallet);
    expect(final?.amountBaseUnits).toBe(claim.amountBaseUnits);
    expect(final?.tokenMint).toBe(claim.tokenMint);
    expect(final?.network).toBe(claim.network);
    expect(['eligible_mock', 'quarantined_mock']).toContain(final?.state);
  });

  it('quarantines or rejects authorization during a suspension race', async () => {
    const authority = createAuthority();
    const claim = await seedClaim(authority);
    await Promise.allSettled([
      authorize(authority, claim, 'suspension-race'),
      authority.setPlayerSuspended({
        safePlayerId: claim.safePlayerId,
        suspended: true,
        at: CLAIM_TIME,
      }),
    ]);
    expect(authority.getClaim(claim.publicClaimId)).toMatchObject({
      state: 'quarantined_mock',
      recipientWallet: claim.recipientWallet,
      amountBaseUnits: claim.amountBaseUnits,
    });
  });

  it('rejects a second wallet racing for the same eligibility while preserving one intent', async () => {
    const authority = createAuthority();
    const eligibility = (
      await authority.createEligibility(createFixtureEligibilityCore({ sequence: 7 }))
    ).value;
    const results = await Promise.allSettled([
      authority.createClaimIntent({
        publicEligibilityId: eligibility.publicEligibilityId,
        recipientWallet: eligibility.verifiedRecipientWallet,
        idempotencyKey: 'fixture:intent:wallet-race-a',
        expectedEligibilityRevision: 1,
        requestedAt: CLAIM_TIME,
      }),
      authority.createClaimIntent({
        publicEligibilityId: eligibility.publicEligibilityId,
        recipientWallet: createFixtureWallet(700),
        idempotencyKey: 'fixture:intent:wallet-race-b',
        expectedEligibilityRevision: 1,
        requestedAt: CLAIM_TIME,
      }),
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(rejectionCodes(results)).toEqual(['RECIPIENT_MISMATCH']);
    expect(authority.snapshot().claims).toHaveLength(1);
  });

  it('permits one claim revision winner for dispute resolution versus cancellation', async () => {
    const authority = createAuthority();
    const claim = await seedClaim(authority, { sequence: 8 });
    const quarantined = await authority.quarantineClaim({
      publicClaimId: claim.publicClaimId,
      expectedRevision: claim.revision,
      reason: 'dispute_review',
      at: CLAIM_TIME,
    });
    const results = await Promise.allSettled([
      authority.resolveDisputeReview({
        publicClaimId: claim.publicClaimId,
        expectedRevision: quarantined.revision,
        resolution: 'eligible_mock',
        at: '2026-08-16T12:01:00.000Z',
      }),
      authority.cancelClaim({
        publicClaimId: claim.publicClaimId,
        expectedRevision: quarantined.revision,
        at: '2026-08-16T12:01:00.000Z',
      }),
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(rejectionCodes(results)).toEqual(['CLAIM_REVISION_CONFLICT']);
    expect(['eligible_mock', 'cancelled_mock']).toContain(
      authority.getClaim(claim.publicClaimId)?.state,
    );
  });

  it('deduplicates concurrent offline plans into the same deterministic artifact', async () => {
    const authority = createAuthority();
    const claim = await seedClaim(authority, { sequence: 9 });
    const authorized = await authorize(authority, claim, 'duplicate-plan');
    const payload = authorized.authorization.payload;
    const tokenCompatibility = assessTokenCompatibility({
      tokenProgram: payload.tokenProgram,
      configuredDecimals: payload.decimals,
      observedFixtureDecimals: payload.decimals,
      transferFeeExtension: 'absent_fixture',
      withheldFees: 'absent_fixture',
      transferHookExtension: 'absent_fixture',
      permanentDelegate: 'absent_fixture',
      confidentialTransfer: 'absent_fixture',
      defaultAccountState: 'initialized_fixture',
      nonTransferableExtension: 'absent_fixture',
      interestBearingExtension: 'absent_fixture',
      memoTransferRequirement: 'absent_fixture',
      metadataPointer: 'absent_fixture',
      destinationAccountOwnerVerifiedFixture: true,
      associatedAccountExpectation: 'existing_fixture',
      source: 'offline_fixture',
    });
    const input = {
      recipientWallet: payload.recipientWallet,
      tokenMint: payload.tokenMint,
      network: payload.network,
      amountBaseUnits: payload.amountBaseUnits,
      decimals: payload.decimals,
      tokenProgram: payload.tokenProgram,
      destinationAccountExpectation: 'existing_associated_account_fixture' as const,
      publicAuthorizationId: authorized.authorization.publicAuthorizationId,
      publicClaimId: payload.claimPublicId,
      fixtureFeeEstimateLamports: '5000',
      fixtureComputeEstimateUnits: 80_000,
      claimState: authorized.claim.state,
      evaluatedAt: '2026-08-16T12:05:00.000Z',
      authorization: authorized.authorization,
      tokenCompatibility,
    };
    const plans = await Promise.all([
      Promise.resolve().then(() => createClaimInstructionPlan(input)),
      Promise.resolve().then(() => createClaimInstructionPlan(input)),
    ]);
    expect(plans[0]).toEqual(plans[1]);
    expect(new Set(plans.map(({ planId }) => planId)).size).toBe(1);
    expect(plans[0]).toMatchObject({ valid: true, broadcastReady: false });
  });
});

describe('layered cap and reserve races', () => {
  async function twoClaims(
    authority: InMemoryClaimAuthority,
    options: {
      readonly samePlayer?: boolean;
      readonly sameWallet?: boolean;
      readonly amount?: string;
    } = {},
  ) {
    const player = createFixturePlayerId(90);
    const wallet = createFixtureWallet(90);
    const first = await seedClaim(authority, {
      sequence: 90,
      amountBaseUnits: options.amount ?? '600',
      ...(options.samePlayer ? { safePlayerId: player } : {}),
      ...(options.sameWallet ? { recipientWallet: wallet } : {}),
    });
    const second = await seedClaim(authority, {
      sequence: 91,
      amountBaseUnits: options.amount ?? '600',
      ...(options.samePlayer ? { safePlayerId: player } : {}),
      ...(options.samePlayer || options.sameWallet ? { recipientWallet: wallet } : {}),
    });
    return [first, second] as const;
  }

  it.each([
    {
      label: 'player daily',
      policy: createFixtureTreasuryPolicy({ perPlayerDailyBaseUnits: '1000' }),
      samePlayer: true,
      sameWallet: false,
      expectedCode: 'player_daily_cap',
    },
    {
      label: 'wallet daily',
      policy: createFixtureTreasuryPolicy({ perWalletDailyBaseUnits: '1000' }),
      samePlayer: false,
      sameWallet: true,
      expectedCode: 'wallet_daily_cap',
    },
    {
      label: 'global daily',
      policy: createFixtureTreasuryPolicy({ globalDailyBaseUnits: '1000' }),
      samePlayer: false,
      sameWallet: false,
      expectedCode: 'global_daily_cap',
    },
    {
      label: 'epoch allocation',
      policy: createFixtureTreasuryPolicy({ epochBaseUnits: '1000' }),
      samePlayer: false,
      sameWallet: false,
      expectedCode: 'epoch_cap',
    },
  ] as const)(
    'prevents $label cap bypass under concurrent authorization',
    async ({ policy, samePlayer, sameWallet, expectedCode }) => {
      const authority = createAuthority({ policy });
      const [first, second] = await twoClaims(authority, { samePlayer, sameWallet });
      const results = await Promise.allSettled([
        authorize(authority, first, `${expectedCode}-a`),
        authorize(authority, second, `${expectedCode}-b`),
      ]);
      expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      expect((rejected?.reason as ClaimAuthorityError).details).toContain(expectedCode);
      expect(
        authority.snapshot().claims.filter(({ state }) => state === 'authorized_mock'),
      ).toHaveLength(1);
    },
  );

  it('prevents fixture token reserve over-allocation', async () => {
    const authority = createAuthority({
      policy: createFixtureTreasuryPolicy({
        minimumTokenReserveBaseUnits: '1000',
        safetyBufferBaseUnits: '100',
      }),
      reserve: createFixtureTreasuryReserve({
        tokenBalanceBaseUnits: '2100',
        minimumTokenReserveBaseUnits: '1000',
        safetyBufferBaseUnits: '100',
      }),
    });
    const [first, second] = await twoClaims(authority);
    const results = await Promise.allSettled([
      authorize(authority, first, 'reserve-a'),
      authorize(authority, second, 'reserve-b'),
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(rejectionCodes(results)).toEqual(['TREASURY_RESERVE_CONFLICT']);
    expect(BigInt(authority.snapshot().reserve.authorizedUnclaimedBaseUnits)).toBe(600n);
  });

  it('prevents fixture fee reserve over-allocation', async () => {
    const authority = createAuthority({
      reserve: createFixtureTreasuryReserve({
        feeBalanceLamports: '2100000',
        minimumSolReserveLamports: '1000000',
      }),
    });
    const [first, second] = await twoClaims(authority);
    const results = await Promise.allSettled([
      authorize(authority, first, 'fee-a', '600000'),
      authorize(authority, second, 'fee-b', '600000'),
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(rejectionCodes(results)).toEqual(['FEE_RESERVE_CONFLICT']);
    expect(authority.snapshot().reserve.pendingFeeReserveLamports).toBe('600000');
  });

  it('rejects a preexisting epoch allocation race before any authority state mutates', async () => {
    const baseEpoch = createFixtureEpoch({ maximumAllocationBaseUnits: '1000' });
    const epoch = claimEpochSchema.parse({
      ...baseEpoch,
      authorizedAmountBaseUnits: '800',
      remainingAllocationBaseUnits: '200',
    });
    const authority = createAuthority({ epoch });
    const claim = await seedClaim(authority, { amountBaseUnits: '600' });
    const before = authority.snapshot();
    await expect(authorize(authority, claim, 'preexisting-epoch')).rejects.toMatchObject({
      code: 'CAP_REJECTED',
      details: expect.arrayContaining(['epoch_cap']),
    });
    expect(authority.snapshot()).toEqual(before);
  });

  it('releases cap and reserve reservations after an authorized claim is cancelled', async () => {
    const authority = createAuthority({
      policy: createFixtureTreasuryPolicy({ globalDailyBaseUnits: '1000' }),
    });
    const [first, second] = await twoClaims(authority);
    const authorized = await authorize(authority, first, 'release-a');
    await authority.cancelClaim({
      publicClaimId: first.publicClaimId,
      expectedRevision: authorized.claim.revision,
      at: '2026-08-16T12:01:00.000Z',
    });
    await expect(authorize(authority, second, 'release-b')).resolves.toMatchObject({
      claim: { state: 'authorized_mock' },
    });
    expect(authority.snapshot().reserve.authorizedUnclaimedBaseUnits).toBe('600');
  });
});

describe('bounded property sweeps', () => {
  it('preserves deterministic unique IDs and never changes bound fields across 250 fixtures', async () => {
    const ids = new Set<string>();
    for (let sequence = 1; sequence <= 250; sequence += 1) {
      const authority = createAuthority();
      const claim = await seedClaim(authority, { sequence });
      ids.add(claim.publicClaimId);
      expect(claim).toMatchObject({
        amountBaseUnits: '500',
        network: 'solana:mainnet-beta',
        tokenProgram: 'spl-token-2022',
        liveSettlementEnabled: false,
      });
    }
    expect(ids.size).toBe(250);
  });
});
