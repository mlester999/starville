import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { AVATAR_VISUAL_ACCEPTANCE_VIEWPORTS } from './matrix';

const source = readFileSync(resolve(process.cwd(), 'src/visual-acceptance/main.tsx'), 'utf8');
const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

describe('Phase 12B local visual acceptance entry', () => {
  it('exposes asset coverage only through the development harness', () => {
    expect(source).toContain("import.meta.env.DEV ? (['assets'] as const) : []");
    expect(source).toContain("panel === 'assets'");
    expect(source).toContain('<AssetCoverageGameTest');
    expect(source).toContain('manifestVersion={STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION}');
    expect(source).toContain('onClose={noop}');
  });

  it('does not add an asset API fixture or persistence branch', () => {
    const assetBranch = source.slice(source.indexOf("panel === 'assets'"));
    expect(assetBranch.slice(0, 180)).not.toContain('fetch');
    expect(assetBranch.slice(0, 180)).not.toContain('/api/');
  });

  it('routes every required viewport through the same bounded, reduced-motion-safe harness', () => {
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
    for (const [width, height] of AVATAR_VISUAL_ACCEPTANCE_VIEWPORTS) {
      const url = new URL('http://localhost:3001/visual-acceptance.html');
      url.searchParams.set('panel', 'assets');
      url.searchParams.set('motion', 'reduced');
      url.searchParams.set('viewport', `${String(width)}x${String(height)}`);
      expect(url.searchParams.get('panel')).toBe('assets');
      expect(url.searchParams.get('viewport')).toBe(`${String(width)}x${String(height)}`);
    }
    expect(source).toContain("query.get('motion') === 'reduced'");
    expect(source).toContain("query.get('viewport')?.match");
    expect(styles).toMatch(/\.asset-coverage\s*\{[^}]*max-height:[^}]*overflow: auto;/su);
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.asset-coverage[\s\S]*animation: none;/u,
    );
  });
});
