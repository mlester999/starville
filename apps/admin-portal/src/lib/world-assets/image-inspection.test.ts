import { describe, expect, it } from 'vitest';

import { assetTypeProfile } from './profiles';
import {
  inspectClientImage,
  inspectionBlockingMessages,
  type ClientImageInspection,
} from './image-inspection';

function pngHeader(): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
}

function fakeFile(name: string, bytes: Uint8Array, type: string, size?: number): File {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const file = new File([copy], name, { type });
  if (size !== undefined) {
    Object.defineProperty(file, 'size', { value: size });
  }
  return file;
}

describe('client image inspection', () => {
  it('blocks unknown signatures and oversized files without requiring canvas decode', async () => {
    const profile = assetTypeProfile('building');
    const unknown = await inspectClientImage(
      fakeFile('evil.bin', new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), 'application/octet-stream'),
      profile,
    );
    expect(unknown.detectedFormat).toBe('unknown');
    expect(unknown.passed).toBe(false);
    expect(inspectionBlockingMessages(unknown).join(' ')).toMatch(/signature/i);

    const huge = await inspectClientImage(
      fakeFile('huge.png', pngHeader(), 'image/png', profile.maxFileSizeBytes + 1),
      profile,
    );
    expect(huge.passed).toBe(false);
    expect(inspectionBlockingMessages(huge).join(' ')).toMatch(/exceeds/i);
  });

  it('maps findings to blocking messages used by the upload wizard', () => {
    const inspection: ClientImageInspection = {
      fileName: 'tree.png',
      fileSizeBytes: 100,
      browserMimeType: 'image/png',
      detectedFormat: 'image/png',
      width: 10,
      height: 10,
      hasTransparency: true,
      opaqueEdgeRatio: 0.1,
      findings: [
        {
          id: 'a',
          level: 'pass',
          label: 'Format',
          detail: 'ok',
        },
        {
          id: 'b',
          level: 'blocking',
          label: 'Too large',
          detail: 'File is too large.',
        },
        {
          id: 'c',
          level: 'warning',
          label: 'Aspect',
          detail: 'Aspect differs.',
        },
      ],
      blockingCount: 1,
      warningCount: 1,
      passed: false,
    };
    expect(inspectionBlockingMessages(inspection)).toEqual(['File is too large.']);
  });
});
