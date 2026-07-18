import { describe, expect, it } from 'vitest';

import {
  AVATAR_ANIMATION_STATES,
  avatarAlignedLayerCollectionSchema,
  avatarAnimationSetSchema,
  avatarProfileSchema,
  avatarSelectionSchema,
  avatarStableKeySchema,
  compactAppearanceReferenceSchema,
  fromPersistedAvatarSelection,
  fromPersistedAvatarProfile,
  toPersistedAvatarSelection,
} from '../src/index.js';

const selection = {
  body: 'meadow-frame',
  skinTone: 'peach-warm',
  face: 'soft-smile',
  eyes: 'round-eyes',
  eyebrows: 'gentle-brows',
  hair: 'short-waves',
  hairColor: 'espresso',
  top: 'moss-tunic',
  bottom: 'meadow-trousers',
  footwear: 'trail-boots',
  accessories: ['leaf-clip'],
};

const directions = [
  'north',
  'northeast',
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
] as const;

function animationMappings(frameCount = 4) {
  return AVATAR_ANIMATION_STATES.flatMap((state, stateIndex) =>
    directions.map((direction, directionIndex) => ({
      state,
      direction,
      row: stateIndex * 8 + directionIndex,
      startColumn: 0,
      frameCount,
      frameDurationMs: state === 'idle' ? 400 : state === 'walk' ? 140 : 95,
      loop: true,
      anchorX: 0.5,
      anchorY: 0.92,
    })),
  );
}

describe('avatar contracts', () => {
  it('enforces the canonical three-to-eighty-character key boundary', () => {
    expect(avatarStableKeySchema.safeParse('ab').success).toBe(false);
    expect(avatarStableKeySchema.safeParse('abc').success).toBe(true);
    expect(avatarStableKeySchema.safeParse('hair.front_01').success).toBe(true);
    expect(avatarStableKeySchema.safeParse('1hair').success).toBe(false);
    expect(avatarStableKeySchema.safeParse('a'.repeat(80)).success).toBe(true);
    expect(avatarStableKeySchema.safeParse('a'.repeat(81)).success).toBe(false);
  });

  it('accepts only a closed bounded appearance selection', () => {
    expect(avatarSelectionSchema.parse(selection)).toEqual(selection);
    expect(
      avatarSelectionSchema.safeParse({ ...selection, hair: 'https://evil.invalid/hair.png' })
        .success,
    ).toBe(false);
    expect(
      avatarSelectionSchema.safeParse({ ...selection, accessories: ['leaf-clip', 'leaf-clip'] })
        .success,
    ).toBe(false);
    expect(avatarSelectionSchema.safeParse({ ...selection, renderOrder: 9_999 }).success).toBe(
      false,
    );
  });

  it('maps the public selection to the exact database write shape', () => {
    const persisted = toPersistedAvatarSelection(selection);
    expect(persisted).toEqual({
      bodyPresetKey: 'meadow-frame',
      skinPaletteKey: 'peach-warm',
      faceKey: 'soft-smile',
      eyesKey: 'round-eyes',
      eyebrowsKey: 'gentle-brows',
      hairKey: 'short-waves',
      hairPaletteKey: 'espresso',
      topKey: 'moss-tunic',
      bottomKey: 'meadow-trousers',
      footwearKey: 'trail-boots',
      accessoryKeys: ['leaf-clip'],
      presetKey: null,
    });
    expect(fromPersistedAvatarSelection(persisted)).toEqual(selection);
  });

  it('maps an authoritative database profile without leaking identity fields', () => {
    const content = (key: string, type: string) => ({
      key,
      type,
      versionId: '22222222-2222-4222-8222-222222222222',
      versionNumber: 1,
      renderOrder: 1,
      assets: [],
    });
    const value = fromPersistedAvatarProfile({
      appearanceId: '11111111-1111-4111-8111-111111111111',
      revision: 2,
      creatorCompleted: true,
      moduleEnabled: true,
      legacyFallbackPreset: 'moss',
      bodyPresetKey: selection.body,
      skinPaletteKey: selection.skinTone,
      selections: {
        face: content(selection.face, 'face'),
        eyes: content(selection.eyes, 'eyes'),
        eyebrows: content(selection.eyebrows, 'eyebrows'),
        hair: content(selection.hair, 'hair'),
        top: content(selection.top, 'top'),
        bottom: content(selection.bottom, 'bottom'),
        footwear: content(selection.footwear, 'footwear'),
      },
      hairPaletteKey: selection.hairColor,
      accessories: selection.accessories.map((key) => content(key, 'accessory')),
      presetKey: 'moss-starter',
      updatedAt: '2026-07-15T08:00:00.000Z',
    });
    expect(avatarProfileSchema.parse(value).selection).toEqual(selection);
    expect(value).not.toHaveProperty('playerId');
    expect(value).not.toHaveProperty('walletAddress');
  });

  it('resolves revision-zero incomplete shells through the safe legacy fallback', () => {
    const value = fromPersistedAvatarProfile({
      appearanceId: '11111111-1111-4111-8111-111111111111',
      revision: 0,
      creatorCompleted: false,
      moduleEnabled: false,
      renderMode: 'legacy_fallback',
      legacyFallbackPreset: 'river',
      bodyPresetKey: 'river',
      skinPaletteKey: null,
      selections: {
        face: null,
        eyes: null,
        eyebrows: null,
        hair: null,
        top: null,
        bottom: null,
        footwear: null,
      },
      hairPaletteKey: null,
      accessories: [],
      presetKey: null,
      updatedAt: '2026-07-15T08:00:00.000Z',
    });
    expect(value.revision).toBe(0);
    expect(value.selection.top).toBe('river-vest');
  });

  it('keeps realtime appearance references compact and URL-free', () => {
    expect(
      compactAppearanceReferenceSchema.parse({
        appearanceId: '11111111-1111-4111-8111-111111111111',
        appearanceRevision: 2,
      }),
    ).toEqual({
      appearanceId: '11111111-1111-4111-8111-111111111111',
      appearanceRevision: 2,
    });
    expect(
      compactAppearanceReferenceSchema.safeParse({
        appearanceId: '11111111-1111-4111-8111-111111111111',
        appearanceRevision: 2,
        assetUrl: 'https://evil.invalid/avatar.webp',
      }).success,
    ).toBe(false);
  });

  it('requires all eight directions for idle, walk, and jog', () => {
    const mappings = animationMappings();
    expect(avatarAnimationSetSchema.safeParse(mappings).success).toBe(true);
    expect(avatarAnimationSetSchema.safeParse(mappings.slice(1)).success).toBe(false);
    expect(avatarAnimationSetSchema.safeParse([...mappings.slice(1), mappings[1]]).success).toBe(
      false,
    );
  });

  it('rejects misaligned modular layer dimensions and frame counts', () => {
    const base = {
      layer: 'base_body',
      frameWidth: 128,
      frameHeight: 192,
      mappings: animationMappings(),
    };
    expect(
      avatarAlignedLayerCollectionSchema.safeParse([
        base,
        { ...base, layer: 'top', mappings: animationMappings(5) },
      ]).success,
    ).toBe(false);
    expect(
      avatarAlignedLayerCollectionSchema.safeParse([
        base,
        { ...base, layer: 'hair_front', frameWidth: 96 },
      ]).success,
    ).toBe(false);
  });
});
