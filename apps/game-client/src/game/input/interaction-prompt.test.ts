import { describe, expect, it } from 'vitest';

import type { WorldInteraction } from '@starville/game-core';

import { interactionPromptLabel } from './interaction-prompt';

const anchor = {
  x: 1,
  y: 1,
  range: 1.5,
  title: 'Landmark',
  content: 'Inspect this landmark.',
} as const;

describe('world interaction prompt verbs', () => {
  it.each<readonly [WorldInteraction, string]>([
    [{ ...anchor, id: 'shop', type: 'shop', shopSlug: 'general-store' }, 'Shop'],
    [{ ...anchor, id: 'cook', type: 'cooking_station', stationType: 'cooking_hearth' }, 'Cook'],
    [
      { ...anchor, id: 'craft', type: 'crafting_station', stationType: 'crafting_workbench' },
      'Craft',
    ],
    [{ ...anchor, id: 'notice', type: 'notice' }, 'Read'],
    [
      {
        ...anchor,
        id: 'home',
        type: 'home_entrance',
        homeTemplateSlug: 'starter-cottage',
      },
      'Enter home',
    ],
    [{ ...anchor, id: 'phase10b-wardrobe-mirror', type: 'notice' }, 'Customize character'],
  ])('uses %s without claiming the downstream action succeeded', (interaction, expected) => {
    expect(interactionPromptLabel(interaction)).toBe(expected);
  });
});
