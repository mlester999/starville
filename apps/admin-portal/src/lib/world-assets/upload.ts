import type { AssetTypeProfile } from './profiles';

export type DetectedImageFormat = 'image/png' | 'image/webp' | 'unknown';

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

export function uploadSlug(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 96);
}
