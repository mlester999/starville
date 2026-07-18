// PHASE9BA_NONFUNCTIONAL_SECURITY_FIXTURE: security-shaped text is inert test evidence.
import { existsSync, readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LifecycleStepper, StatusChip } from './economy-admin-ui';

const routeRoot = new URL('../app/(protected)/economy/', import.meta.url);
const routes = [
  'page.tsx',
  'ledger/page.tsx',
  'sources/page.tsx',
  'sinks/page.tsx',
  'shops/page.tsx',
  'shops/[shopId]/page.tsx',
  'policies/page.tsx',
  'reconciliation/page.tsx',
  'risk/page.tsx',
  'corrections/page.tsx',
  'simulations/page.tsx',
  'token-claims/page.tsx',
  'audit/page.tsx',
] as const;

function source(route: (typeof routes)[number]): string {
  return readFileSync(new URL(route, routeRoot), 'utf8');
}

const allPages = routes.map(source).join('\n');
const actions = readFileSync(new URL('../app/actions/economy.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('../lib/economy-api.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const confirmation = readFileSync(new URL('./economy-confirm-action.tsx', import.meta.url), 'utf8');
const economyLayout = readFileSync(
  new URL('../app/(protected)/economy/layout.tsx', import.meta.url),
  'utf8',
);

describe('Phase 9A.1 economy administrator experience', () => {
  it('provides every dedicated protected economy route', () => {
    for (const route of routes) {
      expect(existsSync(new URL(route, routeRoot)), route).toBe(true);
    }
    expect(source('ledger/page.tsx')).toContain("requireAuthorizedAdmin('economy.audit.read')");
    expect(source('sources/page.tsx')).toContain("requireAuthorizedAdmin('economy.settings.read')");
    expect(source('sinks/page.tsx')).toContain("requireAuthorizedAdmin('economy.settings.read')");
    expect(source('shops/page.tsx')).toContain("requireAuthorizedAdmin('economy.shop.read')");
    expect(source('risk/page.tsx')).toContain("requireAuthorizedAdmin('economy.risk.read')");
    expect(source('simulations/page.tsx')).toContain(
      "requireAuthorizedAdmin('economy.simulation.run')",
    );
    expect(source('token-claims/page.tsx')).toContain("requireAuthorizedAdmin('economy.read')");
    expect(economyLayout).toContain('resolveEconomyNavigationHref');
    expect(economyLayout).toContain("href: '/economy/token-claims'");
    expect(economyLayout).not.toContain("requireAuthorizedAdmin('economy.read')");
  });

  it('uses typed trusted API calls for reads and reviewed mutations', () => {
    for (const endpoint of [
      '/api/v1/admin/economy/sources',
      '/api/v1/admin/economy/sinks',
      '/api/v1/admin/economy/shops',
      '/api/v1/admin/economy/policies',
      '/api/v1/admin/economy/reconciliation',
      '/api/v1/admin/economy/risk',
      '/api/v1/admin/economy/corrections',
      '/api/v1/admin/economy/simulations',
      '/api/v1/admin/economy/audit',
    ]) {
      expect(api).toContain(endpoint);
    }
    expect(api).toContain('economySourcesSchema.parse');
    expect(api).toContain('economyShopDetailSchema.parse');
    expect(api).toContain('economyPoliciesSchema.parse');
    expect(api).toContain('economySimulationsSchema.parse');
    expect(api).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('shows an understandable shop and policy lifecycle without raw configuration editing', () => {
    const shop = source('shops/[shopId]/page.tsx');
    const policy = source('policies/page.tsx');
    for (const label of [
      'Validate draft',
      'Submit for review',
      'Approve reviewed version',
      'Publish now',
    ]) {
      expect(`${shop}\n${policy}`).toContain(label);
    }
    expect(shop).toContain('Safe preview');
    expect(shop).toContain('never deducts DUST');
    expect(policy).toContain('Planning estimate only');
    expect(`${shop}\n${policy}`).not.toMatch(/name=["'](?:json|configurationJson|rawJson)/u);
    expect(`${shop}\n${policy}`).not.toContain('auto-publish');
    expect(`${shop}\n${policy}`).toContain('Roll back to this version');
    expect(actions).toContain("'rollback'");
  });

  it('requires explicit confirmation for publication and restores dialog focus', () => {
    expect(confirmation).toContain('<dialog');
    expect(confirmation).toContain('showModal()');
    expect(confirmation).toContain('aria-describedby');
    expect(confirmation).toContain('aria-labelledby');
    expect(confirmation).toContain('triggerRef.current?.focus()');
    expect(source('shops/[shopId]/page.tsx')).toContain('explicit action');
    expect(source('policies/page.tsx')).toContain('No recommendation is published automatically');
  });

  it('keeps reconciliation and corrections evidence-based with separation of duties', () => {
    const reconciliation = source('reconciliation/page.tsx');
    const corrections = source('corrections/page.tsx');
    expect(reconciliation).toContain('never rewrite a balance automatically');
    expect(reconciliation).toContain('There is deliberately no Repair All action');
    expect(corrections).toContain('creatorIsCurrentAdmin');
    expect(corrections).toContain('requiresSecondApproval');
    expect(corrections).toContain('Second approval');
    expect(`${reconciliation}\n${corrections}`).not.toContain('Set Balance');
    expect(actions).toContain("'economy.correction.review'");
  });

  it('keeps heuristic risk decisions human-reviewed', () => {
    const risk = source('risk/page.tsx');
    for (const action of ['Acknowledge', 'Investigate', 'Resolve', 'Dismiss']) {
      expect(risk).toContain(action);
    }
    expect(risk).toContain('no account is suspended automatically');
    expect(risk).not.toContain('suspendPlayer');
  });

  it('compares all candidates and keeps the recommendation unpublished', () => {
    const simulations = source('simulations/page.tsx');
    for (const candidate of [
      'current-baseline',
      'more-useful-spending',
      'lower-repeatable-emissions',
      'balanced-combination',
    ]) {
      expect(simulations).toContain(candidate);
    }
    for (const population of ['100', '1000', '10000']) expect(simulations).toContain(population);
    for (const duration of ['30', '90', '180']) expect(simulations).toContain(duration);
    expect(simulations).toContain('Simulation Mode');
    expect(simulations).toContain('does not change player balances or published configuration');
    expect(simulations).toContain('unpublished');
    expect(actions).toContain('meanDailySource: 18');
    expect(actions).toContain('meanDailySink: 16');
  });

  it('renders semantic status and lifecycle components with text labels', () => {
    const status = renderToStaticMarkup(createElement(StatusChip, { value: 'in_review' }));
    const lifecycle = renderToStaticMarkup(
      createElement(LifecycleStepper, { status: 'approved', kind: 'shop' }),
    );
    expect(status).toContain('In Review');
    expect(lifecycle).toContain('aria-label="shop version lifecycle"');
    expect(lifecycle).toContain('Approved');
    expect(lifecycle).toContain('Published');
  });

  it('has responsive cards, mobile table labels, focus states, and reduced motion', () => {
    expect(styles).toContain('.economy-section-navigation');
    expect(styles).toContain('.economy-table td::before');
    expect(styles).toContain('content: attr(data-label)');
    expect(styles).toMatch(/@media \(max-width: 820px\)[\s\S]*\.economy-table/u);
    expect(styles).toMatch(/@media \(max-width: 540px\)[\s\S]*\.economy-card-actions/u);
    expect(styles).toContain('.economy-confirm-dialog::backdrop');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(allPages).toContain('data-label=');
  });

  it('exposes the Phase 11C General Store catalog, stock, evidence, and live-ops workspace', () => {
    const shop = source('shops/[shopId]/page.tsx');
    for (const label of [
      'Phase 11C buy and sell catalog',
      'Catalog entries',
      'Stock and restock',
      'Transactions',
      'Receipts',
      'Shop live ops',
    ]) {
      expect(shop).toContain(label);
    }
    for (const field of [
      'buyPrice',
      'sellPrice',
      'stockMode',
      'restockMode',
      'playerBuyDailyLimit',
      'playerSellDailyLimit',
      'expectedStockRevision',
    ]) {
      expect(shop).toContain(`name="${field}"`);
    }
    expect(shop).toContain('economyShopCatalogSuccessorAction');
    expect(shop).toContain('economyShopCatalogEntryCreateAction');
    expect(shop).toContain('economyShopCatalogEntryAction');
    expect(shop).toContain('economyShopCatalogEntryRemoveAction');
    expect(shop).toContain('Remove from draft');
    expect(shop).toContain('economyShopRestockAction');
    expect(shop).toContain('economyShopReconciliationAction');
  });

  it('keeps Phase 11C mutations permissioned, revisioned, reasoned, and owner-safe', () => {
    expect(actions).toContain("requireAuthorizedAdmin('economy.shop.edit')");
    expect(actions).toContain("requireAuthorizedAdmin('economy.stock.manage')");
    expect(actions).toContain("requireAuthorizedAdmin('economy.live_ops.manage')");
    expect(actions).toContain("requireAuthorizedAdmin('economy.reconciliation.manage')");
    expect(actions).toContain('expectedActiveVersionId: z.uuid()');
    expect(actions).toContain('expectedRevision: z.coerce.number().int().positive()');
    expect(actions).toContain('expectedStockRevision: z.coerce.number().int().positive()');
    expect(actions).toContain('reason: z.string().trim().min(12)');
    expect(actions).not.toContain('?version=${base.versionId}');
    expect(api).toContain('/operations');
    expect(api).toContain('/catalog-successors');
    expect(api).toContain("method: 'DELETE'");
    expect(api).toContain('/entries/${encodeURIComponent(entryId)}');
    expect(api).toContain('/live-ops');
    expect(api).toContain('/reconciliation');
  });
});
