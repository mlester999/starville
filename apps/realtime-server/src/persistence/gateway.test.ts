import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { createSupabaseRealtimePersistenceGateway, RealtimePersistenceError } from './gateway.js';

describe('realtime avatar persistence boundary', () => {
  it('resolves a compact appearance from the authenticated realtime session', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        status: 'loaded',
        appearance: {
          appearanceId: 'a0000000-0000-4000-8000-000000000001',
          revision: 4,
          creatorCompleted: false,
          moduleEnabled: false,
          renderMode: 'legacy_fallback',
          legacyFallbackPreset: 'moss',
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
          presetKey: null,
          updatedAt: '2026-07-15T08:00:00.000Z',
        },
      },
      error: null,
    }));
    const gateway = createSupabaseRealtimePersistenceGateway({ rpc } as unknown as SupabaseClient);

    await expect(
      gateway.avatarProfile('10000000-0000-4000-8000-000000000001', 'appearance-refresh-request'),
    ).resolves.toEqual({
      appearanceId: 'a0000000-0000-4000-8000-000000000001',
      appearanceRevision: 4,
    });
    expect(rpc).toHaveBeenCalledWith('get_realtime_avatar_profile', {
      p_realtime_session_id: '10000000-0000-4000-8000-000000000001',
      p_request_id: 'appearance-refresh-request',
    });
  });

  it('does not turn fallback or module-disabled profiles into browser-resolved references', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: { status: 'fallback' }, error: null })
      .mockResolvedValueOnce({ data: { status: 'module_disabled' }, error: null });
    const gateway = createSupabaseRealtimePersistenceGateway({ rpc } as unknown as SupabaseClient);
    await expect(
      gateway.avatarProfile('10000000-0000-4000-8000-000000000001', 'one'),
    ).resolves.toBe('fallback');
    await expect(
      gateway.avatarProfile('10000000-0000-4000-8000-000000000001', 'two'),
    ).resolves.toBe('module_disabled');
  });

  it('fails closed when the avatar RPC is unavailable', async () => {
    const gateway = createSupabaseRealtimePersistenceGateway({
      rpc: vi.fn(async () => ({ data: null, error: { code: 'PGRST202' } })),
    } as unknown as SupabaseClient);
    await expect(
      gateway.avatarProfile('10000000-0000-4000-8000-000000000001', 'request'),
    ).rejects.toBeInstanceOf(RealtimePersistenceError);
  });

  it('accepts only the compact server-authorized emote activation result', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        status: 'activated',
        presenceId: '20000000-0000-4000-8000-000000000001',
        channelId: '40000000-0000-4000-8000-000000000001',
        emoteKey: 'wave',
        activationId: '60000000-0000-4000-8000-000000000001',
        startedAt: 1_786_656_000_000,
        durationMs: 1_200,
      },
      error: null,
    }));
    const gateway = createSupabaseRealtimePersistenceGateway({ rpc } as unknown as SupabaseClient);
    await expect(
      gateway.activateEmote('10000000-0000-4000-8000-000000000001', 'wave', 'emote-request-1'),
    ).resolves.toMatchObject({ status: 'activated', emoteKey: 'wave', durationMs: 1_200 });
    expect(rpc).toHaveBeenCalledWith('activate_realtime_player_emote', {
      p_realtime_session_id: '10000000-0000-4000-8000-000000000001',
      p_emote_key: 'wave',
      p_request_id: 'emote-request-1',
    });
  });

  it('rejects oversized or browser-expanded emote activation results', async () => {
    const gateway = createSupabaseRealtimePersistenceGateway({
      rpc: vi.fn(async () => ({
        data: {
          status: 'activated',
          presenceId: '20000000-0000-4000-8000-000000000001',
          channelId: '40000000-0000-4000-8000-000000000001',
          emoteKey: 'x'.repeat(81),
          activationId: '60000000-0000-4000-8000-000000000001',
          startedAt: 1_786_656_000_000,
          durationMs: 1_200,
          rawAssetUrl: 'https://private.invalid/emote.webp',
        },
        error: null,
      })),
    } as unknown as SupabaseClient);
    await expect(
      gateway.activateEmote('10000000-0000-4000-8000-000000000001', 'wave', 'emote-request-2'),
    ).rejects.toBeDefined();
  });
});
