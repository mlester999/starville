/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  AVATAR_VISUAL_ACCEPTANCE_PANELS,
  AVATAR_VISUAL_ACCEPTANCE_PREFERENCES,
  AVATAR_VISUAL_ACCEPTANCE_SCALES,
  AVATAR_VISUAL_ACCEPTANCE_VIEWPORTS,
} from './visual-acceptance/matrix';

const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

function zIndexFor(selector: string): number {
  const ruleStart = stylesheet.indexOf(`${selector} {`);
  expect(ruleStart, `Missing CSS rule for ${selector}`).toBeGreaterThanOrEqual(0);

  const ruleEnd = stylesheet.indexOf('}', ruleStart);
  const rule = stylesheet.slice(ruleStart, ruleEnd);
  const zIndex = /z-index:\s*(\d+)/u.exec(rule)?.[1];
  expect(zIndex, `Missing z-index for ${selector}`).toBeDefined();

  return Number(zIndex);
}

describe('game modal layering', () => {
  it('keeps the inventory overlay above the world blur layer', () => {
    expect(zIndexFor('.world-overlay.cozy-overlay')).toBeGreaterThan(
      zIndexFor('.world-frame--modal-open::after'),
    );
  });

  it('keeps the shared cozy panel close action at a 44-pixel touch target', () => {
    const ruleStart = stylesheet.indexOf('.cozy-panel__header > button {');
    const ruleEnd = stylesheet.indexOf('}', ruleStart);
    const rule = stylesheet.slice(ruleStart, ruleEnd);
    expect(rule).toContain('width: 2.75rem');
    expect(rule).toContain('height: 2.75rem');
  });
});

describe('Phase 10A avatar responsive acceptance matrix', () => {
  it('pins the required phone, tablet, landscape, desktop, and wide desktop viewports', () => {
    expect(AVATAR_VISUAL_ACCEPTANCE_VIEWPORTS).toEqual([
      [360, 800],
      [390, 844],
      [768, 1024],
      [820, 1180],
      [1024, 768],
      [1280, 800],
      [1440, 900],
      [1920, 1080],
    ]);
    expect(stylesheet).toContain('@media (max-width: 980px)');
    expect(stylesheet).toContain('@media (max-width: 680px)');
    expect(stylesheet).toContain('@media (max-width: 390px)');
  });

  it('keeps the phone preview and every progress label inside the internal mobile grid', () => {
    expect(stylesheet).toContain('--avatar-render-scale: 0.72');
    expect(stylesheet).toContain('width: min(100%, 150px)');
    expect(stylesheet).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(stylesheet).not.toContain('min-width: 520px');
  });

  it('keeps phone preview controls at the 44-pixel touch-target boundary', () => {
    expect(stylesheet).toContain('grid-template-columns: repeat(4, minmax(44px, 1fr))');
    expect(stylesheet).toContain('min-width: 44px');
    expect(stylesheet).toContain('min-height: 44px');
  });

  it('covers the full UI scale and accessibility preference combinations', () => {
    expect(AVATAR_VISUAL_ACCEPTANCE_SCALES).toEqual([90, 100, 110, 120]);
    expect(AVATAR_VISUAL_ACCEPTANCE_PREFERENCES).toEqual([
      { motion: 'default', contrast: 'default' },
      { motion: 'reduced', contrast: 'default' },
      { motion: 'default', contrast: 'high' },
      { motion: 'reduced', contrast: 'high' },
    ]);
    expect(stylesheet).toContain('@media (prefers-reduced-motion: reduce)');
    expect(stylesheet).toContain('@media (forced-colors: active)');
    expect(stylesheet).toContain("[data-visual-contrast='high']");
  });

  it('exposes separate non-saving creator, editor, and Phase 10B Wardrobe fixture routes', () => {
    expect(AVATAR_VISUAL_ACCEPTANCE_PANELS).toEqual(['creator', 'wardrobe', 'cosmetics']);
    expect(stylesheet).toContain('.avatar-customizer__preview-notice');
  });
});
