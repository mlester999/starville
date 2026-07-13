import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CozyGameplay } from './CozyGameplay';

const fixtures = vi.hoisted(() => {
  const now = '2026-07-13T04:00:00.000Z';
  const tool = {
    id: '71000000-0000-4000-8000-000000000021',
    slug: 'starter-watering-can',
    name: 'Starter Watering Can',
    description: 'A permanent village tool.',
    category: 'permanent_tool' as const,
    stackable: false,
    maxStackSize: 1,
    buyEligible: false,
    sellEligible: false,
    defaultBuyPrice: null,
    defaultSellPrice: null,
    assetRef: 'phase7-dev-starter-watering-can',
    assetReadiness: 'development_marker' as const,
    active: true,
    contentVersion: 1,
    metadata: { kind: 'permanent_tool' as const, toolType: 'watering_can' as const },
  };
  const furniture = {
    id: '71000000-0000-4000-8000-000000000015',
    slug: 'willow-chair',
    name: 'Willow Chair',
    description: 'A cozy starter chair.',
    category: 'furniture' as const,
    stackable: false,
    maxStackSize: 1,
    buyEligible: true,
    sellEligible: true,
    defaultBuyPrice: 48,
    defaultSellPrice: 12,
    assetRef: 'phase7-dev-willow-chair',
    assetReadiness: 'development_marker' as const,
    active: true,
    contentVersion: 1,
    metadata: { kind: 'furniture' as const, furnitureSlug: 'willow-chair' },
  };
  const stack = {
    id: '11111111-1111-4111-8111-111111111111',
    item: tool,
    quantity: 1,
    acquiredAt: now,
    updatedAt: now,
    stateVersion: 1,
  };
  const furnitureStack = {
    id: '22222222-2222-4222-8222-222222222222',
    item: furniture,
    quantity: 1,
    acquiredAt: now,
    updatedAt: now,
    stateVersion: 1,
  };
  const quickbar = {
    assignments: Array.from({ length: 8 }, (_, index) => ({
      slot: index + 1,
      inventoryStackId: index === 0 ? stack.id : null,
      assignedItemSlug: index === 0 ? tool.slug : null,
    })),
    stateVersion: 1,
  };
  const inventory = {
    capacity: { capacity: 24, usedSlots: 2, stateVersion: 1 },
    stacks: [stack, furnitureStack],
  };
  return { now, tool, furniture, stack, furnitureStack, quickbar, inventory };
});

