import { describe, expect, it, vi } from 'vitest';

import type { AvatarGateway } from './contracts.js';
import type { LogContext, ServiceLogger } from '../contracts.js';
import { createAvatarService } from './service.js';

class SilentLogger implements ServiceLogger {
  child(_bindings: LogContext): ServiceLogger {
    return this;
  }
  trace(_message: string): void {}
  debug(_message: string): void {}
  info(_message: string): void {}
  warn(_message: string): void {}
  error(_message: string): void {}
  fatal(_message: string): void {}
}

const context = {
  walletAddress: '11111111111111111111111111111111',
  accessSessionTokenHash: 'a'.repeat(64),
  requestId: 'http-request',
};

const publicSelection = {
  body: 'moss',
  skinTone: 'skin-one',
  face: 'face-one',
  eyes: 'eyes-one',
  eyebrows: 'eyebrows-one',
  hair: 'hair-one',
  hairColor: 'hair-color-one',
  top: 'top-one',
  bottom: 'bottom-one',
  footwear: 'footwear-one',
  accessories: ['accessory-one'],
};

const persistedSelection = {
  bodyPresetKey: 'moss',
  skinPaletteKey: 'skin-one',
  faceKey: 'face-one',
  eyesKey: 'eyes-one',
  eyebrowsKey: 'eyebrows-one',
  hairKey: 'hair-one',
  hairPaletteKey: 'hair-color-one',
  topKey: 'top-one',
  bottomKey: 'bottom-one',
  footwearKey: 'footwear-one',
  accessoryKeys: ['accessory-one'],
  presetKey: null,
};

function descriptor(key: string, type: string) {
  return {
    key,
    type,
    versionId: '22222222-2222-4222-8222-222222222222',
    versionNumber: 1,
    renderOrder: 1,
    assets: [],
  };
}

function profile(overrides: Record<string, unknown> = {}) {
  return {
    appearanceId: '33333333-3333-4333-8333-333333333333',
    revision: 1,
    creatorCompleted: true,
    moduleEnabled: true,
    legacyFallbackPreset: 'moss',
    bodyPresetKey: publicSelection.body,
    skinPaletteKey: publicSelection.skinTone,
    selections: {
      face: descriptor(publicSelection.face, 'face'),
      eyes: descriptor(publicSelection.eyes, 'eyes'),
      eyebrows: descriptor(publicSelection.eyebrows, 'eyebrows'),
      hair: descriptor(publicSelection.hair, 'hair'),
      top: descriptor(publicSelection.top, 'top'),
      bottom: descriptor(publicSelection.bottom, 'bottom'),
      footwear: descriptor(publicSelection.footwear, 'footwear'),
    },
    hairPaletteKey: publicSelection.hairColor,
    accessories: [descriptor(publicSelection.accessories[0]!, 'accessory')],
    presetKey: null,
    updatedAt: '2026-07-15T08:00:00.000Z',
    ...overrides,
  };
}

function gateway(overrides: Partial<AvatarGateway> = {}): AvatarGateway {
  return {
    getCatalog: vi.fn(async () => ({ status: 'module_disabled' })),
    getProfile: vi.fn(async () => ({ status: 'not_found' })),
    preview: vi.fn(async () => ({ status: 'content_unavailable' })),
    create: vi.fn(async () => ({ status: 'content_unavailable' })),
    update: vi.fn(async () => ({ status: 'content_unavailable' })),
    resolvePublic: vi.fn(async () => ({ status: 'not_found' })),
    ...overrides,
  };
}

function catalog(items: unknown[]) {
  return {
    status: 'loaded',
    catalog: {
      bodyPresets: [
        { key: 'moss', label: 'Moss', frameWidth: 32, frameHeight: 48, anchorX: 0.5, anchorY: 1 },
      ],
      items,
      palettes: [
        {
          key: 'skin-one',
          type: 'skin',
          label: 'Skin One',
          colors: ['#c99e7e'],
          versionId: '44444444-4444-4444-8444-444444444441',
          versionNumber: 1,
        },
        {
          key: 'hair-color-one',
          type: 'hair',
          label: 'Hair One',
          colors: ['#38251d'],
          versionId: '44444444-4444-4444-8444-444444444442',
          versionNumber: 1,
        },
      ],
      presets: [
        {
          key: 'moss-starter',
          label: 'Moss Starter',
          versionId: '55555555-5555-4555-8555-555555555555',
          versionNumber: 1,
          selection: persistedSelection,
        },
      ],
      limits: { maxAccessories: 3 },
    },
  };
}

function catalogItem(type: string, animations: readonly unknown[] = []) {
  return {
    key: `${type}-one`,
    type,
    label: `${type} one`,
    description: 'A safe starter option.',
    accessLevel: 'starter',
    versionId: '66666666-6666-4666-8666-666666666666',
    versionNumber: 1,
    renderOrder: 1,
    frameWidth: 32,
    frameHeight: 48,
    sheetRows: 24,
    sheetColumns: 4,
    padding: 0,
    previewScale: 1,
    castsShadow: false,
    assets: [],
    animations,
    compatibleBodyPresetKeys: ['moss'],
  };
}

function canonicalCatalogAnimations() {
  const states = ['idle', 'walk', 'jog'] as const;
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
  return states.flatMap((state, stateIndex) =>
    directions.map((direction, directionIndex) => {
      const firstFrame = (stateIndex * directions.length + directionIndex) * 4;
      return {
        direction,
        state,
        frames: [firstFrame, firstFrame + 1, firstFrame + 2, firstFrame + 3],
        frameDurationMs: state === 'idle' ? 360 : state === 'walk' ? 120 : 80,
        loop: true,
        offsetX: 0,
        offsetY: 0,
      };
    }),
  );
}

