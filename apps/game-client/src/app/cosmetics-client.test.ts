import { describe, expect, it, vi } from 'vitest';

import { loadCosmeticWardrobe } from './cosmetics-client';

describe('cosmetic client authority boundary', () => {
  it('loads the disabled shop and server-owned wardrobe without local authority', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            requestId: 'request',
            data: {
              status: 'loaded',
              ownedItems: [],
              loadouts: [],
              emotes: [],
              emoteWheel: [],
              emoteWheelRevision: 0,
              collections: [],
              shop: {
                enabled: false,
                lifecycle: 'disabled_preview',
                currency: 'DUST',
                purchaseAvailable: false,
                message: 'Cosmetic purchases are not enabled in this phase.',
                offers: [],
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    const wardrobe = await loadCosmeticWardrobe('http://localhost:3002');
    expect(wardrobe.shop.purchaseAvailable).toBe(false);
    expect(localStorage.length).toBe(0);
    vi.unstubAllGlobals();
  });
});