vi.mock('../app/cozy-gameplay-client', () => ({
  bootstrapCozyGameplay: vi.fn(async () => ({
    contentVersion: 1,
    dust: {
      playerId: '22222222-2222-4222-8222-222222222222',
      balance: 250,
      stateVersion: 1,
      starterGrantAppliedAt: fixtures.now,
      updatedAt: fixtures.now,
    },
    inventory: fixtures.inventory,
    quickbar: fixtures.quickbar,
    generatedAt: fixtures.now,
  })),
  loadCozyInventory: vi.fn(async () => ({
    inventory: fixtures.inventory,
    quickbar: fixtures.quickbar,
  })),
  loadFarmPlots: vi.fn(async () => ({
    contentVersion: 1,
    plots: [],
    generatedAt: fixtures.now,
  })),
  loadItemCatalog: vi.fn(async () => ({
    contentVersion: 1,
    generatedAt: fixtures.now,
    items: [fixtures.tool, fixtures.furniture],
  })),
  loadPlayerHome: vi.fn(async () => ({
    location: 'public_world',
    home: {
      id: '33333333-3333-4333-8333-333333333333',
      ownerPlayerId: '22222222-2222-4222-8222-222222222222',
      template: {
        id: '44444444-4444-4444-8444-444444444444',
        slug: 'starter-cottage-interior',
        name: 'Starter Cottage',
        templateVersion: 1,
        bounds: { minX: 0, minY: 0, maxX: 10, maxY: 8 },
        spawn: { x: 5, y: 6 },
        exit: { x: 5, y: 7 },
        blockedCells: [],
        developmentArt: true,
        active: true,
      },
      placements: [],
      returnDestination: {
        mapId: 'lantern-square',
        mapVersionId: '55555555-5555-4555-8555-555555555555',
        x: 12,
        y: 8,
        facingDirection: 'south',
      },
      stateVersion: 1,
      createdAt: fixtures.now,
      updatedAt: fixtures.now,
    },
  })),
  loadDustLedger: vi.fn(async () => ({
    account: {
      playerId: '22222222-2222-4222-8222-222222222222',
      balance: 250,
      stateVersion: 1,
      starterGrantAppliedAt: fixtures.now,
      updatedAt: fixtures.now,
    },
    items: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  })),
  loadRecipeCatalog: vi.fn(),
  loadShopCatalog: vi.fn(),
  updateQuickbar: vi.fn(),
  mutateFarm: vi.fn(),
  executeRecipe: vi.fn(),
  executeShopTransaction: vi.fn(),
  changeHomeAccess: vi.fn(),
  placeFurniture: vi.fn(),
  updateFurniture: vi.fn(),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

describe('CozyGameplay accessible HUD', () => {
  it('shows the authoritative DUST balance and opens inventory without touching Phaser', async () => {
    const onOpenChange = vi.fn();
    await act(async () => {
      root.render(
        <CozyGameplay
          apiUrl="http://localhost:4000"
          interaction={null}
          onAccessInvalid={vi.fn()}
          onInteractionClose={vi.fn()}
          onOpenChange={onOpenChange}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('250 DUST');
    const inventoryButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Inventory',
    );
    await act(async () => inventoryButton?.click());
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
      'Inventory & Quickbar',
    );
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('selects slots 1–8 but ignores number keys while a form field has focus', async () => {
    await act(async () => {
      root.render(
        <CozyGameplay
          apiUrl="http://localhost:4000"
          interaction={null}
          onAccessInvalid={vi.fn()}
          onInteractionClose={vi.fn()}
          onOpenChange={vi.fn()}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
    });
    expect(container.querySelector('[aria-label^="Quickbar Slot 2"]')?.className).toContain(
      'selected',
    );

    const input = document.createElement('input');
    container.append(input);
    input.focus();
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' })));
    expect(container.querySelector('[aria-label^="Quickbar Slot 2"]')?.className).toContain(
      'selected',
    );
    expect(container.querySelector('[aria-label^="Quickbar Slot 3"]')?.className).not.toContain(
      'selected',
    );
  });

  it('explains quickbar Slot 2 with beginner-friendly inventory copy', async () => {
    const { updateQuickbar } = await import('../app/cozy-gameplay-client');
    vi.mocked(updateQuickbar).mockResolvedValue({
      quickbar: {
        assignments: Array.from({ length: 8 }, (_, index) => ({
          slot: index + 1,
          inventoryStackId: index === 1 ? fixtures.stack.id : null,
          assignedItemSlug: index === 1 ? fixtures.tool.slug : null,
        })),
        stateVersion: 2,
      },
      replayed: false,
    });

    await act(async () => {
      root.render(
        <CozyGameplay
          apiUrl="http://localhost:4000"
          interaction={null}
          onAccessInvalid={vi.fn()}
          onInteractionClose={vi.fn()}
          onOpenChange={vi.fn()}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const inventoryButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Inventory',
    );
    await act(async () => inventoryButton?.click());

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('Editing Slot 1');
    expect(dialog?.textContent).toContain('Press 1 during gameplay');
    expect(dialog?.querySelectorAll('[aria-label^="Quickbar Slot "]')).toHaveLength(8);
    expect(dialog?.textContent).not.toContain('displayed state was refreshed from the server');
    expect(dialog?.textContent).not.toContain('Select a stack for quickbar');

    const slot2 = [...dialog!.querySelectorAll('button')].find((button) =>
      button.getAttribute('aria-label')?.startsWith('Quickbar Slot 2'),
    );
    await act(async () => slot2?.click());
    expect(dialog?.textContent).toContain('Editing Slot 2');
    expect(dialog?.textContent).toContain('Press 2 during gameplay to select this quickbar slot.');
    expect(dialog?.textContent).toContain('Slot 2 is currently empty.');
    expect(dialog?.textContent).toContain('Move shortcut to Slot 2');
    expect(dialog?.textContent).toContain('Remove item from Slot 2');
    expect(dialog?.textContent).toContain('Currently assigned to Slot 1');
    expect(dialog?.textContent).toContain(
      'Furniture is placed from inside your home and cannot be assigned to the quickbar.',
    );
    expect(dialog?.textContent).toContain(
      'Quickbar items are shortcuts. Assigning an item does not duplicate or remove it from your inventory.',
    );

    const moveButton = [...dialog!.querySelectorAll('button')].find(
      (button) => button.textContent === 'Move shortcut to Slot 2',
    );
    await act(async () => {
      moveButton?.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(updateQuickbar).toHaveBeenCalled();
    expect(dialog?.textContent).toContain('Quickbar updated');
    expect(dialog?.textContent).toMatch(
      /Starter Watering Can (is now available|replaced the previous item) in Slot 2/,
    );
    expect(dialog?.textContent).not.toContain('displayed state');
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
