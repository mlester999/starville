import { existsSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { INITIAL_ROLE_PERMISSIONS } from '@starville/admin-auth';

import { CosmeticsLifecycleGuide, DisabledCosmeticShopBanner } from './cosmetics-admin-ui';

const routeRoot = new URL('../app/(protected)/game-content/cosmetics/', import.meta.url);
const routes = [
  'page.tsx',
  'catalog/page.tsx',
  'collections/page.tsx',
  'emotes/page.tsx',
  'grants/page.tsx',
  'revocations/page.tsx',
  'shop/page.tsx',
  'review/page.tsx',
  'audit/page.tsx',
  'settings/page.tsx',
  'layout.tsx',
] as const;

function source(route: (typeof routes)[number]): string {
  return readFileSync(new URL(route, routeRoot), 'utf8');
}

const allPages = routes.map(source).join('\n');
const actions = readFileSync(new URL('../app/actions/cosmetics.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('../lib/cosmetics-api.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

describe('Phase 10B cosmetics administrator experience', () => {
  it('provides dedicated protected routes and permission-sensitive navigation', () => {
    for (const route of routes) expect(existsSync(new URL(route, routeRoot)), route).toBe(true);
    expect(source('layout.tsx')).toContain("requireEnabledPlatformModule('wardrobe')");
    expect(source('layout.tsx')).toContain("hasAdminPermission(context, 'cosmetics.grant')");
    expect(source('grants/page.tsx')).toContain("requireAuthorizedAdmin('cosmetics.grant')");
    expect(source('revocations/page.tsx')).toContain("requireAuthorizedAdmin('cosmetics.revoke')");
    expect(source('review/page.tsx')).toContain("requireAuthorizedAdmin('cosmetics.review')");
    expect(source('audit/page.tsx')).toContain("requireAuthorizedAdmin('cosmetics.audit.read')");
    expect(source('shop/page.tsx')).toContain("requireAuthorizedAdmin('cosmetics.shop.read')");
  });

  it('keeps grants and revocations one-player, one-cosmetic, revision-aware, and audited', () => {
    const grants = source('grants/page.tsx');
    const revocations = source('revocations/page.tsx');
    expect(grants).toContain('Grant one cosmetic');
    expect(grants).toContain('Expected ownership state');
    expect(revocations).toContain('Revoke and apply safe fallback');
    expect(`${grants}\n${revocations}`).toContain('Required explanation');
    expect(`${grants}\n${revocations}`).not.toMatch(
      /type=["']file|name=["'](?:quantity|csv|rawJson)/u,
    );
    expect(actions).toContain('crypto.randomUUID()');
    expect(actions).toContain('adminCosmeticGrantInputSchema.parse');
    expect(actions).toContain('adminCosmeticRevocationInputSchema.parse');
    expect(actions).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('keeps customer support narrowly capable of safe player and canonical cosmetic lookup', () => {
    for (const permission of [
      'players.read',
      'avatar_content.read',
      'cosmetics.read',
      'cosmetics.grant',
      'cosmetics.revoke',
    ] as const) {
      expect(INITIAL_ROLE_PERMISSIONS.customer_support).toContain(permission);
    }
    expect(INITIAL_ROLE_PERMISSIONS.customer_support).not.toContain('cosmetics.activate');
    expect(INITIAL_ROLE_PERMISSIONS.customer_support).not.toContain('cosmetics.shop.edit');
  });

  it('reuses canonical Avatar Content and World Asset lifecycle boundaries', () => {
    const collection = renderToStaticMarkup(
      createElement(CosmeticsLifecycleGuide, { kind: 'collection' }),
    );
    const emote = renderToStaticMarkup(createElement(CosmeticsLifecycleGuide, { kind: 'emote' }));
    for (const step of ['Draft', 'Validate', 'Review', 'Approve', 'Schedule', 'Activate']) {
      expect(`${collection}\n${emote}`).toContain(step);
    }
    expect(source('catalog/page.tsx')).toContain('canonical Avatar Content registry');
    expect(source('review/page.tsx')).toContain('/world-assets/review');
    expect(allPages).not.toMatch(/dangerouslySetInnerHTML|name=["'](?:json|assetUrl|script)/u);
  });

  it('makes the future cosmetic shop structurally and visibly unavailable', () => {
    const banner = renderToStaticMarkup(createElement(DisabledCosmeticShopBanner));
    expect(banner).toContain('COSMETIC PURCHASES ARE DISABLED');
    expect(banner).toContain('NO OFFERS ARE PUBLISHED');
    expect(source('shop/page.tsx')).toContain('Purchase reachable');
    expect(source('shop/page.tsx')).toContain('Unavailable for publication in Phase 10B');
    expect(allPages).not.toMatch(/>\s*Buy\s*</u);
    expect(allPages).not.toMatch(/purchaseCosmetic|settleCosmetic/iu);
  });

  it('uses strict trusted reads and never exposes another player acquisition history publicly', () => {
    for (const endpoint of [
      '/api/v1/admin/cosmetics/overview',
      '/api/v1/admin/cosmetics/settings',
      '/api/v1/admin/cosmetics/shop',
      '/api/v1/admin/cosmetics/audit',
    ]) {
      expect(api).toContain(endpoint);
    }
    expect(api).toContain('.strict()');
    expect(source('catalog/page.tsx')).toContain('player acquisition history is not exposed');
    expect(source('audit/page.tsx')).toContain('inside this authorized audit surface');
  });

  it('provides responsive, touch-sized, keyboard-visible, contrast-aware styling', () => {
    expect(styles).toContain('.cosmetics-disabled-banner');
    expect(styles).toContain('.cosmetics-entitlement-form');
    expect(styles).toMatch(/@media \(max-width: 760px\)[\s\S]*\.cosmetics-entitlement-form/u);
    expect(styles).toContain('@media (prefers-contrast: more)');
    expect(styles).toContain(':focus-visible');
  });
});
