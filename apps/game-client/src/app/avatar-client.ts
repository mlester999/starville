import {
  AVATAR_SELECTION_LAYERS,
  avatarCreateRequestSchema,
  avatarPreviewRequestSchema,
  avatarProfileSchema,
  avatarSelectionSchema,
  avatarStarterCatalogSchema,
  avatarUpdateRequestSchema,
  compactAppearanceReferenceSchema,
  resolvedPublicAvatarSchema,
  type AvatarCatalogOption,
  type AvatarCatalogPreset,
  type AvatarSelection,
  type AvatarSelectionLayer,
  type AvatarStarterCatalog,
  type CompactAppearanceReference,
  type ResolvedPublicAvatar,
} from '@starville/avatar';
import type { AppearancePreset } from '@starville/game-core';

const AVATAR_API_PREFIX = '/api/v1/token-access/player/avatar';

export {
  AVATAR_SELECTION_LAYERS,
  avatarSelectionSchema,
  resolvedPublicAvatarSchema as resolvedAvatarProfileSchema,
};
export type {
  AvatarCatalogOption,
  AvatarCatalogPreset,
  AvatarSelection,
  AvatarSelectionLayer,
  AvatarStarterCatalog,
  CompactAppearanceReference,
};
export type ResolvedAvatarProfile = ResolvedPublicAvatar;

const FALLBACK_OPTIONS = {
  body: [
    ['willow-frame', 'Willow frame', 'A softly rounded village silhouette.'],
    ['meadow-frame', 'Meadow frame', 'A balanced village silhouette.'],
    ['brook-frame', 'Brook frame', 'A gently tapered village silhouette.'],
  ],
  skinTone: [
    ['rose-light', 'Rose light', 'A light rose-warm skin tone.', '#f4cfb2'],
    ['peach-warm', 'Peach warm', 'A warm peach skin tone.', '#e9b58e'],
    ['honey-gold', 'Honey gold', 'A golden honey skin tone.', '#cf9165'],
    ['copper-glow', 'Copper glow', 'A glowing copper skin tone.', '#ad6f4e'],
    ['umber-warm', 'Umber warm', 'A warm umber skin tone.', '#83503c'],
    ['deep-mahogany', 'Deep mahogany', 'A deep mahogany skin tone.', '#56352f'],
  ],
  face: [
    ['soft-smile', 'Soft smile', 'A gentle, relaxed smile.'],
    ['bright-smile', 'Bright smile', 'A cheerful open expression.'],
    ['calm-face', 'Calm', 'A peaceful resting expression.'],
    ['dimple-smile', 'Dimple smile', 'A small smile with cozy dimples.'],
    ['sunny-face', 'Sunny', 'A warm, optimistic expression.'],
    ['thoughtful-face', 'Thoughtful', 'A quiet, thoughtful expression.'],
  ],
  eyes: [
    ['round-eyes', 'Round eyes', 'Soft round eyes.'],
    ['bright-eyes', 'Bright eyes', 'Wide, lively eyes.'],
    ['calm-eyes', 'Calm eyes', 'Gently relaxed eyes.'],
    ['spark-eyes', 'Spark eyes', 'Eyes with a small bright highlight.'],
    ['crescent-eyes', 'Crescent eyes', 'Smiling crescent-shaped eyes.'],
    ['soft-eyes', 'Soft eyes', 'Subtle, softly shaped eyes.'],
  ],
  eyebrows: [
    ['gentle-brows', 'Gentle brows', 'Smooth, gently curved brows.'],
    ['straight-brows', 'Straight brows', 'Soft straight brows.'],
    ['arched-brows', 'Arched brows', 'Lightly arched brows.'],
    ['short-brows', 'Short brows', 'Small expressive brows.'],
  ],
  hair: [
    ['short-waves', 'Short waves', 'Soft short waves.'],
    ['cozy-bob', 'Cozy bob', 'A rounded chin-length bob.'],
    ['side-braid', 'Side braid', 'A relaxed side braid.'],
    ['cloud-curls', 'Cloud curls', 'A full cloud of curls.'],
    ['high-puff', 'High puff', 'A soft high puff.'],
    ['long-waves', 'Long waves', 'Long flowing waves.'],
    ['twin-braids', 'Twin braids', 'Two tidy village braids.'],
    ['tousled-crop', 'Tousled crop', 'A short tousled crop.'],
  ],
  hairColor: [
    ['espresso', 'Espresso', 'Deep espresso brown.', '#2f2522'],
    ['chestnut', 'Chestnut', 'Warm chestnut brown.', '#674232'],
    ['honey-brown', 'Honey brown', 'Golden honey brown.', '#a46d3b'],
    ['midnight', 'Midnight', 'Soft blue-black.', '#252838'],
    ['silver-mist', 'Silver mist', 'Cool misty silver.', '#b7b7b4'],
    ['copper-leaf', 'Copper leaf', 'Warm copper red.', '#a94f35'],
    ['moonberry', 'Moonberry', 'Muted moonberry violet.', '#514568'],
    ['river-teal', 'River teal', 'Deep river teal.', '#286267'],
  ],
  top: [
    ['moss-tunic', 'Moss tunic', 'A moss-green village tunic.', '#557b62'],
    ['marigold-jacket', 'Marigold jacket', 'A warm marigold jacket.', '#c77c3f'],
    ['moonberry-cardigan', 'Moonberry cardigan', 'A soft violet cardigan.', '#70699b'],
    ['river-vest', 'River vest', 'A cool river-blue vest.', '#3d7890'],
    ['berry-pullover', 'Berry pullover', 'A cozy berry pullover.', '#9a5267'],
    ['sunflower-shirt', 'Sunflower shirt', 'A sunny golden shirt.', '#c69a3a'],
    ['pine-overshirt', 'Pine overshirt', 'A deep pine overshirt.', '#315d4b'],
    ['cloud-sweater', 'Cloud sweater', 'A pale cloud-blue sweater.', '#7396a2'],
  ],
  bottom: [
    ['meadow-trousers', 'Meadow trousers', 'Practical meadow trousers.', '#344d42'],
    ['umber-trousers', 'Umber trousers', 'Warm umber trousers.', '#65483b'],
    ['moonberry-skirt', 'Moonberry skirt', 'A flowing moonberry skirt.', '#4f486c'],
    ['river-shorts', 'River shorts', 'Comfortable river-blue shorts.', '#31596b'],
    ['linen-trousers', 'Linen trousers', 'Light village linen trousers.', '#8a826d'],
    ['pine-skirt', 'Pine skirt', 'A deep pine village skirt.', '#294b3f'],
  ],
  footwear: [
    ['trail-boots', 'Trail boots', 'Sturdy brown trail boots.', '#493a31'],
    ['garden-shoes', 'Garden shoes', 'Soft green garden shoes.', '#3f5747'],
    ['river-boots', 'River boots', 'Deep blue river boots.', '#304c59'],
    ['festival-shoes', 'Festival shoes', 'Warm festival shoes.', '#7b493b'],
  ],
  accessories: [
    ['no-accessory', 'None', 'No accessory selected.'],
    ['star-hairpin', 'Star hairpin', 'A tiny golden star hairpin.', '#e8c96e'],
    ['leaf-clip', 'Leaf clip', 'A small green leaf clip.', '#6c9c71'],
    ['round-glasses', 'Round glasses', 'Friendly round glasses.', '#c89b62'],
    ['cozy-scarf', 'Cozy scarf', 'A soft village scarf.', '#d29657'],
    ['flower-crown', 'Flower crown', 'A simple meadow flower crown.', '#d88b9b'],
    ['small-satchel', 'Small satchel', 'A small cross-body satchel.', '#79533a'],
  ],
} as const;

