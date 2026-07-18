import { describe, expect, it } from 'vitest';

import { lanternSquareManifest } from '@starville/game-core';
import type { PlayableVerticalSlice } from '@starville/cozy-gameplay';

import { personalHomeRuntimeWorld } from './personal-home-world';

const plot = {
  id: '33333333-3333-4333-8333-333333333333',
  ownerPlayerId: '22222222-2222-4222-8222-222222222222',
  lifecycle: 'active',
  templateId: '44444444-4444-4444-8444-444444444444',
  templateSlug: 'starter-cottage-interior',
  templateVersion: 1,
  instanceKey: 'personal-home:33333333-3333-4333-8333-333333333333',
  bounds: { minX: 0, minY: 0, maxX: 10, maxY: 8 },
  spawn: { x: 5, y: 6 },
  exit: { x: 5, y: 7 },
  currentPosition: { x: 5, y: 6 },
  location: 'personal_home',
  tiles: Array.from({ length: 8 }, (_, index) => ({
    id: `a1100000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    tileKey: `garden-${String(index + 1)}`,
    slot: index + 1,
    x: 3 + (index % 4),
    y: 3 + Math.floor(index / 4),
    state: 'empty',
    preparedAt: null,
    crop: null,
    stateVersion: 1,
    updatedAt: '2026-07-17T01:00:00.000Z',
  })),
  farmingStateVersion: 1,
  stateVersion: 1,
  createdAt: '2026-07-17T01:00:00.000Z',
  updatedAt: '2026-07-17T01:00:00.000Z',
} as const;

describe('personal home runtime world', () => {
  it('uses the existing renderer with one owner-bound private identity and eight farm interactions', () => {
    const publicManifest = lanternSquareManifest();
    const world = personalHomeRuntimeWorld(
      {
        manifest: publicManifest,
        versionId: '11111111-1111-4111-8111-111111111111',
        checksum: 'a'.repeat(64),
        assetDeliveries: [],
      },
      { plot } as unknown as PlayableVerticalSlice,
    );

    expect(world.versionId).toBe(plot.id);
    expect(world.checksum).toHaveLength(64);
    expect(world.manifest.name).toBe('Private Home Plot');
    expect(world.manifest.spawns).toEqual(
      expect.arrayContaining([expect.objectContaining({ x: plot.spawn.x, y: plot.spawn.y })]),
    );
    expect(
      world.manifest.interactions.filter(({ type }) => type === 'home_farm_tile'),
    ).toHaveLength(8);
    expect(world.manifest.interactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'home_entrance',
          x: plot.exit.x,
          y: plot.exit.y,
        }),
      ]),
    );
    expect(world.manifest.exits.every((exit) => !exit.enabled)).toBe(true);
  });

  it('does not enumerate another owner or introduce persistent public-world destinations', () => {
    const world = personalHomeRuntimeWorld(
      {
        manifest: lanternSquareManifest(),
        versionId: '11111111-1111-4111-8111-111111111111',
        checksum: 'a'.repeat(64),
        assetDeliveries: [],
      },
      { plot } as unknown as PlayableVerticalSlice,
    );
    const serialized = JSON.stringify(world);

    expect(serialized).toContain(plot.id);
    expect(serialized).not.toContain(plot.ownerPlayerId);
    expect(world.manifest.exits.every((exit) => exit.destinationMapId === null)).toBe(true);
  });

  it('binds home workstation interactions to canonical server instance UUIDs', () => {
    const station = {
      id: 'b1100000-0000-4000-8000-000000000101',
      homeId: plot.id,
      worldObjectId: 'starter-cooking-hearth',
      definition: {
        id: 'b1100000-0000-4000-8000-000000000001',
        key: 'starter-cooking-hearth',
        name: 'Cooking Hearth',
        description: 'Prepare warm recipes at home.',
        type: 'cooking_hearth',
        allowedRecipeCategories: ['cooking'],
        queueCapacity: 2,
        simultaneousJobPolicy: 'bounded_owner_queue',
        interactionRadius: 1.75,
        enabled: true,
        assetRef: null,
        assetReadiness: 'development_marker',
        pinnedAssetVersionId: null,
        fallbackMarker: 'H',
        animationConfig: {},
        soundConfig: {},
        configurationRevision: 1,
      },
      position: { x: 2, y: 2 },
      interactionPoint: { x: 2.5, y: 2.5 },
      enabled: true,
      stateVersion: 1,
      queue: { capacity: 2, occupied: 0, running: 0, ready: 0, remainingSlots: 2 },
    } as const;
    const world = personalHomeRuntimeWorld(
      {
        manifest: lanternSquareManifest(),
        versionId: '11111111-1111-4111-8111-111111111111',
        checksum: 'a'.repeat(64),
        assetDeliveries: [],
      },
      { plot: { ...plot, workstations: [station] } } as unknown as PlayableVerticalSlice,
    );

    expect(world.manifest.interactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: station.worldObjectId,
          type: 'cooking_station',
          workstationInstanceId: station.id,
          range: station.definition.interactionRadius,
        }),
      ]),
    );
    expect(JSON.stringify(world.manifest.interactions)).not.toContain(plot.ownerPlayerId);
  });
});
