import type { AvatarSelection } from '../../app/avatar-client';

const COLOR_BY_KEY: Readonly<Record<string, number>> = {
  'rose-light': 0xf4cfb2,
  'peach-warm': 0xe9b58e,
  'honey-gold': 0xcf9165,
  'copper-glow': 0xad6f4e,
  'umber-warm': 0x83503c,
  'deep-mahogany': 0x56352f,
  espresso: 0x2f2522,
  chestnut: 0x674232,
  'honey-brown': 0xa46d3b,
  midnight: 0x252838,
  'silver-mist': 0xb7b7b4,
  'copper-leaf': 0xa94f35,
  moonberry: 0x514568,
  'river-teal': 0x286267,
  'moss-tunic': 0x557b62,
  'marigold-jacket': 0xc77c3f,
  'moonberry-cardigan': 0x70699b,
  'river-vest': 0x3d7890,
  'berry-pullover': 0x9a5267,
  'sunflower-shirt': 0xc69a3a,
  'pine-overshirt': 0x315d4b,
  'cloud-sweater': 0x7396a2,
  'meadow-trousers': 0x344d42,
  'umber-trousers': 0x65483b,
  'moonberry-skirt': 0x4f486c,
  'river-shorts': 0x31596b,
  'linen-trousers': 0x8a826d,
  'pine-skirt': 0x294b3f,
  'trail-boots': 0x493a31,
  'garden-shoes': 0x3f5747,
  'river-boots': 0x304c59,
  'festival-shoes': 0x7b493b,
};

const ACCESSORY_COLOR_BY_KEY: Readonly<Record<string, number>> = {
  'star-hairpin': 0xe8c96e,
  'leaf-clip': 0x6c9c71,
  'round-glasses': 0xc89b62,
  'cozy-scarf': 0xd29657,
  'flower-crown': 0xd88b9b,
  'small-satchel': 0x79533a,
};

function hashKey(value: string): number {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function fallbackColor(key: string, saturation = 42, lightness = 44): number {
  const hue = hashKey(key) % 360;
  const chroma = (1 - Math.abs((2 * lightness) / 100 - 1)) * (saturation / 100);
  const section = hue / 60;
  const middle = chroma * (1 - Math.abs((section % 2) - 1));
  const [red, green, blue] =
    section < 1
      ? [chroma, middle, 0]
      : section < 2
        ? [middle, chroma, 0]
        : section < 3
          ? [0, chroma, middle]
          : section < 4
            ? [0, middle, chroma]
            : section < 5
              ? [middle, 0, chroma]
              : [chroma, 0, middle];
  const match = lightness / 100 - chroma / 2;
  return (
    (Math.round((red + match) * 255) << 16) |
    (Math.round((green + match) * 255) << 8) |
    Math.round((blue + match) * 255)
  );
}

function shade(color: number, factor: number): number {
  const red = Math.max(0, Math.min(255, Math.round(((color >> 16) & 0xff) * factor)));
  const green = Math.max(0, Math.min(255, Math.round(((color >> 8) & 0xff) * factor)));
  const blue = Math.max(0, Math.min(255, Math.round((color & 0xff) * factor)));
  return (red << 16) | (green << 8) | blue;
}

export interface AvatarFallbackStyle {
  readonly skin: number;
  readonly skinShade: number;
  readonly hair: number;
  readonly top: number;
  readonly topShade: number;
  readonly bottom: number;
  readonly footwear: number;
  readonly accessory: number;
  readonly bodyScale: number;
  readonly hairVariant: number;
  readonly faceVariant: number;
  readonly eyeVariant: number;
  readonly accessoryKey: string | null;
}

export function resolveAvatarFallbackStyle(selection: AvatarSelection): AvatarFallbackStyle {
  const skin = COLOR_BY_KEY[selection.skinTone] ?? fallbackColor(selection.skinTone, 30, 66);
  const hair = COLOR_BY_KEY[selection.hairColor] ?? fallbackColor(selection.hairColor, 38, 28);
  const top = COLOR_BY_KEY[selection.top] ?? fallbackColor(selection.top);
  const bottom = COLOR_BY_KEY[selection.bottom] ?? fallbackColor(selection.bottom, 34, 30);
  const footwear = COLOR_BY_KEY[selection.footwear] ?? fallbackColor(selection.footwear, 30, 25);
  const accessoryKey = selection.accessories[0] ?? null;
  return {
    skin,
    skinShade: shade(skin, 0.82),
    hair,
    top,
    topShade: shade(top, 0.68),
    bottom,
    footwear,
    accessory:
      accessoryKey === null
        ? 0xe8c96e
        : (ACCESSORY_COLOR_BY_KEY[accessoryKey] ?? fallbackColor(accessoryKey, 52, 57)),
    bodyScale:
      selection.body === 'willow-frame' ? 0.92 : selection.body === 'brook-frame' ? 1.07 : 1,
    hairVariant: hashKey(selection.hair) % 8,
    faceVariant: hashKey(selection.face) % 4,
    eyeVariant: hashKey(selection.eyes) % 4,
    accessoryKey,
  };
}

export function colorToCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/**
 * Stable, tiny depth tie for equal-foot positions. It never outranks the next
 * world-depth band, but it keeps overlapping remote villagers deterministic.
 */
export function stablePresenceDepthTie(presenceId: string): number {
  return (hashKey(presenceId) % 997) / 10_000;
}
