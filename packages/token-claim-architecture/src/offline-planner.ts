import { z } from 'zod';

import {
  deterministicFixtureDigest,
  immutableArchitectureCopy,
  lamportsSchema,
  NO_BLOCKCHAIN_ACTION_NOTICE,
  OFFLINE_SIMULATION_LABEL,
  publicAuthorizationIdSchema,
  publicClaimIdSchema,
  tokenBaseUnitsSchema,
  tokenDecimalsSchema,
  tokenProgramTypeSchema,
  timestampSchema,
  walletAddressSchema,
  walletNetworkSchema,
} from './common';
import { mockAuthorizationSnapshotSchema } from './authorization';
import { phase9BAClaimStateSchema } from './state-machine';
import { tokenCompatibilityAssessmentSchema } from './token-compatibility';

export const claimInstructionPlanInputSchema = z
  .object({
    recipientWallet: walletAddressSchema,
    tokenMint: walletAddressSchema,
    network: walletNetworkSchema,
    amountBaseUnits: tokenBaseUnitsSchema,
    decimals: tokenDecimalsSchema,
    tokenProgram: tokenProgramTypeSchema,
    destinationAccountExpectation: z.enum([
      'existing_associated_account_fixture',
      'account_creation_review_required_fixture',
      'manual_review_required_fixture',
    ]),
    publicAuthorizationId: publicAuthorizationIdSchema,
    publicClaimId: publicClaimIdSchema,
    fixtureFeeEstimateLamports: lamportsSchema,
    fixtureComputeEstimateUnits: z.number().int().min(1_000).max(1_400_000),
    claimState: phase9BAClaimStateSchema,
    evaluatedAt: timestampSchema,
    authorization: mockAuthorizationSnapshotSchema,
    tokenCompatibility: tokenCompatibilityAssessmentSchema,
  })
  .strict();
export type ClaimInstructionPlanInput = z.infer<typeof claimInstructionPlanInputSchema>;

export const claimInstructionPlanSchema = z
  .object({
    planId: z.string().regex(/^PLAN-MOCK-[A-F0-9]{32}$/u),
    mode: z.literal('offline_architecture'),
    reportLabel: z.literal(OFFLINE_SIMULATION_LABEL),
    blockchainNotice: z.literal(NO_BLOCKCHAIN_ACTION_NOTICE),
    recipientWallet: walletAddressSchema,
    tokenMint: walletAddressSchema,
    network: walletNetworkSchema,
    amountBaseUnits: tokenBaseUnitsSchema,
    decimals: tokenDecimalsSchema,
    tokenProgram: tokenProgramTypeSchema,
    destinationAccountExpectation:
      claimInstructionPlanInputSchema.shape.destinationAccountExpectation,
    publicAuthorizationId: publicAuthorizationIdSchema,
    publicClaimId: publicClaimIdSchema,
    fixtureFeeEstimateLamports: lamportsSchema,
    fixtureComputeEstimateUnits: z.number().int().min(1_000).max(1_400_000),
    claimState: phase9BAClaimStateSchema,
    evaluatedAt: timestampSchema,
    valid: z.boolean(),
    validationFindings: z.array(
      z.enum([
        'authorization_binding_mismatch',
        'authorization_expired',
        'claim_state_not_authorized',
        'token_compatibility_review_required',
        'destination_account_review_required',
      ]),
    ),
    networkAccessed: z.literal(false),
    walletApprovalRequested: z.literal(false),
    liveExecutionEnabled: z.literal(false),
    broadcastReady: z.literal(false),
    fixtureOnly: z.literal(true),
  })
  .strict();
export type ClaimInstructionPlan = z.infer<typeof claimInstructionPlanSchema>;

export function createClaimInstructionPlan(
  rawInput: ClaimInstructionPlanInput,
): ClaimInstructionPlan {
  const input = claimInstructionPlanInputSchema.parse(rawInput);
  const payload = input.authorization.payload;
  const findings: ClaimInstructionPlan['validationFindings'][number][] = [];
  if (
    input.publicAuthorizationId !== input.authorization.publicAuthorizationId ||
    input.publicClaimId !== payload.claimPublicId ||
    input.recipientWallet !== payload.recipientWallet ||
    input.tokenMint !== payload.tokenMint ||
    input.tokenProgram !== payload.tokenProgram ||
    input.network !== payload.network ||
    input.amountBaseUnits !== payload.amountBaseUnits ||
    input.decimals !== payload.decimals
  ) {
    findings.push('authorization_binding_mismatch');
  }
  if (input.claimState !== 'authorized_mock') findings.push('claim_state_not_authorized');
  if (Date.parse(input.evaluatedAt) >= Date.parse(payload.expiresAt)) {
    findings.push('authorization_expired');
  }
  if (input.tokenCompatibility.result !== 'compatible_fixture') {
    findings.push('token_compatibility_review_required');
  }
  if (input.destinationAccountExpectation !== 'existing_associated_account_fixture') {
    findings.push('destination_account_review_required');
  }
  const planId = `PLAN-MOCK-${deterministicFixtureDigest('starville.mock.plan.v1', [
    input.authorization.canonicalPayload,
    input.tokenProgram,
    input.fixtureFeeEstimateLamports,
    input.fixtureComputeEstimateUnits.toString(),
    input.claimState,
    input.evaluatedAt,
  ])}`;
  return immutableArchitectureCopy(
    claimInstructionPlanSchema.parse({
      planId,
      mode: 'offline_architecture',
      reportLabel: OFFLINE_SIMULATION_LABEL,
      blockchainNotice: NO_BLOCKCHAIN_ACTION_NOTICE,
      recipientWallet: input.recipientWallet,
      tokenMint: input.tokenMint,
      network: input.network,
      amountBaseUnits: input.amountBaseUnits,
      decimals: input.decimals,
      tokenProgram: input.tokenProgram,
      destinationAccountExpectation: input.destinationAccountExpectation,
      publicAuthorizationId: input.publicAuthorizationId,
      publicClaimId: input.publicClaimId,
      fixtureFeeEstimateLamports: input.fixtureFeeEstimateLamports,
      fixtureComputeEstimateUnits: input.fixtureComputeEstimateUnits,
      claimState: input.claimState,
      evaluatedAt: input.evaluatedAt,
      valid: findings.length === 0,
      validationFindings: findings,
      networkAccessed: false,
      walletApprovalRequested: false,
      liveExecutionEnabled: false,
      broadcastReady: false,
      fixtureOnly: true,
    }),
  );
}
