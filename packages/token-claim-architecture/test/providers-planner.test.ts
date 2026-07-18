// PHASE9BA_NONFUNCTIONAL_SECURITY_FIXTURE: security-shaped text is inert test evidence.
import { describe, expect, it } from 'vitest';

import {
  assessTokenCompatibility,
  ClaimArchitectureDisabledError,
  createClaimInstructionPlan,
  createFixtureEligibilityCore,
  createFixtureWallet,
  createMockClaimId,
  createMockEligibility,
  createMockNonce,
  DisabledSignerProvider,
  MockSignerProvider,
  mockProviderArtifactSchema,
  type ClaimAuthorizationPayload,
} from '../src';

function authorizationPayload(): ClaimAuthorizationPayload {
  const eligibility = createMockEligibility(createFixtureEligibilityCore());
  const claimPublicId = createMockClaimId(eligibility.publicEligibilityId);
  return {
    authorizationVersion: 1,
    domainSeparator: 'starville.token-claim-authorization.architecture-mock.v1',
    claimPublicId,
    eligibilityPublicId: eligibility.publicEligibilityId,
    safePlayerId: eligibility.safePlayerId,
    recipientWallet: eligibility.verifiedRecipientWallet,
    tokenMint: eligibility.tokenMint,
    tokenProgram: eligibility.tokenProgram,
    network: eligibility.network,
    amountBaseUnits: eligibility.amountBaseUnits,
    decimals: eligibility.decimals,
    policyVersion: eligibility.policyVersion,
    epochId: eligibility.epochId,
    nonce: createMockNonce(claimPublicId, 1),
    issuedAt: '2026-08-16T12:00:00.000Z',
    expiresAt: '2026-08-16T12:15:00.000Z',
    treasuryIdentifier: 'fixture-reviewed-multisig',
    sourceReceiptDigest: eligibility.sourceReceiptDigest,
  };
}

function compatibleAssessment() {
  return assessTokenCompatibility({
    tokenProgram: 'spl-token-2022',
    configuredDecimals: 6,
    observedFixtureDecimals: 6,
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
}

describe('disabled and mock providers', () => {
  it('exposes no connection or secret input and rejects both artifact creation and delivery', () => {
    const provider = new DisabledSignerProvider();
    expect(provider.status()).toEqual({
      mode: 'disabled',
      connected: false,
      treasuryConnected: false,
      secretInputSupported: false,
      liveCryptographyAvailable: false,
      deliveryEnabled: false,
      networkAccessAvailable: false,
      statusLabel: 'DISABLED',
    });
    expect(() => provider.createAuthorizationArtifact(authorizationPayload())).toThrow(
      ClaimArchitectureDisabledError,
    );
    expect(() => provider.requestDelivery({} as never)).toThrow(ClaimArchitectureDisabledError);
  });

  it('produces deterministic non-cryptographic fixture markers and can never deliver them', () => {
    const provider = new MockSignerProvider();
    const first = provider.createAuthorizationArtifact(authorizationPayload());
    const second = provider.createAuthorizationArtifact(authorizationPayload());
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      artifactKind: 'non_cryptographic_fixture_marker',
      validOnChain: false,
      fixtureOnly: true,
    });
    expect(provider.status()).toMatchObject({
      connected: false,
      treasuryConnected: false,
      liveCryptographyAvailable: false,
      deliveryEnabled: false,
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.authorization)).toBe(true);
    expect(Object.isFrozen(first.authorization.payload)).toBe(true);
    expect(() => {
      (
        first.authorization.payload as {
          amountBaseUnits: string;
        }
      ).amountBaseUnits = '999';
    }).toThrow(TypeError);
    expect(() =>
      mockProviderArtifactSchema.parse({
        ...first,
        authorization: {
          ...first.authorization,
          payload: { ...first.authorization.payload, amountBaseUnits: '999' },
        },
      }),
    ).toThrow();
    expect(
      mockProviderArtifactSchema.safeParse({
        ...first,
        authorization: {
          ...first.authorization,
          fixtureIntegrityTag: `FIXTURE-${'A'.repeat(32)}`,
        },
      }).success,
    ).toBe(false);
    expect(
      mockProviderArtifactSchema.safeParse({
        ...first,
        authorization: {
          ...first.authorization,
          authorizedAt: '2026-08-16T12:00:01.000Z',
        },
      }).success,
    ).toBe(false);
  });
});