function catalogOptions(
  entries: readonly (readonly [string, string, string, string?])[],
): readonly AvatarCatalogOption[] {
  return entries.map(([key, label, description, swatch]) => ({
    key,
    label,
    description,
    ...(swatch === undefined ? {} : { swatch }),
    developmentFallback: true,
    enabled: true,
    available: true,
  }));
}

export function defaultAvatarSelection(preset: AppearancePreset = 'moss'): AvatarSelection {
  const presetSelections: Readonly<Record<AppearancePreset, AvatarSelection>> = {
    moss: {
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
    },
    marigold: {
      body: 'willow-frame',
      skinTone: 'rose-light',
      face: 'bright-smile',
      eyes: 'bright-eyes',
      eyebrows: 'arched-brows',
      hair: 'cozy-bob',
      hairColor: 'chestnut',
      top: 'marigold-jacket',
      bottom: 'umber-trousers',
      footwear: 'festival-shoes',
      accessories: ['star-hairpin'],
    },
    moonberry: {
      body: 'brook-frame',
      skinTone: 'honey-gold',
      face: 'thoughtful-face',
      eyes: 'spark-eyes',
      eyebrows: 'straight-brows',
      hair: 'long-waves',
      hairColor: 'moonberry',
      top: 'moonberry-cardigan',
      bottom: 'moonberry-skirt',
      footwear: 'garden-shoes',
      accessories: ['round-glasses'],
    },
    river: {
      body: 'meadow-frame',
      skinTone: 'umber-warm',
      face: 'sunny-face',
      eyes: 'calm-eyes',
      eyebrows: 'short-brows',
      hair: 'cloud-curls',
      hairColor: 'midnight',
      top: 'river-vest',
      bottom: 'river-shorts',
      footwear: 'river-boots',
      accessories: ['cozy-scarf'],
    },
  };
  return structuredClone(presetSelections[preset]);
}

