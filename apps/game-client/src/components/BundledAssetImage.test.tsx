import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { BundledAssetImage } from './BundledAssetImage';

describe('BundledAssetImage', () => {
  it('renders a stable bundled item key without placeholder glyphs', () => {
    const markup = renderToStaticMarkup(
      <BundledAssetImage assetKey="phase7-dev-moonbean" alt="Moonbean" />,
    );

    expect(markup).toContain('data-asset-key="phase7-dev-moonbean"');
    expect(markup).toContain('/assets/starville/bundled/v1/inventory/phase7-dev-moonbean.webp');
    expect(markup).toContain('alt="Moonbean"');
  });

  it('selects a separately authored furniture rotation', () => {
    const markup = renderToStaticMarkup(
      <BundledAssetImage
        assetKey="phase7-dev-willow-chair"
        alt="Willow Chair, east-facing"
        rotation={90}
      />,
    );

    expect(markup).toContain('phase7-dev-willow-chair--rotation-90.webp');
    expect(markup).not.toContain('transform:rotate');
  });
});