describe('avatar service authority', () => {
  it('normalizes only active database catalog rows and marks incomplete catalogs unavailable', async () => {
    const completeItems = [
      'face',
      'eyes',
      'eyebrows',
      'hair',
      'top',
      'bottom',
      'footwear',
      'accessory',
    ].map((type) => catalogItem(type));
    const complete = createAvatarService({
      gateway: gateway({ getCatalog: vi.fn(async () => catalog(completeItems)) }),
      logger: new SilentLogger(),
    });
    const loaded = await complete.getCatalog(context);
    expect(loaded.settings.customizationEnabled).toBe(true);
    expect(loaded.options.hair[0]?.key).toBe('hair-one');
    expect(loaded.presets[0]?.selection).toEqual(publicSelection);

    const incomplete = createAvatarService({
      gateway: gateway({ getCatalog: vi.fn(async () => catalog([])) }),
      logger: new SilentLogger(),
    });
    const unavailable = await incomplete.getCatalog(context);
    expect(unavailable.settings.customizationEnabled).toBe(false);
    expect(unavailable.options.hair).toEqual([]);
    expect(JSON.stringify(unavailable)).not.toContain('meadow-frame');
  });

  it('accepts a real non-empty canonical 24-mapping avatar catalog', async () => {
    const animations = canonicalCatalogAnimations();
    expect(animations).toHaveLength(24);
    expect(new Set(animations.map(({ direction, state }) => `${state}:${direction}`)).size).toBe(
      24,
    );
    const completeItems = [
      catalogItem('face', animations),
      ...['eyes', 'eyebrows', 'hair', 'top', 'bottom', 'footwear', 'accessory'].map((type) =>
        catalogItem(type),
      ),
    ];
    const service = createAvatarService({
      gateway: gateway({ getCatalog: vi.fn(async () => catalog(completeItems)) }),
      logger: new SilentLogger(),
    });

    await expect(service.getCatalog(context)).resolves.toMatchObject({
      settings: { customizationEnabled: true },
      options: { face: [{ key: 'face-one' }] },
    });
  });

  it('returns no creator profile for a revision-zero shell', async () => {
    const service = createAvatarService({
      gateway: gateway({
        getProfile: vi.fn(async () => ({
          status: 'loaded',
          profile: profile({
            revision: 0,
            creatorCompleted: false,
            moduleEnabled: false,
            bodyPresetKey: 'moss',
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
          }),
        })),
      }),
      logger: new SilentLogger(),
    });
    await expect(service.getProfile(context)).resolves.toBeNull();
  });

  it('validates preview input before resolving closed database references', async () => {
    const preview = vi.fn(async () => ({
      status: 'previewed',
      preview: { selection: persistedSelection, resolvedVersionIds: {}, items: [] },
    }));
    const service = createAvatarService({
      gateway: gateway({ preview }),
      logger: new SilentLogger(),
    });
    await expect(service.preview(context, { selection: publicSelection })).resolves.toEqual(
      publicSelection,
    );
    expect(preview).toHaveBeenCalledWith(context, persistedSelection);

    await expect(
      service.preview(context, {
        selection: { ...publicSelection, hair: 'https://evil.invalid/hair.webp' },
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_AVATAR_SELECTION' });
    expect(preview).toHaveBeenCalledTimes(1);
  });

  it('uses client-stable request identity and revision zero for first creation', async () => {
    const create = vi.fn(async () => ({ status: 'created', profile: profile() }));
    const service = createAvatarService({
      gateway: gateway({ create }),
      logger: new SilentLogger(),
    });
    const result = await service.create(context, {
      requestId: '77777777-7777-4777-8777-777777777777',
      selection: publicSelection,
    });
    expect(result.selection).toEqual(publicSelection);
    expect(create).toHaveBeenCalledWith(
      { ...context, requestId: '77777777-7777-4777-8777-777777777777' },
      0,
      persistedSelection,
    );
  });

  it('rejects stale updates and never accepts browser-authored asset fields', async () => {
    const update = vi.fn(async () => ({ status: 'profile_changed', profile: profile() }));
    const service = createAvatarService({
      gateway: gateway({ update }),
      logger: new SilentLogger(),
    });
    await expect(
      service.update(context, {
        requestId: '88888888-8888-4888-8888-888888888888',
        expectedRevision: 1,
        selection: publicSelection,
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'AVATAR_PROFILE_CHANGED' });
    await expect(
      service.update(context, {
        requestId: '88888888-8888-4888-8888-888888888889',
        expectedRevision: 1,
        selection: { ...publicSelection, assetUrl: 'data:image/png;base64,unsafe' },
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_AVATAR_SELECTION' });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('resolves public revision-zero fallback without identity or asset URL leakage', async () => {
    const shell = profile({
      revision: 0,
      creatorCompleted: false,
      moduleEnabled: false,
      renderMode: 'legacy_fallback',
      bodyPresetKey: 'river',
      legacyFallbackPreset: 'river',
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
    });
    const service = createAvatarService({
      gateway: gateway({
        resolvePublic: vi.fn(async () => ({ status: 'loaded', appearance: shell })),
      }),
      logger: new SilentLogger(),
    });
    const result = await service.resolvePublic(shell.appearanceId, 'public-request');
    expect(result).toMatchObject({ revision: 0, legacyFallbackPreset: 'river' });
    expect(result.selection.top).toBe('river-vest');
    expect(result).not.toHaveProperty('walletAddress');
    expect(result).not.toHaveProperty('updatedAt');
  });
});
