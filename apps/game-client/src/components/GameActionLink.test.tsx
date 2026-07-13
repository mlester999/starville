import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { GameActionLink } from './GameActionLink';

describe('GameActionLink', () => {
  it('renders a secondary button-styled link without browser-default anchor classes', () => {
    const markup = renderToStaticMarkup(
      createElement(GameActionLink, {
        href: 'http://localhost:3000',
        variant: 'secondary',
        children: 'Return to Starville',
      }),
    );
    expect(markup).toContain('href="http://localhost:3000"');
    expect(markup).toContain('game-action-link');
    expect(markup).toContain('game-action-link--secondary');
    expect(markup).toContain('gate-secondary');
    expect(markup).toContain('data-game-action-link="secondary"');
    expect(markup).toContain('Return to Starville');
  });

  it('supports primary variant for CTA actions', () => {
    const markup = renderToStaticMarkup(
      createElement(GameActionLink, {
        href: 'https://example.com/status',
        variant: 'primary',
        children: 'Status page',
      }),
    );
    expect(markup).toContain('game-action-link--primary');
    expect(markup).toContain('gate-primary');
  });
});
