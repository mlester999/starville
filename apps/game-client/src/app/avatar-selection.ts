import {
  AVATAR_SELECTION_LAYERS,
  avatarSelectionAvailableInCatalog,
  avatarSelectionSchema,
  type AvatarSelection,
  type AvatarSelectionLayer,
  type AvatarStarterCatalog,
} from './avatar-client';

export type AvatarRandomizeScope = 'all' | 'hair' | 'outfit';

function seededRandom(seed: string): () => number {
  let value = 2_166_136_261;
  for (const character of seed) {
    value ^= character.codePointAt(0) ?? 0;
    value = Math.imul(value, 16_777_619);
  }
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function choose(
  catalog: AvatarStarterCatalog,
  layer: AvatarSelectionLayer,
  random: () => number,
): string {
  const options = catalog.options[layer];
  const option = options[Math.floor(random() * options.length)] ?? options[0];
  if (option === undefined) throw new Error(`Avatar catalog has no ${layer} options.`);
  return option.key;
}

export function randomizeAvatarSelection(
  catalog: AvatarStarterCatalog,
  current: AvatarSelection,
  scope: AvatarRandomizeScope,
  seed: string,
): AvatarSelection {
  const random = seededRandom(seed);
  const next = structuredClone(current);
  const layers: readonly AvatarSelectionLayer[] =
    scope === 'hair'
      ? ['hair', 'hairColor']
      : scope === 'outfit'
        ? ['top', 'bottom', 'footwear', 'accessories']
        : AVATAR_SELECTION_LAYERS;

  for (const layer of layers) {
    if (layer === 'accessories') {
      const options = catalog.options.accessories;
      if (options.length === 0) {
        next.accessories = [];
      } else {
        const key = choose(catalog, layer, random);
        next.accessories = key === 'no-accessory' ? [] : [key];
      }
    } else {
      next[layer] = choose(catalog, layer, random);
    }
  }
  return avatarSelectionSchema.parse(next);
}

export function initialAvatarSelection(
  catalog: AvatarStarterCatalog,
  preferred: AvatarSelection,
): AvatarSelection {
  if (avatarSelectionAvailableInCatalog(catalog, preferred)) return structuredClone(preferred);
  const preset = catalog.presets.find((entry) =>
    avatarSelectionAvailableInCatalog(catalog, entry.selection),
  );
  if (preset !== undefined) return structuredClone(preset.selection);
  return avatarSelectionSchema.parse({
    body: choose(catalog, 'body', () => 0),
    skinTone: choose(catalog, 'skinTone', () => 0),
    face: choose(catalog, 'face', () => 0),
    eyes: choose(catalog, 'eyes', () => 0),
    eyebrows: choose(catalog, 'eyebrows', () => 0),
    hair: choose(catalog, 'hair', () => 0),
    hairColor: choose(catalog, 'hairColor', () => 0),
    top: choose(catalog, 'top', () => 0),
    bottom: choose(catalog, 'bottom', () => 0),
    footwear: choose(catalog, 'footwear', () => 0),
    accessories: [],
  });
}

export function applyAvatarOption(
  selection: AvatarSelection,
  layer: AvatarSelectionLayer,
  optionKey: string,
): AvatarSelection {
  const next = structuredClone(selection);
  if (layer === 'accessories') {
    next.accessories = optionKey === 'no-accessory' ? [] : [optionKey];
  } else {
    next[layer] = optionKey;
  }
  return avatarSelectionSchema.parse(next);
}

export function selectedAvatarOption(
  selection: AvatarSelection,
  layer: AvatarSelectionLayer,
): string {
  if (layer === 'accessories') return selection.accessories[0] ?? 'no-accessory';
  return selection[layer];
}

export function avatarSelectionSummary(
  catalog: AvatarStarterCatalog,
  selection: AvatarSelection,
): string {
  const label = (layer: AvatarSelectionLayer, key: string) =>
    catalog.options[layer].find((option) => option.key === key)?.label ?? key;
  const accessory = selection.accessories[0];
  return [
    label('body', selection.body),
    label('skinTone', selection.skinTone),
    label('hair', selection.hair),
    label('hairColor', selection.hairColor),
    label('top', selection.top),
    accessory === undefined ? 'no accessory' : label('accessories', accessory),
  ].join(', ');
}
