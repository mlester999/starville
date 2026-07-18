import { describe, expect, it } from 'vitest';

import {
  COSMETIC_LOADOUT_LIMIT,
  cosmeticEmoteActivationSchema,
  cosmeticMediaUrlSchema,
  cosmeticShopStateSchema,
  adminCosmeticGrantInputSchema,
  adminCosmeticRevocationInputSchema,
  saveCosmeticLoadoutSchema,
} from '../src';

const selection = {
  body: 'meadow-frame',
  skinTone: 'warm-tone',
  face: 'soft-face',
  eyes: 'bright-eyes',
  eyebrows: 'soft-brows',
  hair: 'meadow-hair',
  hairColor: 'chestnut-color',
  top: 'lantern-top',
  bottom: 'meadow-bottom',
  footwear: 'trail-shoes',
  accessories: [],
};

describe('Phase 10B cosmetic contracts', () => {
  it('accepts only five bounded server loadout slots and safe names', () => {
    const request = {
      slot: COSMETIC_LOADOUT_LIMIT,
      name: 'Lantern festival',
      selection,
      expectedRevision: 0,
      requestId: '6d70f572-4f8c-460e-b8ce-f778c48a717a',
    };
    expect(saveCosmeticLoadoutSchema.safeParse(request).success).toBe(true);
    expect(saveCosmeticLoadoutSchema.safeParse({ ...request, slot: 6 }).success).toBe(false);
    expect(saveCosmeticLoadoutSchema.safeParse({ ...request, name: '<script>' }).success).toBe(
      false,
    );
  });

  it('rejects unknown and oversized emote keys', () => {
    const requestId = '6d70f572-4f8c-460e-b8ce-f778c48a717a';
    expect(cosmeticEmoteActivationSchema.safeParse({ emoteKey: 'wave', requestId }).success).toBe(
      true,
    );
    expect(
      cosmeticEmoteActivationSchema.safeParse({ emoteKey: `e${'m'.repeat(80)}`, requestId })
        .success,
    ).toBe(false);
  });

  it('models the DUST shop as an inescapably disabled preview', () => {
    expect(
      cosmeticShopStateSchema.safeParse({
        enabled: false,
        lifecycle: 'disabled_preview',
        currency: 'DUST',
        purchaseAvailable: false,
        message: 'Cosmetic offers are preview-only and purchases are unavailable.',
        offers: [],
      }).success,
    ).toBe(true);
    expect(
      cosmeticShopStateSchema.safeParse({
        enabled: true,
        lifecycle: 'disabled_preview',
        currency: 'DUST',
        purchaseAvailable: true,
        message: 'Buy now',
        offers: [],
      }).success,
    ).toBe(false);
  });

  it('accepts only bounded relative or HTTP(S) cosmetic media URLs', () => {
    expect(cosmeticMediaUrlSchema.safeParse('/api/v1/media/cosmetics/preview.webp').success).toBe(
      true,
    );
    expect(
      cosmeticMediaUrlSchema.safeParse('https://media.starville.example/cosmetics/preview.webp')
        .success,
    ).toBe(true);
    for (const value of [
      '//private.invalid/path',
      'javascript:alert(1)',
      'data:image/svg+xml,bad',
      'file:///private/cosmetic.webp',
    ]) {
      expect(cosmeticMediaUrlSchema.safeParse(value).success).toBe(false);
    }
  });

  it('requires bounded categories, explanations, and expected ownership state for admin changes', () => {
    const base = {
      playerProfileId: 'f4d31f7f-e5fb-45d4-969c-3ea8c9ee675c',
      cosmeticKey: 'lantern-top',
      explanation: 'Validated one-player development correction.',
      requestId: '6d70f572-4f8c-460e-b8ce-f778c48a717a',
    };
    expect(
      adminCosmeticGrantInputSchema.safeParse({
        ...base,
        reasonCategory: 'development_test',
        expectedState: 'not_owned',
      }).success,
    ).toBe(true);
    expect(
      adminCosmeticGrantInputSchema.safeParse({
        ...base,
        reasonCategory: 'anything',
        expectedState: 'owned',
      }).success,
    ).toBe(false);
    expect(
      adminCosmeticRevocationInputSchema.safeParse({
        ...base,
        reasonCategory: 'content_retired',
        expectedState: 'owned',
      }).success,
    ).toBe(true);
  });
});
