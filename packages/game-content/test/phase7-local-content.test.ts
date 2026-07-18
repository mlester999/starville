import { describe, expect, it } from 'vitest';

import { closestInteraction, isPositionWalkable, PLAYER_FOOT_RADIUS } from '@starville/game-core';

import {
  PHASE_7_LOCAL_DRAFTS,
  PHASE_7_LOCAL_PREVIEW_WORLD,
  WORLD_MANIFESTS,
  getPhase7LocalDraft,
} from '../src';

describe('Phase 7 local draft world content', () => {
  it('keeps published source manifests free of local draft-only Phase 7 anchors', () => {
    expect(WORLD_MANIFESTS.every((manifest) => manifest.version === 1)).toBe(true);
    expect(
      WORLD_MANIFESTS.flatMap((manifest) => manifest.interactions).every(
        (interaction) => interaction.type === 'notice' || interaction.type === 'starter_npc',
      ),
    ).toBe(true);
    expect(
      WORLD_MANIFESTS.flatMap((manifest) => manifest.interactions).filter(
        (interaction) => interaction.type === 'starter_npc',
      ),
    ).toEqual([
      expect.objectContaining({
        id: 'phase11-willow-guide',
        npcSlug: 'willow-guide',
      }),
    ]);
    expect(PHASE_7_LOCAL_DRAFTS.every((draft) => draft.lifecycle === 'local_draft')).toBe(true);
    expect(PHASE_7_LOCAL_DRAFTS.every((draft) => draft.manifest.version === 2)).toBe(true);
    expect(
      PHASE_7_LOCAL_DRAFTS.every((draft) =>
        draft.manifest.developmentArt.label.includes('not published'),
      ),
    ).toBe(true);
  });

  it('provides six unique, walkable personal farm anchors in Moonpetal Meadow', () => {
    const manifest = getPhase7LocalDraft('moonpetal-meadow').manifest;
    const farms = manifest.interactions.filter((interaction) => interaction.type === 'farm_plot');
    expect(farms).toHaveLength(6);
    expect(new Set(farms.map((farm) => farm.farmPlotKey)).size).toBe(6);
    expect(new Set(farms.map((farm) => farm.slot))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    expect(
      farms.every((farm) =>
        isPositionWalkable(farm, PLAYER_FOOT_RADIUS, manifest.safeSaveBounds, manifest.collisions),
      ),
    ).toBe(true);
    expect(closestInteraction({ x: 12.875, y: 11.75 }, farms)?.id).toBe('phase7-farm-plot-1');
  });

  it('provides strict stable-reference shop, station, and home anchors in Lantern Square', () => {
    const interactions = getPhase7LocalDraft('lantern-square').manifest.interactions.filter(
      (interaction) => interaction.id.startsWith('phase7-'),
    );
    expect(interactions.map((interaction) => interaction.type)).toEqual([
      'shop',
      'cooking_station',
      'crafting_station',
      'home_entrance',
    ]);
    const keys = interactions.flatMap((interaction) => Object.keys(interaction));
    expect(keys).not.toEqual(
      expect.arrayContaining(['price', 'output', 'ownerPlayerId', 'balance', 'inventory']),
    );
  });

  it('retains the five-map public topology in the local preview graph', () => {
    expect(PHASE_7_LOCAL_PREVIEW_WORLD).toHaveLength(5);
    expect(new Set(PHASE_7_LOCAL_PREVIEW_WORLD.map((manifest) => manifest.id))).toEqual(
      new Set(WORLD_MANIFESTS.map((manifest) => manifest.id)),
    );
    expect(
      PHASE_7_LOCAL_PREVIEW_WORLD.find((manifest) => manifest.id === 'lantern-square')?.exits,
    ).toEqual(WORLD_MANIFESTS.find((manifest) => manifest.id === 'lantern-square')?.exits);
  });

  it('keeps the Phase 10B mirror and furniture as reachable unpublished development anchors', () => {
    const draft = getPhase7LocalDraft('lantern-square');
    const anchors = draft.manifest.interactions.filter((interaction) =>
      interaction.id.startsWith('phase10b-wardrobe-'),
    );

    expect(draft.lifecycle).toBe('local_draft');
    expect(draft.manifest.developmentArt.label).toContain('not published');
    expect(anchors.map((anchor) => anchor.id)).toEqual([
      'phase10b-wardrobe-mirror',
      'phase10b-wardrobe-furniture',
    ]);
    expect(
      anchors.every((anchor) =>
        isPositionWalkable(
          anchor,
          PLAYER_FOOT_RADIUS,
          draft.manifest.safeSaveBounds,
          draft.manifest.collisions,
        ),
      ),
    ).toBe(true);
  });
});
