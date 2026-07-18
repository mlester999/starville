/**
 * Client-side generation of blank transparent PNG templates for operator guidance.
 * Templates never leave the browser until the owner downloads them; nothing is uploaded.
 */

export interface TemplateSpec {
  readonly width: number;
  readonly height: number;
  readonly label: string;
  readonly fileName: string;
  readonly showSafeGuides?: boolean;
}

/**
 * Build a transparent PNG with optional light guide marks (non-destructive hints
 * outside the main art area). Guide marks stay very faint and are for layout only.
 */
export function buildTransparentTemplateBlob(spec: TemplateSpec): Promise<Blob> {
  if (spec.width < 16 || spec.height < 16 || spec.width > 4096 || spec.height > 4096) {
    return Promise.reject(new Error('TEMPLATE_DIMENSIONS_OUT_OF_RANGE'));
  }
  if (typeof document === 'undefined') {
    return Promise.reject(new Error('TEMPLATE_REQUIRES_BROWSER'));
  }

  const canvas = document.createElement('canvas');
  canvas.width = spec.width;
  canvas.height = spec.height;
  const context = canvas.getContext('2d');
  if (context === null) return Promise.reject(new Error('TEMPLATE_CANVAS_UNAVAILABLE'));

  context.clearRect(0, 0, spec.width, spec.height);

  if (spec.showSafeGuides === true) {
    context.save();
    context.strokeStyle = 'rgba(74, 166, 135, 0.28)';
    context.lineWidth = Math.max(1, Math.round(Math.min(spec.width, spec.height) / 512));
    context.setLineDash([8, 8]);
    const insetX = Math.round(spec.width * 0.08);
    const insetY = Math.round(spec.height * 0.08);
    context.strokeRect(insetX, insetY, spec.width - insetX * 2, spec.height - insetY * 2);

    // Foot-contact cross near bottom center (advisory only).
    const footX = Math.round(spec.width / 2);
    const footY = Math.round(spec.height * 0.88);
    context.setLineDash([]);
    context.beginPath();
    context.moveTo(footX - 12, footY);
    context.lineTo(footX + 12, footY);
    context.moveTo(footX, footY - 12);
    context.lineTo(footX, footY + 12);
    context.stroke();

    context.fillStyle = 'rgba(23, 62, 50, 0.35)';
    context.font = `${Math.max(12, Math.round(spec.width / 48))}px sans-serif`;
    context.fillText(spec.label, insetX, Math.max(18, insetY - 6));
    context.restore();
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error('TEMPLATE_ENCODE_FAILED'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

export function downloadBlob(blob: Blob, fileName: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new Error('TEMPLATE_DOWNLOAD_REQUIRES_BROWSER');
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function downloadTransparentTemplate(spec: TemplateSpec): Promise<void> {
  const blob = await buildTransparentTemplateBlob(spec);
  downloadBlob(blob, spec.fileName);
}

/** Node/test helper: validates template constraints without DOM encoding. */
export function isValidTemplateSpec(spec: TemplateSpec): boolean {
  return (
    Number.isInteger(spec.width) &&
    Number.isInteger(spec.height) &&
    spec.width >= 16 &&
    spec.height >= 16 &&
    spec.width <= 4096 &&
    spec.height <= 4096 &&
    spec.fileName.toLowerCase().endsWith('.png') &&
    spec.label.trim().length > 0
  );
}
