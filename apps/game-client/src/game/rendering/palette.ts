import type { AppearancePreset } from '@starville/game-core';

export interface CharacterPalette {
  readonly coat: number;
  readonly coatShade: number;
  readonly accent: number;
  readonly hair: number;
  readonly skin: number;
}

export const CHARACTER_PALETTES: Readonly<Record<AppearancePreset, CharacterPalette>> = {
  moss: {
    coat: 0x547d63,
    coatShade: 0x345545,
    accent: 0xe7c875,
    hair: 0x3f3026,
    skin: 0xe9bd94,
  },
  marigold: {
    coat: 0xc47a3e,
    coatShade: 0x8b482b,
    accent: 0xf2d487,
    hair: 0x553528,
    skin: 0xf0c9a4,
  },
  moonberry: {
    coat: 0x6e6898,
    coatShade: 0x48436f,
    accent: 0xcabbe8,
    hair: 0x302d45,
    skin: 0xdcae8d,
  },
  river: {
    coat: 0x3f7890,
    coatShade: 0x285265,
    accent: 0xaad8cf,
    hair: 0x49362b,
    skin: 0x8f5d43,
  },
};

export const WORLD_COLORS = {
  grass: 0x6d9b6b,
  grassAlternate: 0x78a675,
  plaza: 0xb7a477,
  path: 0xa99369,
  water: 0x4f8f9b,
  bridge: 0x9c7350,
  outline: 0x365640,
  shadow: 0x152a21,
  cream: 0xf1e5c1,
  gold: 0xe7c66d,
} as const;
