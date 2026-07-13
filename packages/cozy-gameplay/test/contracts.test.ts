import { describe, expect, it } from 'vitest';

import {
  PHASE_7_CANONICAL_CONTENT,
  PHASE_7_CROP_DEFINITIONS,
  PHASE_7_FURNITURE_DEFINITIONS,
  PHASE_7_ITEM_DEFINITIONS,
  PHASE_7_RECIPE_DEFINITIONS,
  PHASE_7_SHOP_DEFINITIONS,
  PHASE_7_STARTER_DUST,
  PHASE_7_STARTER_FARM_PLOT_COUNT,
  PHASE_7_STARTER_HOME_TEMPLATE,
  PHASE_7_STARTER_INVENTORY_CAPACITY,
  dustAccountSchema,
  farmPlotSchema,
  idempotencyKeySchema,
  inventorySchema,
  itemDefinitionSchema,
  pageSizeSchema,
  phase7ABootstrapSchema,
  phase7CanonicalContentSchema,
  quickbarSchema,
  recipeDefinitionSchema,
  shopOfferSchema,
} from '../src';

const PLAYER_ID = '11111111-1111-4111-8111-111111111111';
const STACK_ID = '22222222-2222-4222-8222-222222222222';
const MAP_VERSION_ID = '33333333-3333-4333-8333-333333333333';
const NOW = '2026-07-13T04:00:00.000Z';

function emptyQuickbar(): {
  stateVersion: number;
  assignments: {
    slot: number;
    inventoryStackId: string | null;
    assignedItemSlug: string | null;
  }[];
} {
  return {
    stateVersion: 1,
    assignments: Array.from({ length: 8 }, (_, index) => ({
      slot: index + 1,
      inventoryStackId: null,
      assignedItemSlug: null,
    })),
  };
}

describe('canonical Phase 7 content', () => {
  it('provides the complete deterministic minimum content set with valid references', () => {
    expect(phase7CanonicalContentSchema.parse(PHASE_7_CANONICAL_CONTENT)).toBeDefined();
    expect(PHASE_7_CROP_DEFINITIONS).toHaveLength(3);
    expect(PHASE_7_RECIPE_DEFINITIONS.filter((recipe) => recipe.kind === 'cooking')).toHaveLength(
      4,
    );
    expect(PHASE_7_RECIPE_DEFINITIONS.filter((recipe) => recipe.kind === 'crafting')).toHaveLength(
      2,
    );
    expect(PHASE_7_SHOP_DEFINITIONS).toHaveLength(1);
    expect(PHASE_7_FURNITURE_DEFINITIONS).toHaveLength(6);
    expect(
      PHASE_7_ITEM_DEFINITIONS.some(
        (item) =>
          item.category === 'permanent_tool' &&
          item.metadata.kind === 'permanent_tool' &&
          item.metadata.toolType === 'watering_can',
      ),
    ).toBe(true);
    expect(PHASE_7_STARTER_HOME_TEMPLATE.developmentArt).toBe(true);
    expect(PHASE_7_STARTER_DUST).toBe(250);
    expect(PHASE_7_STARTER_INVENTORY_CAPACITY).toBe(24);
    expect(PHASE_7_STARTER_FARM_PLOT_COUNT).toBe(6);
  });

  it('keeps every unavailable visual explicitly marked as development art', () => {
    expect(
      PHASE_7_ITEM_DEFINITIONS.every(
        (item) => item.assetReadiness === 'development_marker' && item.assetRef !== null,
      ),
    ).toBe(true);
  });
});

