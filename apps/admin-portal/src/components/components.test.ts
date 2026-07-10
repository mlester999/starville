import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AdminBrand } from './admin-brand';
import { AuthFrame } from './auth-frame';
import { Notice } from './notice';

describe('administrator interface components', () => {
  it('renders a restrained Starville administrator identity', () => {
    const markup = renderToStaticMarkup(createElement(AdminBrand, { compact: true }));

    expect(markup).toContain('aria-label="Starville Admin"');
    expect(markup).toContain('STARVILLE');
    expect(markup).toContain('ADMINISTRATION');
  });

  it('connects an authentication page heading to its main panel', () => {
    const markup = renderToStaticMarkup(
      createElement(AuthFrame, {
        eyebrow: 'Restricted',
        title: 'Secure access',
        description: 'Verified staff only.',
        children: createElement('form', { 'aria-label': 'Test form' }),
      }),
    );

    expect(markup).toContain('aria-labelledby="auth-title"');
    expect(markup).toContain('id="auth-title"');
    expect(markup).toContain('Restricted to authorized Starville staff.');
  });

  it('announces safe status messages without exposing implementation detail', () => {
    const markup = renderToStaticMarkup(
      createElement(Notice, { tone: 'warning', children: 'Unable to verify access.' }),
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain('Unable to verify access.');
  });
});
