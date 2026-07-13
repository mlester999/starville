export interface AssetUploadAttempt {
  readonly fingerprint: string;
  readonly idempotencyKey: string;
}

/** Reuse a key only for a byte-and-metadata-identical transport retry. */
export function resolveAssetUploadAttempt(
  current: AssetUploadAttempt | null,
  fingerprint: string,
  createKey: () => string,
): AssetUploadAttempt {
  if (current?.fingerprint === fingerprint) return current;
  return { fingerprint, idempotencyKey: createKey() };
}
