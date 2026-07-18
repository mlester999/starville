import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CosmeticWardrobe } from '@starville/cosmetics';

import { PremiumWardrobe, QuickEmoteWheel } from './PremiumWardrobe';

const client = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(async () => undefined),
  rename: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
  apply: vi.fn(async () => undefined),
  wheel: vi.fn(async () => undefined),
  claim: vi.fn(async () => undefined),
}));

vi.mock('../app/cosmetics-client', () => ({
  loadCosmeticWardrobe: client.load,
  saveCosmeticLoadout: client.save,
  renameCosmeticLoadout: client.rename,
  deleteCosmeticLoadout: client.remove,
  applyCosmeticLoadout: client.apply,
  updateCosmeticEmoteWheel: client.wheel,
  claimCosmeticCollection: client.claim,
}));
vi.mock('../app/avatar-client', () => ({ loadOwnAvatar: vi.fn(async () => null) }));

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

const wardrobe: CosmeticWardrobe = {
  status: 'loaded',
  ownedItems: [
    {
      ownershipId: '10000000-0000-4000-8000-000000000001',
      definitionId: '20000000-0000-4000-8000-000000000001',
      key: 'moss-tunic',
      name: 'Moss tunic',
      category: 'tops',
      layer: 'top',
      source: 'starter_catalog',
      sourceLabel: 'Starter wardrobe',
      state: 'owned',
      available: true,
      equipped: true,
      usableVersionId: '21000000-0000-4000-8000-000000000001',
      usableVersionNumber: 1,
      previewMediaUrl: null,
      acquiredAt: '2026-07-16T00:00:00.000Z',
    },
  ],
  loadouts: [
    {
      loadoutId: '30000000-0000-4000-8000-000000000001',
      slot: 1,
      name: 'Meadow walk',
      selection,
      revision: 1,
      active: true,
      updatedAt: '2026-07-16T00:00:00.000Z',
    },
  ],
  emotes: [
    {
      key: 'wave',
      name: 'Wave',
      durationMs: 1_200,
      interruptible: true,
      owned: true,
      sourceLabel: 'Starter emote',
    },
    {
      key: 'dance',
      name: 'Dance',
      durationMs: 2_400,
      interruptible: true,
      owned: false,
      sourceLabel: 'Collection reward',
    },
  ],
  emoteWheel: ['wave'],
  emoteWheelRevision: 1,
  collections: [
    {
      key: 'meadow-friends',
      name: 'Meadow Friends',
      description: 'A small cozy collection.',
      ownedCount: 2,
      requiredCount: 2,
      completed: true,
      rewardKey: 'flower-crown',
      rewardClaimed: false,
    },
  ],
  shop: {
    enabled: false,
    lifecycle: 'disabled_preview',
    currency: 'DUST',
    purchaseAvailable: false,
    message: 'Cosmetic purchases are not enabled in this phase.',
    offers: [],
  },
};

const profile = {
  appearanceId: '40000000-0000-4000-8000-000000000001',
  revision: 3,
  legacyFallbackPreset: 'moss' as const,
  selection,
  presetKey: 'moss-starter',
};

let container: HTMLDivElement;
let root: Root;

function button(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
}

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  client.load.mockReset().mockResolvedValue(wardrobe);
  for (const mock of [
    client.save,
    client.rename,
    client.remove,
    client.apply,
    client.wheel,
    client.claim,
  ]) {
    mock.mockClear();
  }
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

describe('PremiumWardrobe', () => {
  it('shows only authoritative ownership, five revision-safe slots, and a structurally disabled shop', async () => {
    await act(async () => {
      root.render(
        <PremiumWardrobe
          apiUrl="http://localhost:3002"
          current={profile}
          onActivateEmote={vi.fn()}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />,
      );
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Moss tunic');
    await act(async () => button('Saved outfits')?.click());
    expect(container.querySelectorAll('.premium-wardrobe__loadouts article')).toHaveLength(5);
    expect(container.textContent).toContain('Five revision-safe slots');

    await act(async () => button('Shop preview')?.click());
    expect(container.textContent).toContain('Purchases disabled');
    expect(container.textContent).toContain('No offers, Buy controls, wallet prompts');
    expect(button('Buy')).toBeUndefined();
    expect(container.querySelector('form')).toBeNull();
  });

  it('plays only owned emotes and saves the bounded server wheel', async () => {
    const onActivate = vi.fn();
    await act(async () => {
      root.render(
        <PremiumWardrobe
          apiUrl="http://localhost:3002"
          current={profile}
          onActivateEmote={onActivate}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />,
      );
      await Promise.resolve();
    });
    await act(async () => button('Emotes')?.click());
    const play = [...container.querySelectorAll<HTMLButtonElement>('button')].filter(
      (candidate) => candidate.textContent === 'Play',
    );
    expect(play).toHaveLength(2);
    expect(play[0]?.disabled).toBe(false);
    expect(play[1]?.disabled).toBe(true);
    await act(async () => play[0]?.click());
    expect(onActivate).toHaveBeenCalledWith('wave');
    await act(async () => button('Save emote wheel')?.click());
    expect(client.wheel).toHaveBeenCalledWith('http://localhost:3002', ['wave'], 1);
  });

  it('states revoked and unavailable ownership in text instead of relying on color', async () => {
    client.load.mockResolvedValue({
      ...wardrobe,
      ownedItems: [
        { ...wardrobe.ownedItems[0]!, state: 'revoked', available: false, equipped: false },
        {
          ...wardrobe.ownedItems[0]!,
          ownershipId: '10000000-0000-4000-8000-000000000002',
          definitionId: '20000000-0000-4000-8000-000000000002',
          key: 'lantern-coat',
          name: 'Lantern coat',
          state: 'owned',
          available: false,
          equipped: false,
          usableVersionId: null,
          usableVersionNumber: null,
        },
      ],
    } satisfies CosmeticWardrobe);
    await act(async () => {
      root.render(
        <PremiumWardrobe
          apiUrl="http://localhost:3002"
          current={profile}
          onActivateEmote={vi.fn()}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />,
      );
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Revoked — this cosmetic can no longer be equipped.');
    expect(container.textContent).toContain(
      'Unavailable — ownership is retained, but this version cannot be equipped.',
    );
  });

  it('claims a complete collection once and restores close behavior through Escape', async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(
        <PremiumWardrobe
          apiUrl="http://localhost:3002"
          current={profile}
          onActivateEmote={vi.fn()}
          onClose={onClose}
          onSaved={vi.fn()}
        />,
      );
      await Promise.resolve();
    });
    await act(async () => button('Collections')?.click());
    await act(async () => button('Claim reward')?.click());
    expect(client.claim).toHaveBeenCalledWith('http://localhost:3002', 'meadow-friends');
    await act(async () =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('QuickEmoteWheel', () => {
  it('shows only owned configured emotes and closes after activation', async () => {
    const onActivate = vi.fn();
    const onClose = vi.fn();
    await act(async () => {
      root.render(
        <QuickEmoteWheel
          apiUrl="http://localhost:3002"
          onActivate={onActivate}
          onClose={onClose}
        />,
      );
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Wave');
    expect(container.textContent).not.toContain('Dance');
    await act(async () => button('1Wave')?.click());
    expect(onActivate).toHaveBeenCalledWith('wave');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
