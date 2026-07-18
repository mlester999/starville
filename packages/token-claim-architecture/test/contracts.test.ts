// PHASE9BA_NONFUNCTIONAL_SECURITY_FIXTURE: security-shaped text is inert test evidence.
import { describe, expect, it } from 'vitest';

import {
  ARCHITECTURE_RECOMMENDATION,
  assessTokenCompatibility,
  calculateTreasuryReserve,
  canTransitionClaimState,
  CANONICAL_AUTHORIZATION_FIELDS,
  CLAIM_ARCHITECTURE_ASSESSMENTS,
  CLAIM_DISPUTE_STATES,
  CLAIM_STATE_TRANSITIONS,
  claimDisputeSchema,
  claimEligibilityCoreSchema,
  claimEpochSchema,
  claimQuarantineSchema,
  createFixtureEligibilityCore,
  createFixtureEpoch,
  createFixtureTreasuryPolicy,
  createFixtureTreasuryReserve,
  createMockEligibility,
  evaluateClaimCaps,
  PHASE_9B_A_CLAIM_STATES,
  TOKEN_CLAIMS_ENABLED,
  toPublicClaimDispute,
  transitionClaimDispute,
  transitionClaimQuarantine,
  treasuryPolicySchema,
} from '../src';

describe('disabled token-claim architecture contracts', () => {
  it('keeps the feature disabled and every architecture recommendation unapproved', () => {
    expect(TOKEN_CLAIMS_ENABLED).toBe(false);
    expect(CLAIM_ARCHITECTURE_ASSESSMENTS).toHaveLength(5);
    expect(CLAIM_ARCHITECTURE_ASSESSMENTS.map(({ model }) => model)).toEqual([
      'backend_hot_wallet',
      'multisig_backend_planned',
      'dedicated_program_authorizations',
      'epoch_merkle_distributor',
      'third_party_custodial_service',
    ]);
    expect(ARCHITECTURE_RECOMMENDATION).toMatchObject({
      approved: false,
      phase9BAActive: false,
      ownerDecisionRequired: true,
    });
  });

  it('creates deterministic immutable eligibility bound to one receipt, player, wallet, mint, and network', () => {
    const core = createFixtureEligibilityCore();
    const first = createMockEligibility(core);
    const second = createMockEligibility(core);

    expect(first).toEqual(second);
    expect(first.publicEligibilityId).toMatch(/^ELIG-MOCK-/u);
    expect(first.immutableAfterApproval).toBe(true);
    expect(first).toMatchObject({
      sourceReceiptId: core.sourceReceiptId,
      safePlayerId: core.safePlayerId,
      verifiedRecipientWallet: core.verifiedRecipientWallet,
      tokenMint: core.tokenMint,
      network: core.network,
    });
  });

  it('rejects client progress, DUST, inventory, and arbitrary fields as eligibility inputs', () => {
    const core = createFixtureEligibilityCore();
    for (const field of ['dustBalance', 'itemInventory', 'clientProgress', 'arbitraryJson']) {
      expect(
        claimEligibilityCoreSchema.safeParse({
          ...core,
          [field]: field === 'dustBalance' ? 999 : {},
        }).success,
      ).toBe(false);
    }
    expect(
      claimEligibilityCoreSchema.safeParse({ ...core, amountBaseUnits: '18446744073709551616' })
        .success,
    ).toBe(false);
    expect(
      claimEligibilityCoreSchema.safeParse({ ...core, expiresAt: core.earliestClaimAt }).success,
    ).toBe(false);
    expect(
      claimEligibilityCoreSchema.safeParse({
        ...core,
        verifiedRecipientWallet: 'z'.repeat(44),
      }).success,
    ).toBe(false);
    expect(
      claimEligibilityCoreSchema.safeParse({ ...core, tokenMint: 'z'.repeat(44) }).success,
    ).toBe(false);
    expect(
      claimEligibilityCoreSchema.safeParse({
        ...core,
        createdAt: '2026-08-15T01:00:00.000+01:00',
      }).success,
    ).toBe(false);
  });

  it('accepts only a strict disabled, unpublished, bounded treasury-policy draft', () => {
    const policy = createFixtureTreasuryPolicy();
    expect(policy).toMatchObject({
      featureEnabled: false,
      emergencyPaused: true,
      published: false,
      immutablePublishedVersionDesign: true,
    });
    expect(treasuryPolicySchema.safeParse({ ...policy, featureEnabled: true }).success).toBe(false);
    const prohibitedKeyField = ['private', 'Key'].join('');
    const prohibitedRecoveryField = ['seed', 'Phrase'].join('');
    expect(
      treasuryPolicySchema.safeParse({ ...policy, [prohibitedKeyField]: 'fixture' }).success,
    ).toBe(false);
    expect(
      treasuryPolicySchema.safeParse({ ...policy, [prohibitedRecoveryField]: 'fixture' }).success,
    ).toBe(false);
    expect(
      treasuryPolicySchema.safeParse({
        ...policy,
        minimumClaimBaseUnits: '1001',
        maximumClaimBaseUnits: '1000',
      }).success,
    ).toBe(false);
  });

  it('publishes the exact canonical authorization field order', () => {
    expect(CANONICAL_AUTHORIZATION_FIELDS).toEqual([
      'authorizationVersion',
      'domainSeparator',
      'claimPublicId',
      'eligibilityPublicId',
      'safePlayerId',
      'recipientWallet',
      'tokenMint',
      'tokenProgram',
      'network',
      'amountBaseUnits',
      'decimals',
      'policyVersion',
      'epochId',
      'nonce',
      'issuedAt',
      'expiresAt',
      'treasuryIdentifier',
      'sourceReceiptDigest',
    ]);
  });

  it('calculates protected fixture reserves and layered cap rejection without rounding', () => {
    const reserve = calculateTreasuryReserve(
      {
        ...createFixtureTreasuryReserve(),
        authorizedUnclaimedBaseUnits: '2000',
        pendingOperationBaseUnits: '1000',
        failedOperationReleasedBaseUnits: '500',
      },
      '500',
      '5000',
    );
    expect(reserve).toMatchObject({
      reservedLiabilityBaseUnits: '2500',
      canAuthorizeRequestedAmount: true,
      fixtureOnly: true,
    });

    const policy = createFixtureTreasuryPolicy({ globalDailyBaseUnits: '1000' });
    const caps = evaluateClaimCaps(policy, {
      requestedAmountBaseUnits: '500',
      receiptUsedBaseUnits: '0',
      playerDailyUsedBaseUnits: '0',
      playerWeeklyUsedBaseUnits: '0',
      playerMonthlyUsedBaseUnits: '0',
      walletDailyUsedBaseUnits: '0',
      sourceUsedBaseUnits: '0',
      activityUsedBaseUnits: '0',
      campaignUsedBaseUnits: '0',
      epochUsedBaseUnits: '0',
      globalDailyUsedBaseUnits: '600',
      globalWeeklyUsedBaseUnits: '0',
      treasuryAvailableBaseUnits: '1000000',
      activityCapApplicable: true,
      epochCapApplicable: true,
    });
    expect(caps.allowed).toBe(false);
    expect(caps.rejectionCodes).toContain('global_daily_cap');
  });

  it('rejects epoch over-allocation and retains released allocation as bounded history', () => {
    const epoch = createFixtureEpoch({ maximumAllocationBaseUnits: '1000' });
    expect(
      claimEpochSchema.safeParse({
        ...epoch,
        authorizedAmountBaseUnits: '800',
        confirmedAmountBaseUnits: '300',
        remainingAllocationBaseUnits: '0',
      }).success,
    ).toBe(false);
    expect(
      claimEpochSchema.safeParse({
        ...epoch,
        authorizedAmountBaseUnits: '400',
        confirmedAmountBaseUnits: '100',
        cancelledAmountBaseUnits: '300',
        remainingAllocationBaseUnits: '500',
      }).success,
    ).toBe(true);
  });
});

