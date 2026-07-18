import { describe, expect, it } from 'vitest';

import {
  closestInteraction,
  lanternSquareManifest,
  mapInteractionSchema,
  rawLanternSquareManifest,
  validateMapManifest,
  LANTERN_SQUARE_ASSET_IDS,
  type MapInteraction,
} from '../src';

const interactions: readonly MapInteraction[] = [
  {
    id: 'farm-a',
    type: 'farm_plot',
    x: 5,
    y: 5,
    range: 1.1,
    title: 'Farm plot one',
    content: 'A personal farming anchor.',
    farmPlotKey: 'moonpetal-starter-1',
    slot: 1,
  },
  {
    id: 'farm-b',
    type: 'farm_plot',
    x: 7,
    y: 5,
    range: 1.1,
    title: 'Farm plot two',
    content: 'A personal farming anchor.',
    farmPlotKey: 'moonpetal-starter-2',
    slot: 2,
  },
];

describe('Phase 7 map interaction boundary', () => {
  it('preserves world anchors and strictly validates every data-only interaction kind through Phase 11A', () => {
    const manifestInteractions = lanternSquareManifest().interactions;
    expect(manifestInteractions.map(({ type }) => type)).toEqual(['starter_npc', 'notice']);
    expect(
      manifestInteractions.every(
        (interaction) => mapInteractionSchema.safeParse(interaction).success,
      ),
    ).toBe(true);
    expect(
      [
        interactions[0],
        {
          id: 'shop',
          type: 'shop',
          x: 8,
          y: 8,
          range: 1.5,
          title: 'Shop',
          content: 'Open the trusted shop.',
          shopSlug: 'lantern-general-store',
        },
        {
          id: 'cook',
          type: 'cooking_station',
          x: 8,
          y: 8,
          range: 1.5,
          title: 'Cooking hearth',
          content: 'Open trusted recipes.',
          stationType: 'cooking_hearth',
        },
        {
          id: 'craft',
          type: 'crafting_station',
          x: 8,
          y: 8,
          range: 1.5,
          title: 'Crafting workbench',
          content: 'Open trusted recipes.',
          stationType: 'crafting_workbench',
        },
        {
          id: 'home',
          type: 'home_entrance',
          x: 8,
          y: 8,
          range: 1.5,
          title: 'Starter home',
          content: 'Enter the private home.',
          homeTemplateSlug: 'starter-cottage-interior',
        },
        {
          id: 'guide',
          type: 'starter_npc',
          x: 8,
          y: 8,
          range: 1.5,
          title: 'Willow Guide',
          content: 'Open the server-authoritative starter quest.',
          npcSlug: 'willow-guide',
        },
        {
          id: 'garden-one',
          type: 'home_farm_tile',
          x: 3,
          y: 3,
          range: 1.5,
          title: 'Garden one',
          content: 'Use the selected farming tool or seed.',
          tileKey: 'garden-1',
          slot: 1,
        },
      ].every((value) => mapInteractionSchema.safeParse(value).success),
    ).toBe(true);
  });

  it('rejects client-authoritative economy and ownership fields', () => {
    expect(
      mapInteractionSchema.safeParse({
        id: 'shop',
        type: 'shop',
        x: 8,
        y: 8,
        range: 1.5,
        title: 'Shop',
        content: 'Open the trusted shop.',
        shopSlug: 'lantern-general-store',
        price: 1,
      }).success,
    ).toBe(false);
    expect(
      mapInteractionSchema.safeParse({
        id: 'home',
        type: 'home_entrance',
        x: 8,
        y: 8,
        range: 1.5,
        title: 'Starter home',
        content: 'Enter the private home.',
        homeTemplateSlug: 'starter-cottage-interior',
        ownerPlayerId: '11111111-1111-4111-8111-111111111111',
      }).success,
    ).toBe(false);
  });

  it('selects overlapping equal-distance anchors deterministically by stable ID', () => {
    expect(closestInteraction({ x: 6, y: 5 }, interactions)?.id).toBe('farm-a');
  });

  it('rejects interaction anchors placed inside blocking world geometry', () => {
    expect(() =>
      validateMapManifest(
        {
          ...rawLanternSquareManifest,
          interactions: [
            ...rawLanternSquareManifest.interactions,
            {
              id: 'blocked-farm',
              type: 'farm_plot',
              x: 2,
              y: 14,
              range: 1,
              title: 'Blocked farm',
              content: 'This anchor is unsafe.',
              farmPlotKey: 'blocked-farm',
              slot: 1,
            },
          ],
        },
        LANTERN_SQUARE_ASSET_IDS,
      ),
    ).toThrow(/not safely reachable/u);
  });
});
