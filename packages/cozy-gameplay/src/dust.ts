import { z } from 'zod';

import {
  dustAmountSchema,
  dustDeltaSchema,
  identifierSchema,
  idempotencyKeySchema,
  paginationMetaSchema,
  requestIdSchema,
  safeTextSchema,
  stateVersionSchema,
  timestampSchema,
} from './common';

export const DUST_LEDGER_REASONS = [
  'starter_grant',
  'shop_purchase',
  'shop_sale',
  'crafting_fee',
  'system_refund',
  'migration_adjustment',
] as const;
export const dustLedgerReasonSchema = z.enum(DUST_LEDGER_REASONS);
export const dustReferenceTypeSchema = z.enum([
  'player_bootstrap',
  'shop_transaction',
  'recipe_action',
  'system_operation',
  'migration',
]);

export const dustAccountSchema = z
  .object({
    playerId: identifierSchema,
    balance: dustAmountSchema,
    stateVersion: stateVersionSchema,
    starterGrantAppliedAt: timestampSchema.nullable(),
    updatedAt: timestampSchema,
  })
  .strict();

export const dustLedgerEntrySchema = z
  .object({
    id: identifierSchema,
    delta: dustDeltaSchema,
    resultingBalance: dustAmountSchema,
    reason: dustLedgerReasonSchema,
    referenceType: dustReferenceTypeSchema,
    referenceId: safeTextSchema(1, 128).nullable(),
    requestId: requestIdSchema,
    createdAt: timestampSchema,
  })
  .strict();

export const dustLedgerPageSchema = z
  .object({ items: z.array(dustLedgerEntrySchema).max(100), pagination: paginationMetaSchema })
  .strict();

export const dustMutationReceiptSchema = z
  .object({
    account: dustAccountSchema,
    ledgerEntryId: identifierSchema,
    idempotencyKey: idempotencyKeySchema,
    replayed: z.boolean(),
  })
  .strict();

export type DustAccount = z.infer<typeof dustAccountSchema>;
export type DustLedgerEntry = z.infer<typeof dustLedgerEntrySchema>;
export type DustLedgerPage = z.infer<typeof dustLedgerPageSchema>;
export type DustMutationReceipt = z.infer<typeof dustMutationReceiptSchema>;
