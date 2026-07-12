import { readFileSync } from 'node:fs';
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

  it('keeps sensitive player operations semantic, reasoned, and wallet-identified', () => {
    const source = readFileSync(new URL('./player-action-dialog.tsx', import.meta.url), 'utf8');

    expect(source).toContain('<dialog');
    expect(source).toContain('aria-describedby');
    expect(source).toContain('aria-labelledby');
    expect(source).toContain('minLength={12}');
    expect(source).toContain('maxLength={500}');
    expect(source).toContain('name="requestId"');
    expect(source).toContain('value={props.idempotencyKey}');
    expect(source).toContain('Wallet:');
    expect(source).toContain('if (pending) event.preventDefault()');
    expect(source).toContain('triggerRef.current?.focus()');
  });

  it('keeps the world editor structured, guarded, and free of raw-manifest editing', () => {
    const editor = readFileSync(new URL('./world-editor.tsx', import.meta.url), 'utf8');
    const preview = readFileSync(new URL('./world-draft-preview.tsx', import.meta.url), 'utf8');

    expect(editor).toContain('unsaved world changes');
    expect(editor).toContain('Undo');
    expect(editor).toContain('Redo');
    expect(editor).toContain('World Y / depth base');
    expect(editor).toContain("addCollision('capsule')");
    expect(editor).toContain('Validate saved draft');
    expect(editor).not.toMatch(/<textarea[^>]+name=["'](?:json|manifest)/u);
    expect(preview).toContain('DRAFT PREVIEW');
    expect(preview).toContain('no player persistence');
    expect(preview).toContain('Preview exits are inert');
  });
});
