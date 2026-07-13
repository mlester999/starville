import { createHash } from 'node:crypto';

import sharp, { type Metadata } from 'sharp';

import {
  GLOBAL_ASSET_MAX_DIMENSION,
  GLOBAL_ASSET_MAX_PIXELS,
  type AssetSourceMediaType,
  type AssetTypeProfile,
  type AssetValidationIssue,
  assetValidationResultSchema,
} from '@starville/asset-management';

export const ASSET_PREVIEW_MAX_DIMENSION = 1024;
export const ASSET_THUMBNAIL_MAX_DIMENSION = 256;
export const ASSET_DERIVATIVE_MAX_BYTES = 8 * 1024 * 1024;
export const ASSET_MAX_DECODED_TO_ENCODED_RATIO = 16_384;

export const ASSET_PROCESSING_ERROR_CODES = [
  'UNSUPPORTED_IMAGE',
  'MIME_MISMATCH',
  'MALFORMED_IMAGE',
  'ANIMATED_IMAGE',
  'IMAGE_TOO_LARGE',
  'DIMENSIONS_TOO_LARGE',
  'DECOMPRESSION_LIMIT',
  'PROCESSING_FAILED',
] as const;
export type AssetProcessingErrorCode = (typeof ASSET_PROCESSING_ERROR_CODES)[number];

export class AssetProcessingError extends Error {
  public constructor(
    public readonly code: AssetProcessingErrorCode,
    public readonly validationIssues: readonly AssetValidationIssue[],
  ) {
    super('Asset image processing was rejected.');
    this.name = 'AssetProcessingError';
  }
}

export interface AssetImageInput {
  readonly bytes: Buffer;
  readonly declaredMediaType: string;
  readonly originalFileName: string;
  readonly profile: Readonly<AssetTypeProfile>;
}

export interface ProcessedAssetImage {
  readonly originalChecksumSha256: string;
  readonly processedSourceChecksumSha256: string;
  readonly detectedMediaType: AssetSourceMediaType;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly sourceSizeBytes: number;
  readonly hasTransparency: boolean;
  readonly alphaCoverage: number;
  readonly normalizedSource: Buffer;
  readonly normalizedSourceWidth: number;
  readonly normalizedSourceHeight: number;
  readonly normalizedSourceSizeBytes: number;
  readonly preview: Buffer;
  readonly previewWidth: number;
  readonly previewHeight: number;
  readonly previewSizeBytes: number;
  readonly thumbnail: Buffer;
  readonly thumbnailWidth: number;
  readonly thumbnailHeight: number;
  readonly thumbnailSizeBytes: number;
  readonly validationResult: ReturnType<typeof assetValidationResultSchema.parse>;
}

function checksum(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function issue(
  code: string,
  level: AssetValidationIssue['level'],
  path: string,
  message: string,
): AssetValidationIssue {
  return { code, level, path, message };
}

function blocking(code: AssetProcessingErrorCode, message: string): AssetProcessingError {
  return new AssetProcessingError(code, [issue(code, 'blocking_error', 'file', message)]);
}

export function detectRasterMediaType(bytes: Uint8Array): AssetSourceMediaType | undefined {
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
    bytes.subarray(0, 4).toString() === 'RIFF' &&
    bytes.subarray(8, 12).toString() === 'WEBP'
  ) {
    return 'image/webp';
  }
  return undefined;
}

function expectedExtension(mediaType: AssetSourceMediaType): readonly string[] {
  return mediaType === 'image/png' ? ['.png'] : ['.webp'];
}

function safeFileExtension(fileName: string): string {
  const normalized = fileName.normalize('NFKC').trim().toLowerCase();
  const dot = normalized.lastIndexOf('.');
  return dot < 0 ? '' : normalized.slice(dot);
}

function isPixelLimitError(error: unknown): boolean {
  return error instanceof Error && /pixel.{0,20}limit|exceeds.{0,20}limit/iu.test(error.message);
}