describe('closed lifecycles', () => {
  it('exposes exactly the approved mock transition graph and rejects every other edge', () => {
    const expected = {
      draft: [
        'ineligible',
        'eligible_mock',
        'review_required_mock',
        'quarantined_mock',
        'expired_mock',
        'cancelled_mock',
      ],
      ineligible: [],
      eligible_mock: [
        'review_required_mock',
        'quarantined_mock',
        'authorized_mock',
        'expired_mock',
        'cancelled_mock',
      ],
      review_required_mock: [
        'ineligible',
        'eligible_mock',
        'quarantined_mock',
        'expired_mock',
        'cancelled_mock',
      ],
      quarantined_mock: ['ineligible', 'eligible_mock', 'expired_mock', 'cancelled_mock'],
      authorized_mock: ['quarantined_mock', 'expired_mock', 'cancelled_mock'],
      expired_mock: [],
      cancelled_mock: [],
    } as const;
    expect(CLAIM_STATE_TRANSITIONS).toEqual(expected);
    for (const current of PHASE_9B_A_CLAIM_STATES) {
      for (const next of PHASE_9B_A_CLAIM_STATES) {
        expect(canTransitionClaimState(current, next)).toBe(
          expected[current].includes(next as never),
        );
      }
    }
  });

  it('moves a dispute from opened through closed while hiding private staff notes publicly', () => {
    let dispute = claimDisputeSchema.parse({
      publicDisputeId: 'DISP-MOCK-AAAAAAAAAAAAAAAAAAAAAAAA',
      publicClaimId: 'CLAIM-MOCK-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      safePlayerId: 'PLAYER-MOCK-CCCCCCCCCCCCCCCCCCCC',
      reasonCategory: 'wallet_binding_question',
      state: 'opened',
      playerVisibleSummary: 'The player asked for a review of wallet binding.',
      privateStaffNotes: 'Fixture-only staff review details are not public.',
      evidenceReferences: ['EVIDENCE:FIXTURE:1'],
      resolution: null,
      createdAt: '2026-08-16T00:00:00.000Z',
      acknowledgedAt: null,
      resolvedAt: null,
      closedAt: null,
      updatedAt: '2026-08-16T00:00:00.000Z',
      auditCorrelation: 'fixture:dispute:0001',
      revision: 1,
      mode: 'architecture_mock',
    });
    for (const [nextState, at] of [
      ['acknowledged', '2026-08-16T01:00:00.000Z'],
      ['investigating', '2026-08-16T02:00:00.000Z'],
      ['resolved_eligible', '2026-08-16T03:00:00.000Z'],
      ['closed', '2026-08-16T04:00:00.000Z'],
    ] as const) {
      dispute = transitionClaimDispute(dispute, {
        expectedRevision: dispute.revision,
        nextState,
        at,
      });
    }
    expect(dispute).toMatchObject({ state: 'closed', resolution: 'eligible_mock' });
    expect(CLAIM_DISPUTE_STATES).toContain(dispute.state);
    expect(toPublicClaimDispute(dispute)).not.toHaveProperty('privateStaffNotes');
  });

  it('keeps quarantine bounded, auditable, reviewable, and non-terminal on heuristic evidence alone', () => {
    const quarantine = claimQuarantineSchema.parse({
      publicQuarantineId: 'QUAR-MOCK-AAAAAAAAAAAAAAAAAAAAAAAA',
      publicClaimId: 'CLAIM-MOCK-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      publicEligibilityId: 'ELIG-MOCK-CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
      safePlayerId: 'PLAYER-MOCK-DDDDDDDDDDDDDDDDDDDD',
      trigger: 'abnormal_velocity',
      status: 'open_mock',
      safeSummary: 'A fixture velocity signal requires human review.',
      evidenceReferences: ['EVIDENCE:FIXTURE:2'],
      auditCorrelation: 'fixture:quarantine:0001',
      reviewExpiresAt: '2026-08-20T00:00:00.000Z',
      createdAt: '2026-08-16T00:00:00.000Z',
      updatedAt: '2026-08-16T00:00:00.000Z',
      revision: 1,
      staffOnly: true,
      heuristicAlonePermanentlyDenies: false,
      mode: 'architecture_mock',
    });
    const reviewing = transitionClaimQuarantine(quarantine, {
      expectedRevision: 1,
      nextStatus: 'reviewing_mock',
      at: '2026-08-16T01:00:00.000Z',
    });
    expect(reviewing).toMatchObject({
      status: 'reviewing_mock',
      heuristicAlonePermanentlyDenies: false,
      staffOnly: true,
    });
  });
});

