import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AssetCoverageGameTest } from './AssetCoverageGameTest';

const source = readFileSync(
  resolve(process.cwd(), 'src/components/AssetCoverageGameTest.tsx'),
  'utf8',
);

let mountedRoot: ReturnType<typeof createRoot> | undefined;
let mountedContainer: HTMLDivElement | undefined;

afterEach(async () => {
  if (mountedRoot !== undefined) await act(async () => mountedRoot?.unmount());
  mountedContainer?.remove();
  mountedRoot = undefined;
  mountedContainer = undefined;
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

describe('Phase 12B deterministic asset coverage', () => {
  it('includes required galleries, resolver fixtures, projected geometry, rotations, and depth ordering', () => {
    for (const gallery of ['terrain', 'world', 'farming', 'housing', 'markers']) {
      expect(source).toContain(gallery);
    }
    expect(source).toContain('Uploaded override fixture');
    expect(source).toContain('game-test.intentionally-missing');
    expect(source).toContain('footprintPoints(asset)');
    expect(source).toContain("collision.shape === 'rectangle'");
    expect(source).toContain("collision.shape === 'capsule'");
    expect(source).toContain('asset-coverage-card__anchor--render');
    expect(source).toContain('asset-coverage-card__anchor--foot');
    expect(source).toContain('asset-coverage-card__anchor--depth');
    expect(source).toContain('supportedRotations.map');
    expect(source).toContain('asset-depth-fixture');
  });

  it('traps focus, closes on Escape, and restores the previously focused control', async () => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    const opener = document.createElement('button');
    opener.textContent = 'Open coverage';
    document.body.append(opener);
    opener.focus();
    mountedContainer = document.createElement('div');
    document.body.append(mountedContainer);
    mountedRoot = createRoot(mountedContainer);
    const onClose = vi.fn();

    await act(async () => mountedRoot?.render(createElement(AssetCoverageGameTest, { onClose })));
    const dialog = mountedContainer.querySelector<HTMLElement>('[role="dialog"]');
    expect(document.activeElement).toBe(dialog);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect((document.activeElement as HTMLElement | null)?.textContent).toBe('Close coverage');

    const buttons = [...mountedContainer.querySelectorAll<HTMLButtonElement>('button')];
    const last = buttons.at(-1);
    last?.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(buttons[0]);

    await act(async () =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => mountedRoot?.unmount());
    mountedRoot = undefined;
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('contains no persistent or hosted asset command', () => {
    expect(source).not.toContain('requestPlayerApi');
    expect(source).not.toContain('fetch(');
    expect(source).not.toMatch(/approveAsset|activateAsset|publishWorld|uploadAsset/u);
  });
});