function assertMetadata(metadata: Metadata): asserts metadata is Metadata & {
  width: number;
  height: number;
  format: 'png' | 'webp';
} {
  if (metadata.format !== 'png' && metadata.format !== 'webp') {
    throw blocking('UNSUPPORTED_IMAGE', 'Only decoded PNG and WebP images are supported.');
  }
  if (
    metadata.width === undefined ||
    metadata.height === undefined ||
    !Number.isInteger(metadata.width) ||
    !Number.isInteger(metadata.height) ||
    metadata.width < 1 ||
    metadata.height < 1
  ) {
    throw blocking('MALFORMED_IMAGE', 'The image dimensions could not be decoded safely.');
  }
  if (
    metadata.width > GLOBAL_ASSET_MAX_DIMENSION ||
    metadata.height > GLOBAL_ASSET_MAX_DIMENSION ||
    metadata.width * metadata.height > GLOBAL_ASSET_MAX_PIXELS
  ) {
    throw blocking(
      'DIMENSIONS_TOO_LARGE',
      'The image dimensions exceed the safe processing limit.',
    );
  }
  if ((metadata.pages ?? 1) > 1) {
    throw blocking('ANIMATED_IMAGE', 'Animated or multi-page images are not supported.');
  }
}

export async function processAssetImage(
  input: AssetImageInput,
  now: () => Date = () => new Date(),
): Promise<ProcessedAssetImage> {
  if (input.bytes.length < 12) {
    throw blocking('MALFORMED_IMAGE', 'The image file is incomplete or malformed.');
  }
  if (input.bytes.length > input.profile.maximumSourceBytes) {
    throw blocking('IMAGE_TOO_LARGE', 'The image exceeds the selected asset type size limit.');
  }

  const detectedMediaType = detectRasterMediaType(input.bytes);
  if (detectedMediaType === undefined) {
    throw blocking('UNSUPPORTED_IMAGE', 'This file is not a supported PNG or WebP image.');
  }
  if (
    input.declaredMediaType !== detectedMediaType ||
    !expectedExtension(detectedMediaType).includes(safeFileExtension(input.originalFileName))
  ) {
    throw blocking(
      'MIME_MISMATCH',
      'The file name, declared type, and decoded image type do not match.',
    );
  }
  if (!input.profile.acceptedMediaTypes.includes(detectedMediaType)) {
    throw blocking(
      'UNSUPPORTED_IMAGE',
      'This image type is not allowed for the selected asset type.',
    );
  }

  const processorOptions = {
    animated: false,
    failOn: 'error' as const,
    limitInputPixels: GLOBAL_ASSET_MAX_PIXELS,
    sequentialRead: true,
    unlimited: false,
  };
  let metadata: Metadata;
  try {
    metadata = await sharp(input.bytes, processorOptions).metadata();
  } catch (error) {
    if (isPixelLimitError(error)) {
      throw blocking('DECOMPRESSION_LIMIT', 'The image exceeds the safe decompression limit.');
    }
    throw blocking('MALFORMED_IMAGE', 'The image could not be decoded safely.');
  }
  assertMetadata(metadata);
  const decodedBytes = metadata.width * metadata.height * 4;
  if (decodedBytes / input.bytes.length > ASSET_MAX_DECODED_TO_ENCODED_RATIO) {
    throw blocking(
      'DECOMPRESSION_LIMIT',
      'The image exceeds the safe decoded-to-encoded expansion limit.',
    );
  }

  const issues: AssetValidationIssue[] = [
    issue('FORMAT_PASSED', 'passed', 'file', 'The decoded image format is supported.'),
    issue('DECODE_PASSED', 'passed', 'file', 'The source decoded successfully.'),
    issue(
      'DIMENSIONS_PASSED',
      'passed',
      'dimensions',
      'The source dimensions are within safe limits.',
    ),
  ];

  const ratio = metadata.width / metadata.height;
  const recommendedRatio = input.profile.recommendedWidth / input.profile.recommendedHeight;
  if (
    metadata.width < input.profile.recommendedWidth ||
    metadata.height < input.profile.recommendedHeight
  ) {
    issues.push(
      issue(
        'SOURCE_BELOW_RECOMMENDED_SIZE',
        'warning',
        'dimensions',
        'The source is smaller than the recommended production size.',
      ),
    );
  }
  if (Math.abs(ratio - recommendedRatio) / recommendedRatio > 0.4) {
    issues.push(
      issue(
        'ASPECT_RATIO_ADVISORY',
        'recommendation',
        'dimensions',
        'The source aspect ratio differs substantially from the recommended profile.',
      ),
    );
  }

  try {
    const oriented = sharp(input.bytes, processorOptions).rotate();
    const statistics = await oriented.clone().ensureAlpha().stats();
    const alpha = statistics.channels[3];
    if (alpha === undefined) throw new Error('alpha statistics unavailable');
    const hasTransparency = alpha.min < 255;
    const alphaCoverage = Math.max(0, Math.min(1, 1 - alpha.mean / 255));
    if (input.profile.requiredTransparency && !hasTransparency) {
      issues.push(
        issue(
          'TRANSPARENCY_REQUIRED',
          'blocking_error',
          'transparency',
          'Transparent background is required for this asset type.',
        ),
      );
    } else {
      issues.push(
        issue(
          'TRANSPARENCY_PASSED',
          'passed',
          'transparency',
          hasTransparency
            ? 'The image contains transparent pixels.'
            : 'Transparency is optional for this asset type.',
        ),
      );
    }

    const sourceOutput = await oriented
      .clone()
      .webp({ effort: 4, lossless: true })
      .toBuffer({ resolveWithObject: true });
    const previewOutput = await oriented
      .clone()
      .resize({
        width: ASSET_PREVIEW_MAX_DIMENSION,
        height: ASSET_PREVIEW_MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ effort: 4, quality: 92 })
      .toBuffer({ resolveWithObject: true });
    const thumbnailOutput = await oriented
      .clone()
      .resize({
        width: ASSET_THUMBNAIL_MAX_DIMENSION,
        height: ASSET_THUMBNAIL_MAX_DIMENSION,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        withoutEnlargement: true,
      })
      .webp({ effort: 4, quality: 88 })
      .toBuffer({ resolveWithObject: true });
    if (
      sourceOutput.data.length > ASSET_DERIVATIVE_MAX_BYTES ||
      previewOutput.data.length > ASSET_DERIVATIVE_MAX_BYTES ||
      thumbnailOutput.data.length > ASSET_DERIVATIVE_MAX_BYTES
    ) {
      throw blocking(
        'PROCESSING_FAILED',
        'A normalized image variant exceeds the safe delivery size limit.',
      );
    }
    issues.push(
      issue(
        'METADATA_STRIPPED',
        'passed',
        'processing',
        'Sanitized WebP delivery variants were generated without source metadata.',
      ),
    );

    const valid = !issues.some(({ level }) => level === 'blocking_error');
    return {
      originalChecksumSha256: checksum(input.bytes),
      processedSourceChecksumSha256: checksum(sourceOutput.data),
      detectedMediaType,
      sourceWidth: sourceOutput.info.width,
      sourceHeight: sourceOutput.info.height,
      sourceSizeBytes: input.bytes.length,
      hasTransparency,
      alphaCoverage,
      normalizedSource: sourceOutput.data,
      normalizedSourceWidth: sourceOutput.info.width,
      normalizedSourceHeight: sourceOutput.info.height,
      normalizedSourceSizeBytes: sourceOutput.data.length,
      preview: previewOutput.data,
      previewWidth: previewOutput.info.width,
      previewHeight: previewOutput.info.height,
      previewSizeBytes: previewOutput.data.length,
      thumbnail: thumbnailOutput.data,
      thumbnailWidth: thumbnailOutput.info.width,
      thumbnailHeight: thumbnailOutput.info.height,
      thumbnailSizeBytes: thumbnailOutput.data.length,
      validationResult: assetValidationResultSchema.parse({
        valid,
        checkedAt: now().toISOString(),
        issues,
      }),
    };
  } catch (error) {
    if (error instanceof AssetProcessingError) throw error;
    if (isPixelLimitError(error)) {
      throw blocking('DECOMPRESSION_LIMIT', 'The image exceeds the safe decompression limit.');
    }
    throw blocking('PROCESSING_FAILED', 'The image could not be normalized safely.');
  }
}
