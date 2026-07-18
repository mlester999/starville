import {
  assetRestoreBundledDefaultActionSchema,
  assetUuidSchema,
} from '@starville/asset-management';

export const BUNDLED_DEFAULT_RESTORE_CONFIRMATION = 'RESTORE BUNDLED DEFAULT' as const;

const bundledDefaultRestoreFormSchema = assetRestoreBundledDefaultActionSchema
  .extend({ assetId: assetUuidSchema })
  .strict();

function text(formData: FormData, key: string, maximum: number): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.length <= maximum ? value.trim() : undefined;
}

export function parseBundledDefaultRestoreForm(formData: FormData) {
  return bundledDefaultRestoreFormSchema.safeParse({
    assetId: text(formData, 'assetId', 64),
    expectedAssetRevision: Number(text(formData, 'expectedAssetRevision', 16)),
    reason: text(formData, 'reason', 500),
    idempotencyKey: text(formData, 'requestId', 64),
    confirmed: formData.get('confirmed') === 'yes',
    typedConfirmation: text(formData, 'typedConfirmation', 40),
  });
}