describe('offline instruction planner', () => {
  it('binds every authoritative field, remains deterministic, and never accesses network APIs', () => {
    const artifact = new MockSignerProvider().createAuthorizationArtifact(authorizationPayload());
    const payload = artifact.authorization.payload;
    const input = {
      recipientWallet: payload.recipientWallet,
      tokenMint: payload.tokenMint,
      network: payload.network,
      amountBaseUnits: payload.amountBaseUnits,
      decimals: payload.decimals,
      tokenProgram: payload.tokenProgram,
      destinationAccountExpectation: 'existing_associated_account_fixture' as const,
      publicAuthorizationId: artifact.authorization.publicAuthorizationId,
      publicClaimId: payload.claimPublicId,
      fixtureFeeEstimateLamports: '5000',
      fixtureComputeEstimateUnits: 80_000,
      claimState: 'authorized_mock' as const,
      evaluatedAt: '2026-08-16T12:05:00.000Z',
      authorization: artifact.authorization,
      tokenCompatibility: compatibleAssessment(),
    };
    const first = createClaimInstructionPlan(input);
    const second = createClaimInstructionPlan(input);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      valid: true,
      reportLabel: 'OFFLINE SIMULATION',
      blockchainNotice: 'NO BLOCKCHAIN TRANSACTION WAS SENT',
      networkAccessed: false,
      walletApprovalRequested: false,
      liveExecutionEnabled: false,
      broadcastReady: false,
    });
    expect(Object.keys(first).sort()).toEqual(
      [
        'amountBaseUnits',
        'blockchainNotice',
        'broadcastReady',
        'decimals',
        'destinationAccountExpectation',
        'fixtureComputeEstimateUnits',
        'fixtureFeeEstimateLamports',
        'fixtureOnly',
        'claimState',
        'evaluatedAt',
        'liveExecutionEnabled',
        'mode',
        'network',
        'networkAccessed',
        'planId',
        'publicAuthorizationId',
        'publicClaimId',
        'recipientWallet',
        'reportLabel',
        'tokenMint',
        'tokenProgram',
        'valid',
        'validationFindings',
        'walletApprovalRequested',
      ].sort(),
    );
    expect(() => new MockSignerProvider().requestDelivery(first)).toThrow(
      ClaimArchitectureDisabledError,
    );
  });

  it('fails closed when any bound field changes or Token-2022 review is unresolved', () => {
    const artifact = new MockSignerProvider().createAuthorizationArtifact(authorizationPayload());
    const payload = artifact.authorization.payload;
    const plan = createClaimInstructionPlan({
      recipientWallet: createFixtureWallet(500),
      tokenMint: payload.tokenMint,
      network: payload.network,
      amountBaseUnits: payload.amountBaseUnits,
      decimals: payload.decimals,
      tokenProgram: payload.tokenProgram,
      destinationAccountExpectation: 'manual_review_required_fixture',
      publicAuthorizationId: artifact.authorization.publicAuthorizationId,
      publicClaimId: payload.claimPublicId,
      fixtureFeeEstimateLamports: '5000',
      fixtureComputeEstimateUnits: 80_000,
      claimState: 'cancelled_mock',
      evaluatedAt: '2026-08-16T12:15:00.000Z',
      authorization: artifact.authorization,
      tokenCompatibility: {
        ...compatibleAssessment(),
        result: 'review_required_mock',
        findingCodes: ['transfer_hook_review'],
      },
    });
    expect(plan.valid).toBe(false);
    expect(plan.validationFindings).toEqual([
      'authorization_binding_mismatch',
      'claim_state_not_authorized',
      'authorization_expired',
      'token_compatibility_review_required',
      'destination_account_review_required',
    ]);
  });
});