export const COMPILED_AVATAR_STARTER_CATALOG: AvatarStarterCatalog = {
  revision: 1,
  options: Object.fromEntries(
    AVATAR_SELECTION_LAYERS.map((layer) => [layer, catalogOptions(FALLBACK_OPTIONS[layer])]),
  ) as unknown as AvatarStarterCatalog['options'],
  presets: (['moss', 'marigold', 'moonberry', 'river'] as const).map((preset) => ({
    key: `${preset}-starter`,
    label: `${preset[0]!.toUpperCase()}${preset.slice(1)} starter`,
    description: 'A curated, cosmetic-only development-safe Starville starter.',
    selection: defaultAvatarSelection(preset),
  })),
  settings: {
    maximumAccessories: 1,
    customizationEnabled: true,
    developmentFallback: true,
  },
};

const REQUIRED_AVATAR_LAYERS = AVATAR_SELECTION_LAYERS.filter(
  (layer): layer is Exclude<AvatarSelectionLayer, 'accessories'> => layer !== 'accessories',
);

const EMPTY_AVATAR_OPTIONS = Object.fromEntries(
  AVATAR_SELECTION_LAYERS.map((layer) => [layer, []]),
) as unknown as AvatarStarterCatalog['options'];

export const UNAVAILABLE_AVATAR_CATALOG: AvatarStarterCatalog = {
  revision: 0,
  options: EMPTY_AVATAR_OPTIONS,
  presets: [],
  settings: {
    maximumAccessories: 0,
    customizationEnabled: false,
    developmentFallback: false,
  },
};

export function avatarSelectionAvailableInCatalog(
  catalog: AvatarStarterCatalog,
  selection: AvatarSelection,
): boolean {
  const hasOption = (layer: AvatarSelectionLayer, key: string) =>
    catalog.options[layer].some((option) => option.key === key);
  return (
    REQUIRED_AVATAR_LAYERS.every((layer) => hasOption(layer, selection[layer])) &&
    selection.accessories.every((key) => hasOption('accessories', key))
  );
}

export class AvatarRequestError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly requestId?: string,
  ) {
    super('The Starville appearance request could not be completed.');
    this.name = 'AvatarRequestError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function responseCandidate(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return value['profile'] ?? value['appearance'] ?? value['avatar'] ?? value;
}

function parseResolvedAvatarProfile(value: unknown): ResolvedAvatarProfile {
  const candidate = responseCandidate(value);
  const resolved = resolvedPublicAvatarSchema.safeParse(candidate);
  if (resolved.success) return resolved.data;

  const own = avatarProfileSchema.safeParse(candidate);
  if (!own.success) throw resolved.error;
  return {
    appearanceId: own.data.appearanceId,
    revision: own.data.revision,
    legacyFallbackPreset: own.data.legacyFallbackPreset,
    selection: own.data.selection,
    presetKey: own.data.presetKey,
  };
}

async function requestAvatarApi(
  apiUrl: string,
  path: string,
  options: { readonly method: 'GET' | 'POST' | 'PATCH'; readonly body?: unknown },
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(new URL(`${AVATAR_API_PREFIX}${path}`, apiUrl), {
      method: options.method,
      credentials: 'include',
      headers: {
        accept: 'application/json',
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      cache: 'no-store',
    });
  } catch {
    throw new AvatarRequestError(503, 'AVATAR_SERVICE_UNAVAILABLE');
  }

  const payload = (await response.json().catch(() => undefined)) as unknown;
  if (!response.ok || !isRecord(payload) || payload['success'] !== true) {
    const record = isRecord(payload) ? payload : {};
    const error = isRecord(record['error']) ? record['error'] : {};
    throw new AvatarRequestError(
      response.status,
      typeof error['code'] === 'string' ? error['code'] : 'AVATAR_REQUEST_FAILED',
      typeof record['requestId'] === 'string' ? record['requestId'] : undefined,
    );
  }
  return payload['data'];
}

export async function loadOwnAvatar(apiUrl: string): Promise<ResolvedAvatarProfile | null> {
  const value = await requestAvatarApi(apiUrl, '', { method: 'GET' });
  const candidate = responseCandidate(value);
  if (candidate === null) return null;
  return parseResolvedAvatarProfile(candidate);
}

