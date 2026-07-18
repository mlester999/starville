import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routes = readFileSync(new URL('../routes/economy.ts', import.meta.url), 'utf8');
const gateway = readFileSync(new URL('./gateway.ts', import.meta.url), 'utf8');
const errors = readFileSync(new URL('../errors.ts', import.meta.url), 'utf8');

describe('Phase 11C General Store API boundary', () => {
  it('uses canonical interaction routes for workspace, transactions, events, receipts, and tutorial', () => {
    for (const path of [
      '/shops/interactions/:interactionId',
      '/shops/interactions/:interactionId/transactions',
      '/shops/interactions/:interactionId/events',
      '/shop-receipts/:receiptId',
      '/shops/interactions/:interactionId/tutorial/accept',
      '/shops/interactions/:interactionId/tutorial/turn-in',
    ]) {
      expect(routes).toContain(path);
    }
    expect(routes).toContain('shopTransactionRequestV2Schema');
    expect(routes).toContain('shopEventQuerySchema');
    expect(routes).toContain('assertTrustedBrowserMutation');
    expect(routes).toContain('authorizePlayer(request, reply, options)');
  });

  it('maps every authoritative shop refusal to a stable owner-safe API code', () => {
    for (const status of [
      'wrong_world',
      'too_far',
      'shop_disabled',
      'buying_disabled',
      'selling_disabled',
      'catalog_changed',
      'item_not_buyable',
      'item_not_sellable',
      'item_bound',
      'price_changed',
      'insufficient_dust',
      'inventory_full',
      'inventory_quantity_insufficient',
      'stock_conflict',
      'out_of_stock',
      'purchase_limit',
      'sale_limit',
      'global_limit',
      'request_already_processed',
      'receipt_not_found',
      'quest_objective_incomplete',
      'quest_reward_already_settled',
    ]) {
      expect(routes).toContain(`${status}:`);
      expect(gateway).toContain(`'${status}'`);
    }
    expect(errors).toContain('SHOP_OUT_OF_STOCK');
    expect(errors).toContain('RECEIPT_NOT_FOUND');
  });

  it('passes observed revisions but never accepts client-selected settlement authority', () => {
    for (const parameter of [
      'p_expected_unit_price',
      'p_expected_catalog_version_id',
      'p_expected_catalog_revision',
      'p_expected_entry_revision',
      'p_expected_stock_revision',
      'p_expected_dust_state_version',
      'p_expected_inventory_state_version',
      'p_idempotency_key',
    ]) {
      expect(gateway).toContain(parameter);
    }
    expect(gateway).not.toMatch(/p_(?:resulting_dust|dust_delta|stock_result|remaining_limit)/u);
    expect(routes).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(routes).not.toContain('error.message');
  });

  it('keeps administrator catalog, stock, live-ops, and reconciliation mutations permissioned', () => {
    for (const permission of [
      'economy.shop.edit',
      'economy.shop.publish',
      'economy.stock.manage',
      'economy.live_ops.manage',
      'economy.reconciliation.manage',
    ]) {
      expect(routes).toContain(`'${permission}'`);
    }
    expect(routes).toContain('/catalog-successors');
    expect(routes).toContain('/shops/versions/:versionId/entries');
    expect(routes).toContain('shopCatalogEntryCreateSchema');
    expect(routes).toContain('shopCatalogEntryRemoveSchema');
    expect(routes).toContain('/live-ops');
    expect(routes).toContain('/restock');
    expect(routes).toContain('/reconciliation');
  });
});
