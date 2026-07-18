import type { AssetTypeProfile } from './profiles';
import { detectImageFormat, type DetectedImageFormat } from './upload';

export type InspectionLevel = 'pass' | 'warning' | 'blocking';

export interface ImageInspectionFinding {
  readonly id: string;
  readonly level: InspectionLevel;
  readonly label: string;
  readonly detail: string;
}

export interface ClientImageInspection {
  readonly fileName: string;
  readonly fileSizeBytes: number;
  readonly browserMimeType: string;
  readonly detectedFormat: DetectedImageFormat;
  readonly width: number | null;
  readonly height: number | null;
  readonly hasTransparency: boolean | null;
  readonly opaqueEdgeRatio: number | null;
  readonly findings: readonly ImageInspectionFinding[];
  readonly blockingCount: number;
  readonly warningCount: number;
  readonly passed: boolean;
}

function loadImageDimensions(
  file: File,
): Promise<{ width: number; height: number; bitmap: ImageBitmap | null }> {
  return new Promise((resolve, reject) => {
    if (typeof createImageBitmap === 'function') {
      void createImageBitmap(file)
        .then((bitmap) => {
          resolve({ width: bitmap.width, height: bitmap.height, bitmap });
        })
        .catch(() => {
          // Fallback path below.
          const url = URL.createObjectURL(file);
          const image = new Image();
          image.onload = () => {
            const width = image.naturalWidth;
            const height = image.naturalHeight;
            URL.revokeObjectURL(url);
            resolve({ width, height, bitmap: null });
          };
          image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('IMAGE_DECODE_FAILED'));
          };
          image.src = url;
        });
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      URL.revokeObjectURL(url);
      resolve({ width, height, bitmap: null });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('IMAGE_DECODE_FAILED'));
    };
    image.src = url;
  });
}

/**
 * Sample corners and a sparse grid for non-opaque alpha.
 * Advisory only — the trusted API remains authoritative.
 */
function inspectTransparency(
  width: number,
  height: number,
  bitmap: ImageBitmap | null,
  file: File,
): Promise<{ hasTransparency: boolean | null; opaqueEdgeRatio: number | null }> {
  if (typeof document === 'undefined') {
    return Promise.resolve({ hasTransparency: null, opaqueEdgeRatio: null });
  }

  const canvas = document.createElement('canvas');
  const sampleWidth = Math.min(width, 96);
  const sampleHeight = Math.min(height, 96);
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) {
    return Promise.resolve({ hasTransparency: null, opaqueEdgeRatio: null });
  }

  return new Promise((resolve) => {
    const drawAndSample = (source: CanvasImageSource) => {
      try {
        context.clearRect(0, 0, sampleWidth, sampleHeight);
        context.drawImage(source, 0, 0, sampleWidth, sampleHeight);
        const { data } = context.getImageData(0, 0, sampleWidth, sampleHeight);
        let transparent = 0;
        let edgeOpaque = 0;
        let edgeTotal = 0;
        for (let y = 0; y < sampleHeight; y += 1) {
          for (let x = 0; x < sampleWidth; x += 1) {
            const alpha = data[(y * sampleWidth + x) * 4 + 3] ?? 255;
            if (alpha < 250) transparent += 1;
            const onEdge = x === 0 || y === 0 || x === sampleWidth - 1 || y === sampleHeight - 1;
            if (onEdge) {
              edgeTotal += 1;
              if (alpha >= 250) edgeOpaque += 1;
            }
          }
        }
        resolve({
          hasTransparency: transparent > 0,
          opaqueEdgeRatio: edgeTotal === 0 ? null : edgeOpaque / edgeTotal,
        });
      } catch {
        resolve({ hasTransparency: null, opaqueEdgeRatio: null });
      }
    };

    if (bitmap !== null) {
      drawAndSample(bitmap);
      bitmap.close();
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      drawAndSample(image);
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ hasTransparency: null, opaqueEdgeRatio: null });
    };
    image.src = url;
  });
}

