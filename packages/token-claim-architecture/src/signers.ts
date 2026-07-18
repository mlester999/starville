import { z } from 'zod';

import {
  deterministicFixtureDigest,
  immutableArchitectureCopy,
  NO_BLOCKCHAIN_ACTION_NOTICE,
  OFFLINE_SIMULATION_LABEL,
} from './common';
import {
  claimAuthorizationPayloadSchema,
  createMockAuthorizationSnapshot,
  mockAuthorizationSnapshotSchema,
  type ClaimAuthorizationPayload,
} from './authorization';
import { claimInstructionPlanSchema, type ClaimInstructionPlan } from './offline-planner';

export const architectureProviderStatusSchema = z
  .object({
    mode: z.enum(['disabled', 'mock_fixture']),
    connected: z.literal(false),
    treasuryConnected: z.literal(false),
    secretInputSupported: z.literal(false),
    liveCryptographyAvailable: z.literal(false),
    deliveryEnabled: z.literal(false),
    networkAccessAvailable: z.literal(false),
    statusLabel: z.enum(['DISABLED', 'MOCK FIXTURE — NON-CRYPTOGRAPHIC']),
  })
  .strict();
export type ArchitectureProviderStatus = z.infer<typeof architectureProviderStatusSchema>;

export class ClaimArchitectureDisabledError extends Error {
  readonly code: 'TOKEN_CLAIMS_DISABLED' | 'BLOCKCHAIN_DELIVERY_DISABLED';

  constructor(code: 'TOKEN_CLAIMS_DISABLED' | 'BLOCKCHAIN_DELIVERY_DISABLED') {
    super(
      code === 'TOKEN_CLAIMS_DISABLED' ? 'Token claims are disabled.' : NO_BLOCKCHAIN_ACTION_NOTICE,
    );
    this.name = 'ClaimArchitectureDisabledError';
    this.code = code;
  }
}

export const mockProviderArtifactSchema = z
  .object({
    artifactId: z.string().regex(/^PROVIDER-MOCK-[A-F0-9]{32}$/u),
    artifactKind: z.literal('non_cryptographic_fixture_marker'),
    authorization: mockAuthorizationSnapshotSchema,
    reportLabel: z.literal(OFFLINE_SIMULATION_LABEL),
    blockchainNotice: z.literal(NO_BLOCKCHAIN_ACTION_NOTICE),
    validOnChain: z.literal(false),
    fixtureOnly: z.literal(true),
  })
  .strict();
export type MockProviderArtifact = z.infer<typeof mockProviderArtifactSchema>;

export class DisabledSignerProvider {
  readonly mode = 'disabled' as const;

  status(): ArchitectureProviderStatus {
    return architectureProviderStatusSchema.parse({
      mode: this.mode,
      connected: false,
      treasuryConnected: false,
      secretInputSupported: false,
      liveCryptographyAvailable: false,
      deliveryEnabled: false,
      networkAccessAvailable: false,
      statusLabel: 'DISABLED',
    });
  }

  createAuthorizationArtifact(_payload: ClaimAuthorizationPayload): never {
    throw new ClaimArchitectureDisabledError('TOKEN_CLAIMS_DISABLED');
  }

  requestDelivery(_plan: ClaimInstructionPlan): never {
    throw new ClaimArchitectureDisabledError('BLOCKCHAIN_DELIVERY_DISABLED');
  }
}

export class MockSignerProvider {
  readonly mode = 'mock_fixture' as const;

  status(): ArchitectureProviderStatus {
    return architectureProviderStatusSchema.parse({
      mode: this.mode,
      connected: false,
      treasuryConnected: false,
      secretInputSupported: false,
      liveCryptographyAvailable: false,
      deliveryEnabled: false,
      networkAccessAvailable: false,
      statusLabel: 'MOCK FIXTURE — NON-CRYPTOGRAPHIC',
    });
  }

  createAuthorizationArtifact(rawPayload: ClaimAuthorizationPayload): MockProviderArtifact {
    const payload = claimAuthorizationPayloadSchema.parse(rawPayload);
    const authorization = createMockAuthorizationSnapshot(payload);
    return immutableArchitectureCopy(
      mockProviderArtifactSchema.parse({
        artifactId: `PROVIDER-MOCK-${deterministicFixtureDigest(
          'starville.mock.provider-artifact.v1',
          [authorization.canonicalPayload],
        )}`,
        artifactKind: 'non_cryptographic_fixture_marker',
        authorization,
        reportLabel: OFFLINE_SIMULATION_LABEL,
        blockchainNotice: NO_BLOCKCHAIN_ACTION_NOTICE,
        validOnChain: false,
        fixtureOnly: true,
      }),
    );
  }

  requestDelivery(rawPlan: ClaimInstructionPlan): never {
    claimInstructionPlanSchema.parse(rawPlan);
    throw new ClaimArchitectureDisabledError('BLOCKCHAIN_DELIVERY_DISABLED');
  }
}