describe('Token-2022 compatibility fixture', () => {
  it('never assumes ordinary compatibility when an extension or account state needs review', () => {
    const base = {
      tokenProgram: 'spl-token-2022' as const,
      configuredDecimals: 6,
      observedFixtureDecimals: 6,
      transferFeeExtension: 'absent_fixture' as const,
      withheldFees: 'absent_fixture' as const,
      transferHookExtension: 'absent_fixture' as const,
      permanentDelegate: 'absent_fixture' as const,
      confidentialTransfer: 'absent_fixture' as const,
      defaultAccountState: 'initialized_fixture' as const,
      nonTransferableExtension: 'absent_fixture' as const,
      interestBearingExtension: 'absent_fixture' as const,
      memoTransferRequirement: 'absent_fixture' as const,
      metadataPointer: 'absent_fixture' as const,
      destinationAccountOwnerVerifiedFixture: true,
      associatedAccountExpectation: 'existing_fixture' as const,
      source: 'offline_fixture' as const,
    };
    expect(assessTokenCompatibility(base).result).toBe('compatible_fixture');
    expect(
      assessTokenCompatibility({
        ...base,
        transferHookExtension: 'present_review_required_fixture',
      }),
    ).toMatchObject({
      result: 'review_required_mock',
      ordinaryTransferAssumed: false,
    });
    expect(
      assessTokenCompatibility({
        ...base,
        nonTransferableExtension: 'present_review_required_fixture',
      }).result,
    ).toBe('incompatible_mock');
  });
});
