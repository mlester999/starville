import { existsSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { avatarStableKeySchema } from '@starville/avatar';

import {
  AVATAR_DIRECTIONS,
  AvatarLifecycle,
  AvatarValidationPreview,
  DirectionCoverage,
} from './avatar-admin-ui';

const routeRoot = new URL('../app/(protected)/game-content/avatars/', import.meta.url);
const routes = [
  'page.tsx',
  'catalog/page.tsx',
  'catalog/[definitionId]/page.tsx',
  'assets/page.tsx',
  'review/page.tsx',
  'validation/page.tsx',
  'presets/page.tsx',
  'audit/page.tsx',
  'settings/page.tsx',
  'layout.tsx',
  'loading.tsx',
  'error.tsx',
] as const;

function source(route: (typeof routes)[number]): string {
  return readFileSync(new URL(route, routeRoot), 'utf8');
}

const allPages = routes.map(source).join('\n');
const actions = readFileSync(new URL('../app/actions/avatar-content.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('../lib/avatar-api.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

describe('Phase 10A avatar content administrator experience', () => {
  it('provides every dedicated protected route with narrow direct authorization', () => {
    for (const route of routes) expect(existsSync(new URL(route, routeRoot)), route).toBe(true);
    expect(source('layout.tsx')).toContain("requireEnabledPlatformModule('avatar_customization')");
    expect(source('catalog/page.tsx')).toContain("requireAuthorizedAdmin('avatar_content.read')");
    expect(source('review/page.tsx')).toContain("requireAuthorizedAdmin('avatar_content.review')");
    expect(source('audit/page.tsx')).toContain(
      "requireAuthorizedAdmin('avatar_content.audit.read')",
    );
    expect(source('settings/page.tsx')).toContain(
      "requireAuthorizedAdmin('avatar_content.settings.read')",
    );
  });

  it('uses strict trusted API parsing and carries request IDs plus expected revisions', () => {
    for (const endpoint of [
      '/api/v1/admin/avatar-content/overview',
      '/api/v1/admin/avatar-content/catalog',
      '/api/v1/admin/avatar-content/presets',
      '/api/v1/admin/avatar-content/audit',
      '/api/v1/admin/avatar-content/settings',
    ]) {
      expect(api).toContain(endpoint);
    }
    expect(api).toContain('.strict()');
    expect(api).toContain('AVATAR_KEY_MIN_LENGTH');
    expect(api).toContain('AVATAR_KEY_MAX_LENGTH');
    expect(avatarStableKeySchema.safeParse('aa').success).toBe(false);
    expect(avatarStableKeySchema.safeParse('abc').success).toBe(true);
    expect(avatarStableKeySchema.safeParse('a'.repeat(80)).success).toBe(true);
    expect(avatarStableKeySchema.safeParse('a'.repeat(81)).success).toBe(false);
    expect(actions).toContain('crypto.randomUUID()');
    expect(actions).toContain('expectedRevision');
    expect(actions).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('keeps authoring structured and never exposes raw JSON or arbitrary asset URLs', () => {
    const editor = source('catalog/[definitionId]/page.tsx');
    for (const section of [
      'General and rendering',
      'Compatibility',
      'Frame mapping preview',
      'Approved asset references',
      'Animation mapping',
      'Validation',
      'Controlled lifecycle actions',
    ]) {
      expect(editor).toContain(section);
    }
    expect(editor).not.toMatch(/name=["'](?:json|rawJson|assetUrl|script)["']/u);
    expect(allPages).not.toMatch(/dangerouslySetInnerHTML|javascript:|data:image/u);
    expect(source('assets/page.tsx')).toContain('World Asset');
    expect(source('assets/page.tsx')).toContain('never accepts arbitrary URLs');
  });

  it('shows separated validation, review, approval, activation, and superseding controls', () => {
    const editor = source('catalog/[definitionId]/page.tsx');
    for (const label of [
      'Validate',
      'Submit for review',
      'Accept review',
      'Reject review',
      'Approve explicitly',
      'Activate approved version',
      'Supersede active version',
    ]) {
      expect(editor).toContain(label);
    }
    for (const permission of [
      'avatar_content.edit',
      'avatar_content.review',
      'avatar_content.approve',
      'avatar_content.activate',
    ]) {
      expect(editor).toContain(permission);
    }
  });

  it('renders textual lifecycle and complete eight-direction coverage', () => {
    const lifecycle = renderToStaticMarkup(createElement(AvatarLifecycle, { state: 'approved' }));
    const coverage = renderToStaticMarkup(
      createElement(DirectionCoverage, { directions: AVATAR_DIRECTIONS }),
    );
    expect(lifecycle).toContain('aria-label="Avatar content lifecycle"');
    expect(lifecycle).toContain('Approved');
    expect(coverage.match(/class="is-present"/gu)).toHaveLength(8);
    for (const direction of AVATAR_DIRECTIONS) {
      expect(coverage.toLowerCase()).toContain(direction.replaceAll('_', ' '));
    }
  });

  it('labels development previews and covers idle, walk, jog, light, dark, mobile, and world', () => {
    const variants = [
      createElement(AvatarValidationPreview, {
        direction: 'north',
        state: 'idle',
        backdrop: 'light',
        scale: 'mobile',
      }),
      createElement(AvatarValidationPreview, {
        direction: 'southwest',
        state: 'walk',
        backdrop: 'dark',
        scale: 'world',
      }),
      createElement(AvatarValidationPreview, {
        direction: 'east',
        state: 'jog',
      }),
    ];
    const markup = variants.map((variant) => renderToStaticMarkup(variant)).join('\n');
    for (const label of ['Idle', 'Walk', 'Jog', 'Light', 'Dark', 'Mobile', 'World']) {
      expect(markup).toContain(label);
    }
    expect(markup).toContain('Procedural development fallback; not final production art.');
    expect(source('validation/page.tsx')).toContain('without activating content');
  });

  it('keeps settings, presets, and audits permission-separated', () => {
    expect(actions).toContain("requireAuthorizedAdmin('avatar_content.settings.edit')");
    expect(actions).toContain("requireAuthorizedAdmin('avatar_content.activate')");
    expect(source('presets/page.tsx')).toContain('Publish preset explicitly');
    expect(source('audit/page.tsx')).toContain('Append-only evidence');
    expect(source('settings/page.tsx')).toContain('revision-checked, idempotent, audited');
  });

  it('provides responsive, keyboard-visible, contrast-aware, and reduced-motion styling', () => {
    expect(styles).toContain('.avatar-section-navigation');
    expect(styles).toContain('min-height: 2.75rem');
    expect(styles).toMatch(/@media \(max-width: 760px\)[\s\S]*\.avatar-page-header/u);
    expect(styles).toMatch(/@media \(max-width: 480px\)[\s\S]*\.avatar-preview-matrix/u);
    expect(styles).toContain('@media (prefers-contrast: more)');
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.avatar-validation-figure/u,
    );
    expect(styles).toContain(':focus-visible');
  });
});
