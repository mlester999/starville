import { GLOBAL_ASSET_INTAKE_MAX_BYTES } from '@starville/asset-management';

export const MAX_ASSET_MULTIPART_OVERHEAD_BYTES = 128 * 1024;
export const MAX_ASSET_MULTIPART_REQUEST_BYTES =
  GLOBAL_ASSET_INTAKE_MAX_BYTES + MAX_ASSET_MULTIPART_OVERHEAD_BYTES;

export type DeclaredUploadLength =
  Readonly<{ ok: true; bytes: number }> | Readonly<{ ok: false; status: 400 | 411 | 413 }>;

export function parseDeclaredUploadLength(value: string | null): DeclaredUploadLength {
  if (value === null) return { ok: false, status: 411 };
  if (!/^\d+$/u.test(value)) return { ok: false, status: 400 };
  const bytes = Number(value);
  if (!Number.isSafeInteger(bytes) || bytes <= 0) return { ok: false, status: 400 };
  if (bytes > MAX_ASSET_MULTIPART_REQUEST_BYTES) return { ok: false, status: 413 };
  return { ok: true, bytes };
}
