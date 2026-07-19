import { describe, expect, it } from 'vitest';

import {
  bundledRuntimeSize,
  findStarvilleWorkspaceRoot,
  readBundledMedia,
  resolveBundledMediaDescriptor,
} from './bundled-media';

describe('bundled asset media allowlist', () => {
  it('maps a canonical key to its manifest-owned source and thumbnail paths', () => {
    const source = resolveBundledMediaDescriptor({
      key: 'tree-pine',
      variant: 'source',
      workspaceRoot: '/workspace/starville',
    });
    const thumbnail = resolveBundledMediaDescriptor({
      key: 'tree-pine',
      variant: 'thumbnail',
      workspaceRoot: '/workspace/starville',
    });

    expect(source?.manifestPath).toBe('/assets/starville/bundled/v1/nature/tree-pine.webp');
    expect(source?.filesystemPath).toBe(
      '/workspace/starville/assets/starville/bundled/v1/nature/tree-pine.webp',
    );
    expect(thumbnail?.manifestPath).toBe(
      '/assets/starville/bundled/v1/thumbnails/nature/tree-pine.webp',
    );

    const candidate = resolveBundledMediaDescriptor({
      key: 'tree-pine',
      variant: 'source',
      manifestVersion: '2.0.0',
      workspaceRoot: '/workspace/starville',
    });
    expect(candidate?.asset.qualityStatus).toBe('production_candidate');
    expect(candidate?.manifestPath).toBe('/assets/starville/bundled/v2/nature/tree-pine.webp');
    expect(candidate?.filesystemPath).toBe(
      '/workspace/starville/assets/starville/bundled/v2/nature/tree-pine.webp',
    );
  });

  it('selects only authored rotation variants and never rotates a requested path', () => {
    const rotated = resolveBundledMediaDescriptor({
      key: 'fence-willow',
      variant: 'source',
      rotation: 90,
      workspaceRoot: '/workspace/starville',
    });
    expect(rotated?.manifestPath).toContain('fence-willow--rotation-90.webp');
  });

  it('rejects unknown and traversal-shaped keys without resolving filesystem input', () => {
    for (const key of [
      '../../etc/passwd',
      '..%2f..%2fetc%2fpasswd',
      '/etc/passwd',
      'tree-pine/../../x',
    ]) {
      expect(
        resolveBundledMediaDescriptor({
          key,
          variant: 'source',
          workspaceRoot: '/workspace/starville',
        }),
      ).toBeNull();
    }
  });

  it('reads only the shipped allowlisted WebP derivatives', async () => {
    const workspaceRoot = findStarvilleWorkspaceRoot();
    expect(workspaceRoot).not.toBeNull();
    if (workspaceRoot === null) return;

    for (const manifestVersion of ['1.0.0', '2.0.0'] as const) {
      for (const variant of ['source', 'thumbnail'] as const) {
        const descriptor = resolveBundledMediaDescriptor({
          key: 'tree-pine',
          variant,
          manifestVersion,
          workspaceRoot,
        });
        expect(descriptor).not.toBeNull();
        if (descriptor === null) continue;
        const bytes = await readBundledMedia(descriptor, workspaceRoot);
        expect(bytes?.subarray(0, 4).toString('ascii')).toBe('RIFF');
        expect(bytes?.subarray(8, 12).toString('ascii')).toBe('WEBP');
      }
    }
  });

  it('reports allowlisted runtime byte evidence without returning a path', async () => {
    await expect(bundledRuntimeSize('tree-pine')).resolves.toEqual(expect.any(Number));
    await expect(bundledRuntimeSize('another-game.tree-pine')).resolves.toBeNull();
  });
});
