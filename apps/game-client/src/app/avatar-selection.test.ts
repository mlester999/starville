import { describe, expect, it } from 'vitest';

import {
  COMPILED_AVATAR_STARTER_CATALOG,
  avatarSelectionSchema,
  defaultAvatarSelection,
} from './avatar-client';
import {
  applyAvatarOption,
  initialAvatarSelection,
  randomizeAvatarSelection,
} from './avatar-selection';

describe('avatar selection helpers', () => {
  it('randomizes deterministically from only available catalog options', () => {
    const current = defaultAvatarSelection('moss');
    const left = randomizeAvatarSelection(
      COMPILED_AVATAR_STARTER_CATALOG,
      current,
      'all',
      'acceptance-seed',
    );
    const right = randomizeAvatarSelection(
      COMPILED_AVATAR_STARTER_CATALOG,
      current,
      'all',
      'acceptance-seed',
    );
    expect(left).toEqual(right);
    expect(avatarSelectionSchema.safeParse(left).success).toBe(true);
    for (const [layer, key] of Object.entries(left)) {
      if (layer === 'accessories') continue;
      expect(
        COMPILED_AVATAR_STARTER_CATALOG.options[
          layer as Exclude<keyof typeof left, 'accessories'>
        ].some((option) => option.key === key),
      ).toBe(true);
    }
  });

  it('keeps scoped randomization from changing unrelated layers', () => {
    const current = defaultAvatarSelection('river');
    const hair = randomizeAvatarSelection(
      COMPILED_AVATAR_STARTER_CATALOG,
      current,
      'hair',
      'hair-seed',
    );
    expect({ ...hair, hair: current.hair, hairColor: current.hairColor }).toEqual(current);
    const outfit = randomizeAvatarSelection(
      COMPILED_AVATAR_STARTER_CATALOG,
      current,
      'outfit',
      'outfit-seed',
    );
    expect({
      ...outfit,
      top: current.top,
      bottom: current.bottom,
      footwear: current.footwear,
      accessories: current.accessories,
    }).toEqual(current);
  });

  it('represents the friendly None accessory as an empty authoritative array', () => {
    expect(
      applyAvatarOption(defaultAvatarSelection('moss'), 'accessories', 'no-accessory').accessories,
    ).toEqual([]);
  });

  it('starts from authoritative catalog options when legacy defaults are unavailable', () => {
    const catalog = {
      ...COMPILED_AVATAR_STARTER_CATALOG,
      presets: [],
      options: {
        ...COMPILED_AVATAR_STARTER_CATALOG.options,
        top: [COMPILED_AVATAR_STARTER_CATALOG.options.top.at(-1)!],
        accessories: [],
      },
    };

    const selection = initialAvatarSelection(catalog, defaultAvatarSelection('moss'));
    expect(selection.top).toBe(catalog.options.top[0]?.key);
    expect(selection.accessories).toEqual([]);
    expect(() =>
      randomizeAvatarSelection(catalog, selection, 'outfit', 'no-accessory-seed'),
    ).not.toThrow();
  });
});
