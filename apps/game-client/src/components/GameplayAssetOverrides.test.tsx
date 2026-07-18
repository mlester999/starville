import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { GameplayAssetOverride } from '@starville/asset-management';

import { BundledAssetImage } from './BundledAssetImage';
import { GameplayAssetOverrideProvider } from './GameplayAssetOverrides';

const override: GameplayAssetOverride = {
  assetKey: 'phase7-dev-moonbean',
  versionId: '22222222-2222-4222-8222-222222222222',
  checksum: 'a'.repeat(64),
  source: 'active_uploaded',
  bundledManifestVersion: null,
  url: 'https://assets.example.test/game-assets/starville/phase7-dev-moonbean/v2/source.webp',
  mediaType: 'image/webp',
  width: 256,
  height: 256,
  renderWidth: 128,
  renderHeight: 128,
  scale: 1,
  anchor: { x: 0.5, y: 1 },
  footAnchor: { x: 0.5, y: 0.92 },
  depthAnchor: { x: 0.5, y: 0.92 },
  collision: { shape: 'none', blocking: false },
  supportedRotations: [0],
  defaultRotation: 0,
  replacementAllowed: true,
};

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

describe('GameplayAssetOverrideProvider', () => {
  it('uses the active immutable version in its cache identity', async () => {
    await act(async () => {
      root.render(
        <GameplayAssetOverrideProvider overrides={[override]}>
          <BundledAssetImage assetKey={override.assetKey} alt="Moonbean" />
        </GameplayAssetOverrideProvider>,
      );
    });
    const image = container.querySelector('img');
    expect(image?.src).toBe(override.url);
    expect(image?.dataset['assetSource']).toBe('active_uploaded');
    expect(image?.dataset['cacheIdentity']).toContain(override.versionId);
    expect(image?.dataset['cacheIdentity']).toContain(override.checksum);
  });

  it('falls back to the same stable bundled key after uploaded media failure', async () => {
    await act(async () => {
      root.render(
        <GameplayAssetOverrideProvider overrides={[override]}>
          <BundledAssetImage assetKey={override.assetKey} alt="Moonbean" />
        </GameplayAssetOverrideProvider>,
      );
    });
    const image = container.querySelector('img');
    await act(async () => image?.dispatchEvent(new Event('error')));
    expect(image?.src).toContain('/assets/starville/bundled/v1/inventory/phase7-dev-moonbean.webp');
    expect(image?.dataset['assetSource']).toBe('bundled_default');
    expect(image?.dataset['assetKey']).toBe('phase7-dev-moonbean');
  });

  it('uses authored bundled direction art when one uploaded file cannot represent rotation', async () => {
    await act(async () => {
      root.render(
        <GameplayAssetOverrideProvider
          overrides={[
            {
              ...override,
              assetKey: 'phase7-dev-willow-chair',
              url: 'https://assets.example.test/game-assets/starville/phase7-dev-willow-chair/v2/source.webp',
              supportedRotations: [0, 90, 180, 270],
            },
          ]}
        >
          <BundledAssetImage assetKey="phase7-dev-willow-chair" alt="Chair east" rotation={90} />
        </GameplayAssetOverrideProvider>,
      );
    });
    expect(container.querySelector('img')?.src).toContain('rotation-90.webp');
    expect(container.querySelector('img')?.dataset['assetSource']).toBe('bundled_default');
  });
});
