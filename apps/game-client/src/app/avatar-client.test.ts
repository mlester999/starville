import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  COMPILED_AVATAR_STARTER_CATALOG,
  PublicAvatarProfileCache,
  UNAVAILABLE_AVATAR_CATALOG,
  avatarSelectionSchema,
  compactAppearanceReference,
  createAvatar,
  defaultAvatarSelection,
  loadAvatarCatalog,
  loadOwnAvatar,
  loadPublicAvatar,
  resolvedAvatarProfileSchema,
  updateAvatar,
  type ResolvedAvatarProfile,
} from './avatar-client';

const originalFetch = globalThis.fetch;

const profile: ResolvedAvatarProfile = {
  appearanceId: '11111111-1111-4111-8111-111111111111',
  revision: 3,
  presetKey: 'moss-starter',
  selection: defaultAvatarSelection('moss'),
  legacyFallbackPreset: 'moss',
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('avatar client boundary', () => {
  it('keeps every authoritative selection field bounded and closed to stable keys', () => {
    expect(avatarSelectionSchema.safeParse(profile.selection).success).toBe(true);
    expect(
      avatarSelectionSchema.safeParse({
        ...profile.selection,
        top: 'https://untrusted.example/avatar.png',
      }).success,
    ).toBe(false);
    expect(
      avatarSelectionSchema.safeParse({
        ...profile.selection,
        accessories: ['a', 'b', 'c', 'd', 'e'],
      }).success,
    ).toBe(false);
    expect(
      resolvedAvatarProfileSchema.safeParse({ ...profile, walletAddress: 'private' }).success,
    ).toBe(false);
  });

  it('ships enough clearly marked development options for meaningful creator acceptance', () => {
    const options = COMPILED_AVATAR_STARTER_CATALOG.options;
    expect(options.skinTone.length).toBeGreaterThanOrEqual(6);
    expect(options.hair.length).toBeGreaterThanOrEqual(8);
    expect(options.hairColor.length).toBeGreaterThanOrEqual(8);
    expect(options.top.length).toBeGreaterThanOrEqual(8);
    expect(options.bottom.length).toBeGreaterThanOrEqual(6);
    expect(options.footwear.length).toBeGreaterThanOrEqual(4);
    expect(options.accessories.length).toBeGreaterThanOrEqual(6);
    expect(
      Object.values(options)
        .flat()
        .every((option) => option.developmentFallback),
    ).toBe(true);
  });

  it('uses only the dedicated credentialed avatar routes and sends revision/idempotency inputs', async () => {
    const requests: Array<{ readonly url: string; readonly init: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), init: init ?? {} });
      return Response.json({ success: true, data: { profile } });
    });

    expect(await loadOwnAvatar('http://localhost:4000')).toEqual(profile);
    await createAvatar(
      'http://localhost:4000',
      profile.selection,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    await updateAvatar(
      'http://localhost:4000',
      profile.selection,
      3,
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    );

    expect(requests.map((request) => [request.init.method, request.url])).toEqual([
      ['GET', 'http://localhost:4000/api/v1/token-access/player/avatar'],
      ['POST', 'http://localhost:4000/api/v1/token-access/player/avatar'],
      ['PATCH', 'http://localhost:4000/api/v1/token-access/player/avatar'],
    ]);
    expect(requests.every((request) => request.init.credentials === 'include')).toBe(true);
    expect(JSON.parse(String(requests[1]?.init.body))).toMatchObject({
      requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      selection: profile.selection,
    });
    expect(JSON.parse(String(requests[2]?.init.body))).toMatchObject({
      requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      expectedRevision: 3,
    });
  });

  it('never turns an incompatible authoritative response into browser-saveable options', async () => {
    globalThis.fetch = vi.fn(async () => Response.json({ success: true, data: { options: {} } }));
    await expect(loadAvatarCatalog('http://localhost:4000')).resolves.toBe(
      UNAVAILABLE_AVATAR_CATALOG,
    );
  });

  it('disables customization when an authoritative required layer has no active options', async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        success: true,
        data: {
          ...COMPILED_AVATAR_STARTER_CATALOG,
          options: { ...COMPILED_AVATAR_STARTER_CATALOG.options, hair: [] },
        },
      }),
    );

    const catalog = await loadAvatarCatalog('http://localhost:4000');
    expect(catalog.settings.customizationEnabled).toBe(false);
    expect(catalog.options.hair).toEqual([]);
    expect(catalog).not.toBe(COMPILED_AVATAR_STARTER_CATALOG);
  });

  it('deduplicates public resolution and releases the cached resource at zero references', async () => {
    const loader = vi.fn(async () => profile);
    const cache = new PublicAvatarProfileCache(loader);
    const reference = { appearanceId: profile.appearanceId, appearanceRevision: profile.revision };
    const left = cache.acquire(reference);
    const right = cache.acquire(reference);
    expect(left).toBe(right);
    await expect(left).resolves.toEqual(profile);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(cache.size).toBe(1);
    cache.release(reference);
    expect(cache.size).toBe(1);
    cache.release(reference);
    expect(cache.size).toBe(0);
  });

  it('resolves revision-zero legacy shells through the bounded public route', async () => {
    const legacy = { ...profile, revision: 0 };
    let requestedUrl = '';
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      requestedUrl = String(input);
      return Response.json({ success: true, data: { appearance: legacy } });
    });

    await expect(
      loadPublicAvatar('http://localhost:4000', legacy.appearanceId, 0),
    ).resolves.toEqual(legacy);
    expect(requestedUrl).toBe(
      `http://localhost:4000/api/v1/token-access/player/avatar/public/${legacy.appearanceId}?revision=0`,
    );
    expect(
      compactAppearanceReference({
        appearanceId: legacy.appearanceId,
        appearanceRevision: 0,
        walletAddress: 'never copied',
      }),
    ).toEqual({ appearanceId: legacy.appearanceId, appearanceRevision: 0 });
  });
});
