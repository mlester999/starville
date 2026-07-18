import { describe, expect, it } from 'vitest';

import {
  claimIntentSchema,
  createFixtureEligibilityCore,
  createFixtureEpoch,
  createFixtureTreasuryPolicy,
  createFixtureTreasuryReserve,
  createFixtureWallet,
  InMemoryClaimAuthority,
  sumAuthorizedMockClaims,
} from '../src';
import { CLAIM_TIME, createAuthority, seedClaim, totalReserved } from './helpers';

describe('in-memory exactly-once claim authority', () => {
  it('creates one eligibility per source receipt and replays only an identical idempotent request', async () => {
    const authority = createAuthority();
    const core = createFixtureEligibilityCore();
    const first = await authority.createEligibility(core);
    const replay = await authority.createEligibility(core);
    expect(replay).toEqual({ value: first.value, replayed: true });

    const duplicateSource = await authority.createEligibility({
      ...core,
      idempotencyKey: 'fixture:eligibility:duplicate',
    });
    expect(duplicateSource).toEqual({ value: first.value, replayed: true });
    await expect(
      authority.createEligibility({ ...core, amountBaseUnits: '600' }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(
      authority.createEligibility({ ...core, network: 'solana:devnet' }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(
      authority.createEligibility({
        ...core,
        idempotencyKey: 'fixture:eligibility:conflict',
        amountBaseUnits: '600',
      }),
    ).rejects.toMatchObject({ code: 'SOURCE_RECEIPT_DUPLICATE_CONFLICT' });
    expect(authority.snapshot().eligibility).toHaveLength(1);
  });

  it('rejects policy, reserve, and epoch binding mismatches at construction', () => {
    const policy = createFixtureTreasuryPolicy();
    expect(
      () =>
        new InMemoryClaimAuthority({
          policy,
          reserve: createFixtureTreasuryReserve({ minimumTokenReserveBaseUnits: '0' }),
          epoch: createFixtureEpoch(),
        }),
    ).toThrow(expect.objectContaining({ code: 'POLICY_RESERVE_BINDING_MISMATCH' }));

    const pendingPolicy = createFixtureTreasuryPolicy({ pendingClaimReserveBaseUnits: '500' });
    expect(
      () =>
        new InMemoryClaimAuthority({
          policy: pendingPolicy,
          reserve: createFixtureTreasuryReserve({ pendingOperationBaseUnits: '0' }),
          epoch: createFixtureEpoch(),
        }),
    ).toThrow(expect.objectContaining({ code: 'POLICY_RESERVE_BINDING_MISMATCH' }));

    expect(
      () =>
        new InMemoryClaimAuthority({
          policy,
          reserve: createFixtureTreasuryReserve(),
          epoch: createFixtureEpoch({ policyVersion: 'other-fixture-v1' }),
        }),
    ).toThrow(expect.objectContaining({ code: 'EPOCH_BINDING_MISMATCH' }));
  });

  it('rejects a foreign campaign cap namespace and invalid epoch boundaries before persistence', async () => {
    const authority = createAuthority();
    await expect(
      authority.createEligibility(
        createFixtureEligibilityCore({ sequence: 20, campaignId: 'attacker-campaign' }),
      ),
    ).rejects.toMatchObject({ code: 'POLICY_BINDING_MISMATCH' });
    await expect(
      authority.createEligibility(
        createFixtureEligibilityCore({
          sequence: 21,
          sourceCategory: 'approved_administrative_reward',
        }),
      ),
    ).rejects.toMatchObject({ code: 'EPOCH_BINDING_MISMATCH' });
    await expect(
      authority.createEligibility(
        createFixtureEligibilityCore({
          sequence: 22,
          expiresAt: '2026-09-01T00:00:00.000Z',
        }),
      ),
    ).rejects.toMatchObject({ code: 'EPOCH_BINDING_MISMATCH' });
    expect(authority.snapshot().eligibility).toHaveLength(0);
  });

  it('allows two sessions to race but creates one authoritative intent', async () => {
    const authority = createAuthority();
    const eligibility = (await authority.createEligibility(createFixtureEligibilityCore())).value;
    const results = await Promise.all([
      authority.createClaimIntent({
        publicEligibilityId: eligibility.publicEligibilityId,
        recipientWallet: eligibility.verifiedRecipientWallet,
        idempotencyKey: 'fixture:intent:session-a',
        expectedEligibilityRevision: 1,
        requestedAt: CLAIM_TIME,
      }),
      authority.createClaimIntent({
        publicEligibilityId: eligibility.publicEligibilityId,
        recipientWallet: eligibility.verifiedRecipientWallet,
        idempotencyKey: 'fixture:intent:session-b',
        expectedEligibilityRevision: 1,
        requestedAt: CLAIM_TIME,
      }),
    ]);
    expect(new Set(results.map(({ value }) => value.publicClaimId)).size).toBe(1);
    expect(results.filter(({ replayed }) => replayed)).toHaveLength(1);
    expect(authority.snapshot().claims).toHaveLength(1);
  });

  it('rejects recipient substitution before or after intent creation', async () => {
    const authority = createAuthority();
    const eligibility = (await authority.createEligibility(createFixtureEligibilityCore())).value;
    await expect(
      authority.createClaimIntent({
        publicEligibilityId: eligibility.publicEligibilityId,
        recipientWallet: createFixtureWallet(500),
        idempotencyKey: 'fixture:intent:wrong-wallet',
        expectedEligibilityRevision: 1,
        requestedAt: CLAIM_TIME,
      }),
    ).rejects.toMatchObject({ code: 'RECIPIENT_MISMATCH' });
    const claim = await seedClaim(authority, { sequence: 2 });
    await expect(
      authority.authorizeMock({
        publicClaimId: claim.publicClaimId,
        currentVerifiedWallet: createFixtureWallet(600),
        idempotencyKey: 'fixture:authorization:wrong-wallet',
        expectedClaimRevision: claim.revision,
        requestedAt: CLAIM_TIME,
        fixtureFeeEstimateLamports: '5000',
      }),
    ).rejects.toMatchObject({ code: 'WALLET_VERIFICATION_CONFLICT' });
  });

  it('creates and replays one immutable mock authorization with every authoritative binding', async () => {
    const authority = createAuthority();
    const claim = await seedClaim(authority);
    const input = {
      publicClaimId: claim.publicClaimId,
      currentVerifiedWallet: claim.recipientWallet,
      idempotencyKey: 'fixture:authorization:0001',
      expectedClaimRevision: claim.revision,
      requestedAt: CLAIM_TIME,
      fixtureFeeEstimateLamports: '5000',
    } as const;
    const first = await authority.authorizeMock(input);
    const replay = await authority.authorizeMock({
      ...input,
      requestedAt: '2026-08-16T12:05:00.000Z',
    });
    expect(replay).toEqual({ ...first, replayed: true });
    expect(first.claim).toMatchObject({
      state: 'authorized_mock',
      recipientWallet: claim.recipientWallet,
      tokenMint: claim.tokenMint,
      tokenProgram: claim.tokenProgram,
      network: claim.network,
      amountBaseUnits: claim.amountBaseUnits,
      policyVersion: claim.policyVersion,
    });
    expect(first.authorization).toMatchObject({
      immutable: true,
      liveCryptographyUsed: false,
      networkAccessed: false,
      usableForBlockchainSettlement: false,
    });
    expect(claimIntentSchema.safeParse({ ...first.claim, amountBaseUnits: '999' }).success).toBe(
      false,
    );
    expect(authority.snapshot().usedNonces).toBe(1);
    expect(sumAuthorizedMockClaims(authority.snapshot())).toBe(claim.amountBaseUnits);
  });

  it('does not silently redirect on wallet change and releases held reserves only on terminal close', async () => {
    const authority = createAuthority();
    const claim = await seedClaim(authority);
    const authorized = await authority.authorizeMock({
      publicClaimId: claim.publicClaimId,
      currentVerifiedWallet: claim.recipientWallet,
      idempotencyKey: 'fixture:authorization:wallet-change',
      expectedClaimRevision: 1,
      requestedAt: CLAIM_TIME,
      fixtureFeeEstimateLamports: '5000',
    });
    const reserved = totalReserved(authority.snapshot());
    expect(reserved).toBe(BigInt(claim.amountBaseUnits));
    const affected = await authority.updateVerifiedWallet({
      safePlayerId: claim.safePlayerId,
      newVerifiedWallet: createFixtureWallet(700),
      at: '2026-08-16T12:01:00.000Z',
    });
    expect(affected).toHaveLength(1);
    expect(affected[0]).toMatchObject({
      state: 'quarantined_mock',
      recipientWallet: claim.recipientWallet,
    });
    expect(totalReserved(authority.snapshot())).toBe(reserved);
    const cancelled = await authority.cancelClaim({
      publicClaimId: claim.publicClaimId,
      expectedRevision: authorized.claim.revision + 1,
      at: '2026-08-16T12:02:00.000Z',
    });
    expect(cancelled.state).toBe('cancelled_mock');
    expect(totalReserved(authority.snapshot())).toBe(0n);
    expect(authority.snapshot().reserve.pendingFeeReserveLamports).toBe('0');
    expect(authority.snapshot().epoch).toMatchObject({
      authorizedAmountBaseUnits: '0',
      cancelledAmountBaseUnits: claim.amountBaseUnits,
    });
  });

  it('fails closed when the mock provider is disabled or a policy binding changes', async () => {
    const disabled = new InMemoryClaimAuthority({
      policy: createFixtureTreasuryPolicy({ signerMode: 'disabled' }),
      reserve: createAuthority().snapshot().reserve,
      epoch: createAuthority().snapshot().epoch,
    });
    const disabledClaim = await seedClaim(disabled);
    await expect(
      disabled.authorizeMock({
        publicClaimId: disabledClaim.publicClaimId,
        currentVerifiedWallet: disabledClaim.recipientWallet,
        idempotencyKey: 'fixture:authorization:disabled',
        expectedClaimRevision: 1,
        requestedAt: CLAIM_TIME,
        fixtureFeeEstimateLamports: '5000',
      }),
    ).rejects.toMatchObject({ code: 'MOCK_PROVIDER_DISABLED' });

    const mismatched = createAuthority();
    await expect(
      mismatched.createEligibility({
        ...createFixtureEligibilityCore({ sequence: 2 }),
        tokenProgram: 'spl-token',
      }),
    ).rejects.toMatchObject({ code: 'POLICY_BINDING_MISMATCH' });
  });

  it('protects stored and cached authority state from runtime reference mutation', async () => {
    const authority = createAuthority();
    const core = createFixtureEligibilityCore({ sequence: 30 });
    const created = await authority.createEligibility(core);
    expect(() => {
      (created.value as { amountBaseUnits: string }).amountBaseUnits = '900';
    }).toThrow(TypeError);
    expect(() => {
      const exposed = authority.getEligibility(created.value.publicEligibilityId);
      if (exposed !== null) {
        (exposed as { amountBaseUnits: string }).amountBaseUnits = '900';
      }
    }).toThrow(TypeError);
    expect(authority.getEligibility(created.value.publicEligibilityId)?.amountBaseUnits).toBe(
      core.amountBaseUnits,
    );

    const claim = await authority.createClaimIntent({
      publicEligibilityId: created.value.publicEligibilityId,
      recipientWallet: created.value.verifiedRecipientWallet,
      idempotencyKey: 'fixture:intent:immutability',
      expectedEligibilityRevision: created.value.revision,
      requestedAt: CLAIM_TIME,
    });
    const authorized = await authority.authorizeMock({
      publicClaimId: claim.value.publicClaimId,
      currentVerifiedWallet: claim.value.recipientWallet,
      idempotencyKey: 'fixture:authorization:immutability',
      expectedClaimRevision: claim.value.revision,
      requestedAt: CLAIM_TIME,
      fixtureFeeEstimateLamports: '5000',
    });
    expect(() => {
      (
        authorized.authorization.payload as {
          amountBaseUnits: string;
        }
      ).amountBaseUnits = '900';
    }).toThrow(TypeError);
    expect(() => {
      (authority.snapshot().claims[0] as { amountBaseUnits: string }).amountBaseUnits = '900';
    }).toThrow(TypeError);
    expect(authority.getClaim(claim.value.publicClaimId)).toMatchObject({
      amountBaseUnits: core.amountBaseUnits,
      authorization: { payload: { amountBaseUnits: core.amountBaseUnits } },
    });
  });

  it('does not expire eligibility or release an authorization before its bound expiry', async () => {
    const authority = createAuthority();
    const claim = await seedClaim(authority);
    const authorized = await authority.authorizeMock({
      publicClaimId: claim.publicClaimId,
      currentVerifiedWallet: claim.recipientWallet,
      idempotencyKey: 'fixture:authorization:expiry-guard',
      expectedClaimRevision: 1,
      requestedAt: CLAIM_TIME,
      fixtureFeeEstimateLamports: '5000',
    });
    const before = authority.snapshot();
    await expect(
      authority.expireClaim({
        publicClaimId: claim.publicClaimId,
        expectedRevision: authorized.claim.revision,
        at: '2026-08-16T12:14:59.999Z',
      }),
    ).rejects.toMatchObject({ code: 'EXPIRY_NOT_REACHED' });
    expect(authority.snapshot()).toEqual(before);
    await expect(
      authority.expireClaim({
        publicClaimId: claim.publicClaimId,
        expectedRevision: authorized.claim.revision,
        at: '2026-08-16T12:15:00.000Z',
      }),
    ).resolves.toMatchObject({ state: 'expired_mock' });
    expect(authority.snapshot().reserve.authorizedUnclaimedBaseUnits).toBe('0');
  });

  it.each(['cancelled_mock', 'expired_mock', 'quarantined_mock'] as const)(
    'never replays a stale authorization after the claim becomes %s',
    async (terminalState) => {
      const authority = createAuthority();
      const claim = await seedClaim(authority);
      const input = {
        publicClaimId: claim.publicClaimId,
        currentVerifiedWallet: claim.recipientWallet,
        idempotencyKey: `fixture:authorization:stale:${terminalState}`,
        expectedClaimRevision: claim.revision,
        requestedAt: CLAIM_TIME,
        fixtureFeeEstimateLamports: '5000',
      } as const;
      const authorized = await authority.authorizeMock(input);
      if (terminalState === 'cancelled_mock') {
        await authority.cancelClaim({
          publicClaimId: claim.publicClaimId,
          expectedRevision: authorized.claim.revision,
          at: '2026-08-16T12:01:00.000Z',
        });
      } else if (terminalState === 'expired_mock') {
        await authority.expireClaim({
          publicClaimId: claim.publicClaimId,
          expectedRevision: authorized.claim.revision,
          at: '2026-08-16T12:15:00.000Z',
        });
      } else {
        await authority.quarantineClaim({
          publicClaimId: claim.publicClaimId,
          expectedRevision: authorized.claim.revision,
          at: '2026-08-16T12:01:00.000Z',
        });
      }
      await expect(
        authority.authorizeMock({ ...input, requestedAt: '2026-08-16T12:15:00.000Z' }),
      ).rejects.toMatchObject({ code: 'CLAIM_STATE_CONFLICT' });
    },
  );

  it('rejects replay once the immutable authorization reaches its expiry', async () => {
    const authority = createAuthority();
    const claim = await seedClaim(authority);
    const input = {
      publicClaimId: claim.publicClaimId,
      currentVerifiedWallet: claim.recipientWallet,
      idempotencyKey: 'fixture:authorization:logical-expiry',
      expectedClaimRevision: claim.revision,
      requestedAt: CLAIM_TIME,
      fixtureFeeEstimateLamports: '5000',
    } as const;
    await authority.authorizeMock(input);
    await expect(
      authority.authorizeMock({ ...input, requestedAt: '2026-08-16T12:15:00.000Z' }),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_EXPIRED' });
  });
});
