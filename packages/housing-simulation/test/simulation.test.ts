import { describe, expect, it } from 'vitest';

import { runHousingSimulation } from '../src';

describe('deterministic housing simulation', () => {
  it('reports bounded Tier 1, Tier 2, storage, DUST, and replay behavior', () => {
    const result = runHousingSimulation({
      tierOneFurnitureCapacity: 8,
      tierTwoFurnitureCapacity: 12,
      tierOneStorageCapacity: 16,
      tierTwoStorageCapacity: 24,
      upgradeDustCost: 250,
      playerDustBalance: 500,
      placementCount: 8,
      storageSlotsUsed: 15,
      layoutPayloadBytes: 8_192,
      replayCount: 2,
      gameTest: false,
    });
    expect(result.valid).toBe(true);
    expect(result.tierOne).toEqual({ furnitureRemaining: 0, storageRemaining: 1 });
    expect(result.dustAfterUpgrade).toBe(250);
    expect(result.replaySettlementCount).toBe(0);
    expect(result.autoActivatesTuning).toBe(false);
  });

  it('never persists Game Test simulation activity', () => {
    expect(
      runHousingSimulation({
        tierOneFurnitureCapacity: 8,
        tierTwoFurnitureCapacity: 12,
        tierOneStorageCapacity: 16,
        tierTwoStorageCapacity: 24,
        upgradeDustCost: 250,
        playerDustBalance: 10,
        placementCount: 2,
        storageSlotsUsed: 1,
        layoutPayloadBytes: 1_024,
        replayCount: 2,
        gameTest: true,
      }).persistentWrites,
    ).toBe(0);
  });
});
