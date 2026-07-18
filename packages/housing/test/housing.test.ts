import { describe, expect, it } from 'vitest';

import {
  createHousingLocalDraft,
  createHousingRestorationDraft,
  filterPlaceables,
  housingDraftDirty,
  housingGameTestFixture,
  housingLocalFixture,
  redoHousingDraft,
  simulateGameTestLayout,
  simulateGameTestStorageTransfer,
  simulateGameTestUpgrade,
  undoHousingDraft,
  updateHousingDraft,
} from '../src';

describe('housing contracts and local decoration draft', () => {
  it('keeps unsaved edit history local and bounded', () => {
    const initial = createHousingLocalDraft(housingLocalFixture);
    const moved = updateHousingDraft(initial, [{ ...initial.placements[0]!, x: 3, rotation: 90 }]);
    expect(housingDraftDirty(moved, housingLocalFixture)).toBe(true);
    expect(undoHousingDraft(moved).placements[0]).toMatchObject({ x: 2, rotation: 0 });
    expect(redoHousingDraft(undoHousingDraft(moved)).placements[0]).toMatchObject({
      x: 3,
      rotation: 90,
    });
  });

  it('filters the canonical Willow Chair without exposing storage paths', () => {
    expect(filterPlaceables(housingLocalFixture, 'willow', 'seating')).toHaveLength(1);
    expect(JSON.stringify(housingLocalFixture)).not.toContain('storage/v1');
  });

  it('restores immutable history only as a local draft and omits unavailable furniture', () => {
    const historical = {
      status: 'loaded' as const,
      revision: {
        ...housingLocalFixture.layout.activeRevision,
        id: '55555555-5555-4555-8555-555555555555',
        revisionNumber: 2,
        current: false,
      },
      placements: [
        {
          ...housingLocalFixture.layout.placements[0]!,
          effectiveScale: 1,
          placementState: 'placed' as const,
        },
        {
          ...housingLocalFixture.layout.placements[0]!,
          instanceId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          furnitureDefinitionId: '77777777-7777-4777-8777-777777777777',
          itemDefinitionId: '88888888-8888-4888-8888-888888888888',
          effectiveScale: 1,
          placementState: 'placed' as const,
        },
      ],
    };
    const result = createHousingRestorationDraft(housingLocalFixture, historical);

    expect(result.draft.restorationSourceRevisionId).toBe(historical.revision.id);
    expect(result.draft.baseRevision).toBe(
      housingLocalFixture.layout.activeRevision.revisionNumber,
    );
    expect(result.draft.placements).toHaveLength(1);
    expect(result.omissions).toEqual([
      {
        furnitureDefinitionId: '77777777-7777-4777-8777-777777777777',
        reason: 'definition_unavailable',
      },
    ]);
    expect(housingDraftDirty(result.draft, housingLocalFixture)).toBe(true);
  });

  it('simulates a Game Test save without a persistence result', () => {
    const draft = createHousingLocalDraft(housingLocalFixture);
    const result = simulateGameTestLayout(housingGameTestFixture, draft.placements);
    expect(result.persisted).toBe(false);
    expect(result.workspace.gameTest).toBe(true);
    expect(result.announcement).toContain('No player state was saved');
  });

  it('simulates storage and upgrades without leaving Game Test state', () => {
    const deposit = simulateGameTestStorageTransfer(
      housingGameTestFixture,
      'deposit',
      housingGameTestFixture.ownedPlaceables[0]!.furniture.itemDefinitionId,
    );
    expect(deposit.persisted).toBe(false);
    expect(deposit.workspace.storage.usedSlots).toBe(1);
    const withdrawal = simulateGameTestStorageTransfer(
      deposit.workspace,
      'withdrawal',
      housingGameTestFixture.ownedPlaceables[0]!.furniture.itemDefinitionId,
    );
    expect(withdrawal.workspace.storage.usedSlots).toBe(0);
    const upgrade = simulateGameTestUpgrade(
      housingGameTestFixture,
      housingGameTestFixture.upgrades[0]!.versionId,
    );
    expect(upgrade.persisted).toBe(false);
    expect(upgrade.workspace.home.homeTier).toBe(2);
    expect(upgrade.workspace.dust.balance).toBe(250);
    expect(housingGameTestFixture.home.homeTier).toBe(1);
  });
});