export async function inspectClientImage(
  file: File,
  profile: AssetTypeProfile,
): Promise<ClientImageInspection> {
  const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const detectedFormat = detectImageFormat(header);
  const findings: ImageInspectionFinding[] = [];

  const extension = file.name.toLowerCase().split('.').at(-1);
  const expectedExtension =
    detectedFormat === 'image/png' ? 'png' : detectedFormat === 'image/webp' ? 'webp' : null;

  if (detectedFormat === 'unknown') {
    findings.push({
      id: 'format-unknown',
      level: 'blocking',
      label: 'Unsupported file signature',
      detail: 'The file signature is not a supported PNG or WebP image.',
    });
  } else {
    findings.push({
      id: 'format-ok',
      level: 'pass',
      label: 'Format',
      detail: `Detected ${detectedFormat === 'image/png' ? 'PNG' : 'WebP'}.`,
    });
  }

  if (detectedFormat !== 'unknown' && file.type !== '' && file.type !== detectedFormat) {
    findings.push({
      id: 'mime-mismatch',
      level: 'warning',
      label: 'Browser MIME mismatch',
      detail: 'The browser MIME type does not match the detected image format.',
    });
  }

  if (expectedExtension !== null && extension !== expectedExtension) {
    findings.push({
      id: 'extension-mismatch',
      level: 'warning',
      label: 'Filename extension',
      detail: 'The filename extension does not match the detected image format.',
    });
  }

  if (file.size <= 0) {
    findings.push({
      id: 'empty',
      level: 'blocking',
      label: 'Empty file',
      detail: 'The selected file is empty.',
    });
  } else if (file.size > profile.maxFileSizeBytes) {
    findings.push({
      id: 'too-large',
      level: 'blocking',
      label: 'File too large',
      detail: `The source exceeds the ${String(profile.maxFileSizeBytes)} byte limit for this type.`,
    });
  } else {
    findings.push({
      id: 'size-ok',
      level: 'pass',
      label: 'File size',
      detail: 'Within the type maximum for upload.',
    });
  }

  let width: number | null = null;
  let height: number | null = null;
  let hasTransparency: boolean | null = null;
  let opaqueEdgeRatio: number | null = null;

  if (detectedFormat !== 'unknown' && file.size > 0) {
    try {
      const loaded = await loadImageDimensions(file);
      width = loaded.width;
      height = loaded.height;
      findings.push({
        id: 'dimensions',
        level:
          width === profile.recommendedWidth && height === profile.recommendedHeight
            ? 'pass'
            : 'warning',
        label: 'Dimensions',
        detail:
          width === profile.recommendedWidth && height === profile.recommendedHeight
            ? `${String(width)} × ${String(height)} matches the recommended size.`
            : `${String(width)} × ${String(height)} (recommended ${String(profile.recommendedWidth)} × ${String(profile.recommendedHeight)}). The server still decides acceptance.`,
      });

      const ratio = width / height;
      const recommendedRatio = profile.recommendedWidth / profile.recommendedHeight;
      const ratioDelta = Math.abs(ratio - recommendedRatio) / recommendedRatio;
      if (ratioDelta > 0.12) {
        findings.push({
          id: 'aspect',
          level: 'warning',
          label: 'Aspect ratio',
          detail: `Aspect differs from the recommended ${profile.recommendedRatio}.`,
        });
      } else {
        findings.push({
          id: 'aspect-ok',
          level: 'pass',
          label: 'Aspect ratio',
          detail: `Close to the recommended ${profile.recommendedRatio}.`,
        });
      }

      const transparency = await inspectTransparency(width, height, loaded.bitmap, file);
      hasTransparency = transparency.hasTransparency;
      opaqueEdgeRatio = transparency.opaqueEdgeRatio;

      if (profile.requiredTransparency) {
        if (hasTransparency === false) {
          findings.push({
            id: 'transparency-missing',
            level: 'warning',
            label: 'Transparency',
            detail:
              'No transparent pixels were sampled. This type usually needs a transparent background. The trusted server still validates the final image.',
          });
        } else if (hasTransparency === true) {
          findings.push({
            id: 'transparency-ok',
            level: 'pass',
            label: 'Transparency',
            detail: 'Transparent pixels were detected in a local sample.',
          });
        } else {
          findings.push({
            id: 'transparency-unknown',
            level: 'warning',
            label: 'Transparency',
            detail: 'Local transparency sampling was unavailable in this browser.',
          });
        }

        if (opaqueEdgeRatio !== null && opaqueEdgeRatio > 0.92) {
          findings.push({
            id: 'opaque-edges',
            level: 'warning',
            label: 'Edge fill',
            detail:
              'Edges look mostly opaque. Avoid black or solid full-bleed backgrounds when the type expects an isolated object.',
          });
        }
      } else if (hasTransparency === true) {
        findings.push({
          id: 'transparency-optional',
          level: 'pass',
          label: 'Transparency',
          detail: 'Transparency detected (optional for this type).',
        });
      }
    } catch {
      findings.push({
        id: 'decode-failed',
        level: 'blocking',
        label: 'Browser decode failed',
        detail: 'This file could not be read by the browser for advisory checks.',
      });
    }
  }

  const blockingCount = findings.filter((item) => item.level === 'blocking').length;
  const warningCount = findings.filter((item) => item.level === 'warning').length;

  return {
    fileName: file.name,
    fileSizeBytes: file.size,
    browserMimeType: file.type,
    detectedFormat,
    width,
    height,
    hasTransparency,
    opaqueEdgeRatio,
    findings,
    blockingCount,
    warningCount,
    passed: blockingCount === 0,
  };
}

/** Maps inspection findings to the simple string list used by older call sites. */
export function inspectionBlockingMessages(inspection: ClientImageInspection): readonly string[] {
  return inspection.findings.filter((item) => item.level === 'blocking').map((item) => item.detail);
}
