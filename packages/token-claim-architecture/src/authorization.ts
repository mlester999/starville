import { z } from 'zod';

import {
  deterministicFixtureDigest,
  immutableArchitectureCopy,
  mockNonceSchema,
  policyVersionSchema,
  publicAuthorizationIdSchema,
  publicClaimIdSchema,
  publicEligibilityIdSchema,
  publicEpochIdSchema,
  safePlayerIdSchema,
  sourceReceiptDigestSchema,
  timestampSchema,
  tokenBaseUnitsSchema,
  tokenDecimalsSchema,
  tokenProgramTypeSchema,
  treasuryIdentifierSchema,
  walletAddressSchema,
  walletNetworkSchema,
} from './common';

export const CLAIM_AUTHORIZATION_DOMAIN =
  'starville.token-claim-authorization.architecture-mock.v1' as const;

export const claimAuthorizationPayloadSchema = z
  .object({
    authorizationVersion: z.literal(1),
    domainSeparator: z.literal(CLAIM_AUTHORIZATION_DOMAIN),
    claimPublicId: publicClaimIdSchema,
    eligibilityPublicId: publicEligibilityIdSchema,
    safePlayerId: safePlayerIdSchema,
    recipientWallet: walletAddressSchema,
    tokenMint: walletAddressSchema,
    tokenProgram: tokenProgramTypeSchema,
    network: walletNetworkSchema,
    amountBaseUnits: tokenBaseUnitsSchema,
    decimals: tokenDecimalsSchema,
    policyVersion: policyVersionSchema,
    epochId: publicEpochIdSchema.nullable(),
    nonce: mockNonceSchema,
    issuedAt: timestampSchema,
    expiresAt: timestampSchema,
    treasuryIdentifier: treasuryIdentifierSchema,
    sourceReceiptDigest: sourceReceiptDigestSchema,
  })
  .strict()
  .refine((value) => Date.parse(value.expiresAt) > Date.parse(value.issuedAt), {
    path: ['expiresAt'],
    message: 'Mock authorization expiry must follow its issue time.',
  });
export type ClaimAuthorizationPayload = z.infer<typeof claimAuthorizationPayloadSchema>;

export const CANONICAL_AUTHORIZATION_FIELDS = [
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
] as const satisfies readonly (keyof ClaimAuthorizationPayload)[];

export function serializeCanonicalAuthorizationPayload(
  rawPayload: ClaimAuthorizationPayload,
): string {
  const payload = claimAuthorizationPayloadSchema.parse(rawPayload);
  return CANONICAL_AUTHORIZATION_FIELDS.map((key) => {
    const rawValue = payload[key];
    const value = rawValue === null ? '~' : String(rawValue);
    return `${key.length}:${key}:${value.length}:${value}`;
  }).join('\n');
}

export function createMockNonce(claimPublicId: string, attempt: number): string {
  const claimId = publicClaimIdSchema.parse(claimPublicId);
  const boundedAttempt = z.number().int().min(1).max(1_000_000).parse(attempt);
  return mockNonceSchema.parse(
    `NONCE-MOCK-${deterministicFixtureDigest('starville.mock.nonce.v1', [
      claimId,
      boundedAttempt.toString(),
    ])}`,
  );
}

export function createMockAuthorizationId(payload: ClaimAuthorizationPayload): string {
  const canonical = serializeCanonicalAuthorizationPayload(payload);
  return publicAuthorizationIdSchema.parse(
    `AUTH-MOCK-${deterministicFixtureDigest('starville.mock.authorization-id.v1', [canonical])}`,
  );
}

function createFixtureIntegrityTag(canonicalPayload: string): string {
  return `FIXTURE-${deterministicFixtureDigest('starville.mock.authorization-integrity.v1', [
    canonicalPayload,
  ])}`;
}

export const mockAuthorizationSnapshotSchema = z
  .object({
    publicAuthorizationId: publicAuthorizationIdSchema,
    payload: claimAuthorizationPayloadSchema,
    canonicalPayload: z.string().min(100).max(4_096),
    fixtureIntegrityTag: z.string().regex(/^FIXTURE-[A-F0-9]{32}$/u),
    authorizedAt: timestampSchema,
    immutable: z.literal(true),
    liveCryptographyUsed: z.literal(false),
    networkAccessed: z.literal(false),
    usableForBlockchainSettlement: z.literal(false),
    mode: z.literal('architecture_mock'),
  })
  .strict()
  .superRefine((value, context) => {
    const canonical = serializeCanonicalAuthorizationPayload(value.payload);
    if (value.canonicalPayload !== canonical) {
      context.addIssue({
        code: 'custom',
        path: ['canonicalPayload'],
        message: 'Canonical payload bytes do not match the immutable mock payload.',
      });
    }
    if (value.publicAuthorizationId !== createMockAuthorizationId(value.payload)) {
      context.addIssue({
        code: 'custom',
        path: ['publicAuthorizationId'],
        message: 'Mock authorization ID is not deterministic for this payload.',
      });
    }
    if (value.fixtureIntegrityTag !== createFixtureIntegrityTag(canonical)) {
      context.addIssue({
        code: 'custom',
        path: ['fixtureIntegrityTag'],
        message: 'Fixture integrity tag is not deterministic for this canonical payload.',
      });
    }
    if (value.authorizedAt !== value.payload.issuedAt) {
      context.addIssue({
        code: 'custom',
        path: ['authorizedAt'],
        message: 'Mock authorization time must equal the canonical payload issue time.',
      });
    }
  });
export type MockAuthorizationSnapshot = z.infer<typeof mockAuthorizationSnapshotSchema>;

export function createMockAuthorizationSnapshot(
  rawPayload: ClaimAuthorizationPayload,
): MockAuthorizationSnapshot {
  const payload = claimAuthorizationPayloadSchema.parse(rawPayload);
  const canonicalPayload = serializeCanonicalAuthorizationPayload(payload);
  return immutableArchitectureCopy(
    mockAuthorizationSnapshotSchema.parse({
      publicAuthorizationId: createMockAuthorizationId(payload),
      payload,
      canonicalPayload,
      fixtureIntegrityTag: createFixtureIntegrityTag(canonicalPayload),
      authorizedAt: payload.issuedAt,
      immutable: true,
      liveCryptographyUsed: false,
      networkAccessed: false,
      usableForBlockchainSettlement: false,
      mode: 'architecture_mock',
    }),
  );
}
