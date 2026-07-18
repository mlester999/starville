import { assetSlugSchema, normalizeAssetSlug } from '@starville/asset-management';

import type { AssetTypeProfile } from './profiles';

export type DetectedImageFormat = 'image/png' | 'image/webp' | 'unknown';

export const FRIENDLY_NAME_MAX_LENGTH = 100;
export const ASSET_SLUG_MAX_LENGTH = 96;
export const ASSET_SLUG_MIN_LENGTH = 3;

export function detectImageFormat(bytes: Uint8Array): DetectedImageFormat {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return 'unknown';
}

export function advisoryFileIssues(
  input: Readonly<{
    name: string;
    size: number;
    browserMimeType: string;
    bytes: Uint8Array;
  }>,
  profile: AssetTypeProfile,
): readonly string[] {
  const issues: string[] = [];
  const detected = detectImageFormat(input.bytes);
  const extension = input.name.toLowerCase().split('.').at(-1);
  const expectedExtension =
    detected === 'image/png' ? 'png' : detected === 'image/webp' ? 'webp' : null;
  if (detected === 'unknown')
    issues.push('The file signature is not a supported PNG or WebP image.');
  if (detected !== 'unknown' && input.browserMimeType !== detected) {
    issues.push('The browser MIME type does not match the detected image format.');
  }
  if (expectedExtension !== null && extension !== expectedExtension) {
    issues.push('The filename extension does not match the detected image format.');
  }
  if (input.size <= 0) issues.push('The selected file is empty.');
  if (input.size > profile.maxFileSizeBytes) {
    issues.push(
      `The source exceeds the ${String(profile.maxFileSizeBytes)} byte limit for this type.`,
    );
  }
  return issues;
}

/** @deprecated Prefer generateAssetSlug — kept for existing call sites. */
export function uploadSlug(value: string): string {
  return generateAssetSlug(value);
}

/**
 * Generate a stable path-safe asset slug from a friendly display name.
 * Applies repository normalizeAssetSlug rules and enforces the current max length.
 */
export function generateAssetSlug(value: string): string {
  return normalizeAssetSlug(value).slice(0, ASSET_SLUG_MAX_LENGTH);
}

export function isValidAssetSlug(value: string): boolean {
  return assetSlugSchema.safeParse(value).success;
}

export function normalizeFriendlyName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

export function friendlyNameValidationMessage(value: string): string | null {
  const trimmed = normalizeFriendlyName(value);
  if (value.length > 0 && value.trim().length === 0) {
    return 'Enter a readable name — spaces alone are not allowed.';
  }
  if (trimmed.length === 0) {
    return 'Friendly name is required.';
  }
  if (trimmed.length > FRIENDLY_NAME_MAX_LENGTH) {
    return `Keep the friendly name to ${String(FRIENDLY_NAME_MAX_LENGTH)} characters or fewer.`;
  }
  if (/[<>\p{Cc}]/u.test(trimmed)) {
    return 'This name contains characters that cannot be used.';
  }
  return null;
}

export function assetSlugValidationMessage(slug: string, friendlyName: string): string | null {
  if (normalizeFriendlyName(friendlyName).length === 0) return null;
  if (slug.length === 0) {
    return 'Use a friendly name with letters so an asset ID can be generated.';
  }
  if (slug.length < ASSET_SLUG_MIN_LENGTH) {
    return 'The generated asset ID is too short. Use a more complete friendly name.';
  }
  if (!isValidAssetSlug(slug)) {
    return 'The generated asset ID must start with a letter and use only lowercase letters, numbers, and hyphens.';
  }
  return null;
}

/**
 * Suggest a human-readable alternate when the preferred slug is already taken.
 * Prefers sequential suffixes (pine-tree-02) over random characters.
 */
export function suggestAlternateAssetSlug(
  preferred: string,
  taken: ReadonlySet<string> | ReadonlyArray<string>,
): string {
  const occupied = taken instanceof Set ? taken : new Set(taken);
  if (!occupied.has(preferred) && isValidAssetSlug(preferred)) return preferred;

  for (let index = 2; index <= 99; index += 1) {
    const suffix = `-${String(index).padStart(2, '0')}`;
    const maxBase = ASSET_SLUG_MAX_LENGTH - suffix.length;
    const candidate = `${preferred.slice(0, Math.max(1, maxBase))}${suffix}`.replace(/-+$/u, '');
    if (isValidAssetSlug(candidate) && !occupied.has(candidate)) return candidate;
  }

  const fallback = `${preferred.slice(0, ASSET_SLUG_MAX_LENGTH - 4)}-alt`;
  return isValidAssetSlug(fallback) ? fallback : preferred;
}

export function slugCollisionMessage(slug: string, suggestion: string): string {
  if (suggestion !== slug && isValidAssetSlug(suggestion)) {
    return `This asset ID already exists. Try a more specific name such as one that generates “${suggestion}”.`;
  }
  return 'This asset ID already exists. Try a more specific friendly name.';
}
