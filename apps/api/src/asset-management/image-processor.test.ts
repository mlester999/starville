import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { getAssetTypeProfile } from '@starville/asset-management';

import {
  AssetProcessingError,
  detectRasterMediaType,
  processAssetImage,
} from './image-processor.js';

async function png(width = 512, height = 512, alpha = 0.7): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 40, g: 120, b: 80, alpha } },
  })
    .png()
    .toBuffer();
}

describe('asset image processor', () => {
  it('uses decoded signatures and generates bounded metadata-free WebP variants', async () => {
    const bytes = await png();
    const result = await processAssetImage({
      bytes,
      declaredMediaType: 'image/png',
      originalFileName: 'willow-tree.png',
      profile: getAssetTypeProfile('tree'),
    });

    expect(detectRasterMediaType(bytes)).toBe('image/png');
    expect(detectRasterMediaType(result.normalizedSource)).toBe('image/webp');
    expect(result.processedSourceChecksumSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.previewWidth).toBeLessThanOrEqual(1024);
    expect(result.thumbnailWidth).toBeLessThanOrEqual(256);
    expect(result.hasTransparency).toBe(true);
    expect(result.validationResult.issues).toContainEqual(
      expect.objectContaining({ code: 'METADATA_STRIPPED', level: 'passed' }),
    );
  });

  it('rejects MIME and extension claims that disagree with actual bytes', async () => {
    await expect(
      processAssetImage({
        bytes: await png(),
        declaredMediaType: 'image/webp',
        originalFileName: 'disguised.webp',
        profile: getAssetTypeProfile('decoration'),
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'MIME_MISMATCH' }));
  });

  it('rejects extreme encoded-to-decoded expansion even within absolute dimensions', async () => {
    const compressed = await sharp({
      create: {
        width: 4096,
        height: 4096,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .webp({ lossless: true })
      .toBuffer();

    await expect(
      processAssetImage({
        bytes: compressed,
        declaredMediaType: 'image/webp',
        originalFileName: 'expansion.webp',
        profile: getAssetTypeProfile('building'),
      }),
    ).rejects.toEqual(expect.objectContaining({ code: 'DECOMPRESSION_LIMIT' }));
  });

  it('returns only safe structured processing failures', async () => {
    try {
      await processAssetImage({
        bytes: Buffer.from('not-an-image-file'),
        declaredMediaType: 'image/png',
        originalFileName: 'unsafe.png',
        profile: getAssetTypeProfile('tree'),
      });
      throw new Error('Expected processing rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(AssetProcessingError);
      expect((error as Error).message).not.toContain('not-an-image-file');
    }
  });
});
