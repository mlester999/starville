import { z } from 'zod';

import { tokenDecimalsSchema, tokenProgramTypeSchema } from './common';

const fixtureExtensionStateSchema = z.enum([
  'absent_fixture',
  'present_review_required_fixture',
  'unknown_fixture',
]);

export const tokenCompatibilityFixtureInputSchema = z
  .object({
    tokenProgram: tokenProgramTypeSchema,
    configuredDecimals: tokenDecimalsSchema,
    observedFixtureDecimals: tokenDecimalsSchema,
    transferFeeExtension: fixtureExtensionStateSchema,
    withheldFees: fixtureExtensionStateSchema,
    transferHookExtension: fixtureExtensionStateSchema,
    permanentDelegate: fixtureExtensionStateSchema,
    confidentialTransfer: fixtureExtensionStateSchema,
    defaultAccountState: z.enum(['initialized_fixture', 'frozen_fixture', 'unknown_fixture']),
    nonTransferableExtension: fixtureExtensionStateSchema,
    interestBearingExtension: fixtureExtensionStateSchema,
    memoTransferRequirement: fixtureExtensionStateSchema,
    metadataPointer: fixtureExtensionStateSchema,
    destinationAccountOwnerVerifiedFixture: z.boolean(),
    associatedAccountExpectation: z.enum([
      'existing_fixture',
      'creation_would_be_required_fixture',
      'unknown_fixture',
    ]),
    source: z.literal('offline_fixture'),
  })
  .strict();
export type TokenCompatibilityFixtureInput = z.infer<typeof tokenCompatibilityFixtureInputSchema>;

export const tokenCompatibilityAssessmentSchema = z
  .object({
    result: z.enum(['compatible_fixture', 'review_required_mock', 'incompatible_mock']),
    findingCodes: z.array(
      z.enum([
        'decimals_mismatch',
        'destination_owner_unverified',
        'destination_frozen',
        'destination_state_unknown',
        'associated_account_review',
        'transfer_fee_review',
        'withheld_fee_review',
        'transfer_hook_review',
        'permanent_delegate_review',
        'confidential_transfer_review',
        'non_transferable',
        'interest_bearing_review',
        'memo_requirement_review',
        'metadata_pointer_review',
        'extension_state_unknown',
      ]),
    ),
    fixtureOnly: z.literal(true),
    ordinaryTransferAssumed: z.literal(false),
  })
  .strict();
export type TokenCompatibilityAssessment = z.infer<typeof tokenCompatibilityAssessmentSchema>;

export function assessTokenCompatibility(
  rawInput: TokenCompatibilityFixtureInput,
): TokenCompatibilityAssessment {
  const input = tokenCompatibilityFixtureInputSchema.parse(rawInput);
  const findings: TokenCompatibilityAssessment['findingCodes'][number][] = [];
  if (input.configuredDecimals !== input.observedFixtureDecimals) {
    findings.push('decimals_mismatch');
  }
  if (!input.destinationAccountOwnerVerifiedFixture) {
    findings.push('destination_owner_unverified');
  }
  if (input.defaultAccountState === 'frozen_fixture') findings.push('destination_frozen');
  if (input.defaultAccountState === 'unknown_fixture') findings.push('destination_state_unknown');
  if (input.associatedAccountExpectation !== 'existing_fixture') {
    findings.push('associated_account_review');
  }

  if (input.tokenProgram === 'spl-token-2022') {
    const extensionChecks = [
      ['transferFeeExtension', 'transfer_fee_review'],
      ['withheldFees', 'withheld_fee_review'],
      ['transferHookExtension', 'transfer_hook_review'],
      ['permanentDelegate', 'permanent_delegate_review'],
      ['confidentialTransfer', 'confidential_transfer_review'],
      ['nonTransferableExtension', 'non_transferable'],
      ['interestBearingExtension', 'interest_bearing_review'],
      ['memoTransferRequirement', 'memo_requirement_review'],
      ['metadataPointer', 'metadata_pointer_review'],
    ] as const;
    for (const [field, code] of extensionChecks) {
      if (input[field] === 'present_review_required_fixture') findings.push(code);
      if (input[field] === 'unknown_fixture') findings.push('extension_state_unknown');
    }
  }

  const incompatible = findings.some((finding) =>
    [
      'decimals_mismatch',
      'destination_owner_unverified',
      'destination_frozen',
      'non_transferable',
    ].includes(finding),
  );
  return tokenCompatibilityAssessmentSchema.parse({
    result:
      findings.length === 0
        ? 'compatible_fixture'
        : incompatible
          ? 'incompatible_mock'
          : 'review_required_mock',
    findingCodes: [...new Set(findings)],
    fixtureOnly: true,
    ordinaryTransferAssumed: false,
  });
}
