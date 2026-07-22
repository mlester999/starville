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

  it('portals the landmark modal into a fixed owned layer above the world blur', () => {
    expect(stylesheet).toContain('#starville-modal-root');
    expect(stylesheet).toContain('position: fixed');
    expect(stylesheet).toContain('.game-modal-backdrop > .game-modal');
    const world = readFileSync(resolve(process.cwd(), 'src/components/GameWorld.tsx'), 'utf8');
    const modal = readFileSync(
      resolve(process.cwd(), 'src/components/WorldNoticeModal.tsx'),
      'utf8',
    );
    expect(world).toContain('<WorldNoticeModal');
    expect(modal).toContain('<GameModalShell');
    expect(modal).toContain('portal');
    expect(world).not.toContain('className="dialogue-card"');
  });

  it('keeps the shared cozy panel close action at a 44-pixel touch target', () => {
    const ruleStart = stylesheet.indexOf('.cozy-panel__header > button {');
    const ruleEnd = stylesheet.indexOf('}', ruleStart);
    const rule = stylesheet.slice(ruleStart, ruleEnd);
    expect(rule).toContain('width: 2.75rem');
    expect(rule).toContain('height: 2.75rem');
  });

  it('keeps chat and tablet quickbar targets at the 44-pixel boundary', () => {
    expect(stylesheet).toMatch(/\.chat-panel__toggle\s*\{[^}]*min-height: 2\.75rem;/su);
    expect(stylesheet).toContain('@media (min-width: 701px) and (max-width: 820px)');
    expect(stylesheet).toMatch(
      /\.game-hud-region-anchor--bottom-center > \.cozy-quickbar button\s*\{[^}]*min-width: 2\.75rem;/su,
    );
  });
});

describe('Phase 12D coordinated HUD safe regions', () => {
  it('owns six named regions and shared bottom width reservations', () => {
    const component = readFileSync(resolve(process.cwd(), 'src/components/GameWorld.tsx'), 'utf8');
    for (const region of [
      'top-left',
      'top-center',
      'top-right',
      'bottom-left',
      'bottom-center',
      'bottom-right',
    ]) {
      expect(component).toContain(region);
    }
    expect(stylesheet).toContain('--game-hud-left-width');
    expect(stylesheet).toContain('--game-hud-right-width');
    expect(stylesheet).toContain('.game-hud-safe-regions--top');
    expect(stylesheet).toContain('.game-hud-region-anchor--bottom-center > .cozy-quickbar');
  });

  it('stacks the player card and guide and reserves separate mobile rows for hotbar, prompt, and chat', () => {
    expect(stylesheet).toContain('.game-hud-region--top-left');
    expect(stylesheet).toContain('display: grid');
    expect(stylesheet).toContain('bottom: calc(14rem + env(safe-area-inset-bottom))');
    expect(stylesheet).toContain('bottom: calc(18rem + env(safe-area-inset-bottom))');
  });
});

describe('mobile world movement controls', () => {
  it('exposes the real runtime movement pad at phone widths with safe-area and 44px targets', () => {
    expect(stylesheet).toContain('@media (max-width: 700px)');
    expect(stylesheet).toContain('.game-touch-movement');
    expect(stylesheet).toContain('env(safe-area-inset-left)');
    const ruleStart = stylesheet.indexOf('.game-touch-movement button {');
    const ruleEnd = stylesheet.indexOf('}', ruleStart);
    const rule = stylesheet.slice(ruleStart, ruleEnd);
    expect(rule).toContain('min-width: 2.75rem');
    expect(rule).toContain('min-height: 2.75rem');
    expect(rule).toContain('touch-action: none');
  });
});

describe('Phase 10A avatar responsive acceptance matrix', () => {
  it('pins the required phone, tablet, landscape, desktop, and wide desktop viewports', () => {
    expect(AVATAR_VISUAL_ACCEPTANCE_VIEWPORTS).toEqual([
      [360, 800],
      [390, 844],
      [412, 915],
      [768, 1024],
      [820, 1180],
      [1024, 768],
      [1280, 800],
      [1366, 768],
      [1440, 900],
      [1920, 1080],
      [2560, 1440],
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
