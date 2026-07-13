import { z } from 'zod';

export const PHASE_7_CONTENT_VERSION = 1 as const;
export const MAX_DUST = 9_000_000_000_000_000;

export const identifierSchema = z.uuid();
export const timestampSchema = z.iso.datetime({ offset: true });
export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
export const safeTextSchema = (minimum: number, maximum: number) =>
  z
    .string()
    .trim()
    .min(minimum)
    .max(maximum)
    .refine((value) =>
      [...value].every((character) => {
        const code = character.charCodeAt(0);
        return character !== '<' && character !== '>' && code >= 32 && code !== 127;
      }),
    );
export const contentVersionSchema = z.number().int().positive();
export const stateVersionSchema = z.number().int().positive();
export const quantitySchema = z.number().int().positive().max(10_000);
export const dustAmountSchema = z.number().int().nonnegative().max(MAX_DUST);
export const dustDeltaSchema = z
  .number()
  .int()
  .min(-MAX_DUST)
  .max(MAX_DUST)
  .refine((value) => value !== 0);
export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]+$/u);
export const requestIdSchema = z.string().trim().min(1).max(128);
export const pageSizeSchema = z.union([
  z.literal(10),
  z.literal(20),
  z.literal(50),
  z.literal(100),
]);
export const paginationRequestSchema = z
  .object({
    page: z.number().int().positive().default(1),
    pageSize: pageSizeSchema.default(20),
  })
  .strict();
export const paginationMetaSchema = z
  .object({
    page: z.number().int().positive(),
    pageSize: pageSizeSchema,
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();

export const mutationContextSchema = z
  .object({
    idempotencyKey: idempotencyKeySchema,
    expectedStateVersion: stateVersionSchema.optional(),
  })
  .strict();

export type PaginationRequest = z.infer<typeof paginationRequestSchema>;
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;
export type MutationContext = z.infer<typeof mutationContextSchema>;