describe('item, recipe, and shop integrity', () => {
  it('rejects category metadata mismatches and unsafe permanent tools', () => {
    const item = PHASE_7_ITEM_DEFINITIONS[0];
    expect(item).toBeDefined();
    expect(
      itemDefinitionSchema.safeParse({
        ...item,
        category: 'crop',
      }).success,
    ).toBe(false);
    const tool = PHASE_7_ITEM_DEFINITIONS.find((entry) => entry.category === 'permanent_tool');
    expect(tool).toBeDefined();
    expect(
      itemDefinitionSchema.safeParse({
        ...tool,
        buyEligible: true,
        defaultBuyPrice: 1,
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate recipe ingredients and invalid shop intervals', () => {
    const recipe = PHASE_7_RECIPE_DEFINITIONS[0];
    expect(recipe).toBeDefined();
    expect(
      recipeDefinitionSchema.safeParse({
        ...recipe,
        ingredients: [
          { itemSlug: 'moonbean', quantity: 1 },
          { itemSlug: 'moonbean', quantity: 2 },
        ],
      }).success,
    ).toBe(false);
    expect(
      shopOfferSchema.safeParse({
        id: '44444444-4444-4444-8444-444444444444',
        shopSlug: 'lantern-general-store',
        itemSlug: 'moonbean-seed',
        buyPrice: 8,
        sellPrice: null,
        minimumQuantity: 2,
        maximumQuantity: 1,
        active: true,
        availableFrom: NOW,
        availableUntil: NOW,
        contentVersion: 1,
      }).success,
    ).toBe(false);
  });
});

describe('bounded economy and inventory contracts', () => {
  it('accepts only bounded pagination and replay-safe idempotency keys', () => {
    expect(pageSizeSchema.safeParse(100).success).toBe(true);
    expect(pageSizeSchema.safeParse(101).success).toBe(false);
    expect(
      idempotencyKeySchema.safeParse('plant:11111111-1111-4111-8111-111111111111').success,
    ).toBe(true);
    expect(idempotencyKeySchema.safeParse('short').success).toBe(false);
  });

  it('rejects negative DUST and inventory stacks beyond capacity or item limits', () => {
    expect(
      dustAccountSchema.safeParse({
        playerId: PLAYER_ID,
        balance: -1,
        stateVersion: 1,
        starterGrantAppliedAt: NOW,
        updatedAt: NOW,
      }).success,
    ).toBe(false);
    const seed = PHASE_7_ITEM_DEFINITIONS[0];
    expect(seed).toBeDefined();
    expect(
      inventorySchema.safeParse({
        capacity: { capacity: 24, usedSlots: 1, stateVersion: 1 },
        stacks: [
          {
            id: STACK_ID,
            item: seed,
            quantity: 100,
            acquiredAt: NOW,
            updatedAt: NOW,
            stateVersion: 1,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      inventorySchema.safeParse({
        capacity: { capacity: 24, usedSlots: 2, stateVersion: 1 },
        stacks: [],
      }).success,
    ).toBe(false);
  });

  it('requires exactly eight unique quickbar slots and unique stack assignments', () => {
    expect(quickbarSchema.safeParse(emptyQuickbar()).success).toBe(true);
    const duplicateStack = emptyQuickbar();
    duplicateStack.assignments[0] = {
      slot: 1,
      inventoryStackId: STACK_ID,
      assignedItemSlug: 'moonbean-seed',
    };
    duplicateStack.assignments[1] = {
      slot: 2,
      inventoryStackId: STACK_ID,
      assignedItemSlug: 'moonbean-seed',
    };
    expect(quickbarSchema.safeParse(duplicateStack).success).toBe(false);
  });
});

describe('farm and bootstrap contracts', () => {
  it('requires authoritative timestamps for growing plots and complete progress for harvest', () => {
    const base = {
      id: '55555555-5555-4555-8555-555555555555',
      anchorId: 'moonpetal-starter-1',
      mapVersionId: MAP_VERSION_ID,
      slot: 1,
      cropSlug: 'moonbean',
      plantedAt: NOW,
      wateredAt: null,
      growthStartedAt: null,
      readyAt: null,
      stateVersion: 1,
      updatedAt: NOW,
    };
    expect(
      farmPlotSchema.safeParse({ ...base, state: 'growing', growthProgress: 0.5 }).success,
    ).toBe(false);
    expect(
      farmPlotSchema.safeParse({
        ...base,
        state: 'ready_to_harvest',
        wateredAt: NOW,
        growthStartedAt: NOW,
        readyAt: NOW,
        growthProgress: 0.9,
      }).success,
    ).toBe(false);
  });

  it('provides a strict Phase 7A bootstrap without later milestone fields', () => {
    const seed = PHASE_7_ITEM_DEFINITIONS[0];
    expect(seed).toBeDefined();
    const bootstrap = {
      contentVersion: 1,
      dust: {
        playerId: PLAYER_ID,
        balance: 250,
        stateVersion: 1,
        starterGrantAppliedAt: NOW,
        updatedAt: NOW,
      },
      inventory: {
        capacity: { capacity: 24, usedSlots: 1, stateVersion: 1 },
        stacks: [
          {
            id: STACK_ID,
            item: seed,
            quantity: 3,
            acquiredAt: NOW,
            updatedAt: NOW,
            stateVersion: 1,
          },
        ],
      },
      quickbar: emptyQuickbar(),
      generatedAt: NOW,
    };
    expect(phase7ABootstrapSchema.safeParse(bootstrap).success).toBe(true);
    expect(phase7ABootstrapSchema.safeParse({ ...bootstrap, farmPlots: [] }).success).toBe(false);
  });
});