export async function loadAvatarCatalog(apiUrl: string): Promise<AvatarStarterCatalog> {
  const value = await requestAvatarApi(apiUrl, '/catalog', { method: 'GET' });
  const parsed = avatarStarterCatalogSchema.safeParse(value);
  if (!parsed.success) return UNAVAILABLE_AVATAR_CATALOG;
  const options = Object.fromEntries(
    AVATAR_SELECTION_LAYERS.map((layer) => {
      const entries = parsed.data.options[layer] ?? [];
      return [
        layer,
        entries
          .filter((entry) => entry.enabled && entry.available)
          .map(({ key, label, description, swatch, developmentFallback, enabled, available }) => ({
            key,
            label,
            description,
            ...(swatch === undefined ? {} : { swatch }),
            developmentFallback,
            enabled,
            available,
          })),
      ];
    }),
  ) as unknown as AvatarStarterCatalog['options'];
  const complete = REQUIRED_AVATAR_LAYERS.every((layer) => options[layer].length > 0);
  const catalog = {
    revision: parsed.data.revision,
    options,
    presets: parsed.data.presets,
    settings: {
      ...parsed.data.settings,
      customizationEnabled: parsed.data.settings.customizationEnabled && complete,
    },
  } satisfies AvatarStarterCatalog;
  return {
    ...catalog,
    presets: catalog.presets.filter((preset) =>
      avatarSelectionAvailableInCatalog(catalog, preset.selection),
    ),
  };
}

export async function previewAvatar(
  apiUrl: string,
  selection: AvatarSelection,
): Promise<AvatarSelection> {
  const request = avatarPreviewRequestSchema.parse({ selection });
  const value = await requestAvatarApi(apiUrl, '/preview', {
    method: 'POST',
    body: request,
  });
  const candidate = responseCandidate(value);
  if (isRecord(candidate) && 'selection' in candidate) {
    return avatarSelectionSchema.parse(candidate['selection']);
  }
  return avatarSelectionSchema.parse(candidate);
}

export async function createAvatar(
  apiUrl: string,
  selection: AvatarSelection,
  requestId = crypto.randomUUID(),
): Promise<ResolvedAvatarProfile> {
  const request = avatarCreateRequestSchema.parse({ requestId, selection });
  const value = await requestAvatarApi(apiUrl, '', {
    method: 'POST',
    body: request,
  });
  return parseResolvedAvatarProfile(value);
}

export async function updateAvatar(
  apiUrl: string,
  selection: AvatarSelection,
  expectedRevision: number,
  requestId = crypto.randomUUID(),
): Promise<ResolvedAvatarProfile> {
  const request = avatarUpdateRequestSchema.parse({ requestId, expectedRevision, selection });
  const value = await requestAvatarApi(apiUrl, '', {
    method: 'PATCH',
    body: request,
  });
  return parseResolvedAvatarProfile(value);
}

export async function loadPublicAvatar(
  apiUrl: string,
  appearanceId: string,
  revision: number,
): Promise<ResolvedAvatarProfile> {
  const query = new URLSearchParams({ revision: String(revision) });
  const value = await requestAvatarApi(
    apiUrl,
    `/public/${encodeURIComponent(appearanceId)}?${query.toString()}`,
    { method: 'GET' },
  );
  return parseResolvedAvatarProfile(value);
}

export function fallbackResolvedAvatar(
  legacyFallbackPreset: AppearancePreset,
  appearanceId = '00000000-0000-4000-8000-000000000000',
): ResolvedAvatarProfile {
  return {
    appearanceId,
    revision: 0,
    presetKey: `${legacyFallbackPreset}-starter`,
    selection: defaultAvatarSelection(legacyFallbackPreset),
    legacyFallbackPreset,
  };
}

export function avatarSelectionsEqual(left: AvatarSelection, right: AvatarSelection): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function compactAppearanceReference(value: unknown): CompactAppearanceReference | null {
  if (!isRecord(value)) return null;
  const candidate = {
    appearanceId: value['appearanceId'],
    appearanceRevision: value['appearanceRevision'],
  };
  const parsed = compactAppearanceReferenceSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export class PublicAvatarProfileCache {
  private readonly entries = new Map<
    string,
    { readonly promise: Promise<ResolvedAvatarProfile>; references: number }
  >();

  public constructor(
    private readonly loader: (
      appearanceId: string,
      revision: number,
    ) => Promise<ResolvedAvatarProfile>,
  ) {}

  public acquire(reference: CompactAppearanceReference): Promise<ResolvedAvatarProfile> {
    const key = `${reference.appearanceId}:${String(reference.appearanceRevision)}`;
    const current = this.entries.get(key);
    if (current !== undefined) {
      current.references += 1;
      return current.promise;
    }
    const promise = this.loader(reference.appearanceId, reference.appearanceRevision).catch(
      (error: unknown) => {
        this.entries.delete(key);
        throw error;
      },
    );
    this.entries.set(key, { promise, references: 1 });
    return promise;
  }

  public release(reference: CompactAppearanceReference): void {
    const key = `${reference.appearanceId}:${String(reference.appearanceRevision)}`;
    const current = this.entries.get(key);
    if (current === undefined) return;
    current.references -= 1;
    if (current.references <= 0) this.entries.delete(key);
  }

  public clear(): void {
    this.entries.clear();
  }

  public get size(): number {
    return this.entries.size;
  }
}
