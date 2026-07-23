import { describe, expect, it } from 'vitest';

import {
  operationsSummarySchema,
  playerActionResultSchema,
  playerActivitySchema,
  playerDetailSchema,
  playerEntryProfileSchema,
  playerEntryStateSchema,
} from '../src/index';

describe('player operations contracts', () => {
  it('distinguishes active, rename-required, and suspended entry states', () => {
    expect(playerEntryStateSchema.parse('active')).toBe('active');
    expect(playerEntryStateSchema.parse('rename_required')).toBe('rename_required');
    expect(playerEntryStateSchema.parse('suspended')).toBe('suspended');
  });

  it('rejects an unversioned administrative result', () => {
    expect(
      playerActionResultSchema.safeParse({
        playerId: '19e72014-a546-4f45-8232-6a286f889453',
        moderationStatus: 'active',
        renameRequired: false,
        moderationVersion: 0,
        gameStateVersion: 1,
        revokedSessionCount: 0,
        replayed: false,
      }).success,
    ).toBe(false);
  });

  it('requires the truthful active-session definition', () => {
    const result = operationsSummarySchema.safeParse({
      generatedAt: '2026-07-11T10:00:00.000Z',
      players: {
        total: 0,
        active: 0,
        suspended: 0,
        renameRequired: 0,
        createdLast24Hours: 0,
        enteredLast24Hours: 0,
      },
      access: { activeSessions: 0, definition: 'Players online' },
      tokenAccess: {
        enabled: true,
        network: 'solana:mainnet-beta',
        symbol: 'STAR',
        requiredAmount: '10000',
        configVersion: 1,
        validationState: 'validated',
      },
      services: [],
    });

    expect(result.success).toBe(false);
  });

  it('bounds safe wallet-access history separately from player-operation audits', () => {
    const parsed = playerActivitySchema.parse({
      items: [],
      accessEvents: [
        {
          id: '19e72014-a546-4f45-8232-6a286f889453',
          event: 'wallet.access.revoked',
          result: 'success',
          reasonCode: 'PLAYER_SUSPENDED',
          createdAt: '2026-07-11T10:00:00.000Z',
        },
      ],
      accessPage: 1,
      accessPageSize: 10,
      accessTotal: 1,
      accessTotalPages: 1,
      nextCursor: null,
    });

    expect(parsed.accessEvents).toHaveLength(1);
    expect(JSON.stringify(parsed)).not.toContain('walletAddress');
  });

  it('accepts the Phase 6 multi-map fields returned by the Phase 5 player-detail RPC', () => {
    const parsed = playerDetailSchema.parse({
      profile: {
        id: '19e72014-a546-4f45-8232-6a286f889453',
        displayName: 'Luna Vale',
        walletAddress: null,
        appearancePreset: 'river',
        mapId: 'lantern-square',
        mapVersionId: '29e72014-a546-4f45-8232-6a286f889453',
        x: 12,
        y: 7.5,
        facingDirection: 'south',
        gameStateVersion: 2,
        stateVersion: 2,
        lastTransitionAt: null,
        createdAt: '2026-07-11T10:00:00.000Z',
        updatedAt: '2026-07-12T10:00:00.000Z',
        lastEnteredAt: '2026-07-12T10:00:00.000Z',
      },
      moderation: {
        status: 'active',
        suspensionReason: null,
        suspendedAt: null,
        suspendedByAdminId: null,
        restoredAt: null,
        restoredByAdminId: null,
        restorationReason: null,
        renameRequired: false,
        renameReason: null,
        renameRequiredAt: null,
        renameRequiredByAdminId: null,
        version: 1,
        updatedAt: '2026-07-12T10:00:00.000Z',
      },
      access: { activeSessions: 0, latestSessionStatus: null, latestSessionAt: null },
    });

    expect(parsed.profile).toMatchObject({
      mapId: 'lantern-square',
      mapVersionId: '29e72014-a546-4f45-8232-6a286f889453',
      stateVersion: 2,
    });
    expect(
      playerDetailSchema.safeParse({
        ...parsed,
        profile: { ...parsed.profile, stateVersion: parsed.profile.gameStateVersion + 1 },
      }).success,
    ).toBe(false);
  });

  it('accepts Phase 6 fields on the player-entry profile used by GET /player/profile', () => {
    const parsed = playerEntryProfileSchema.parse({
      entryState: 'active',
      profile: {
        id: '19e72014-a546-4f45-8232-6a286f889453',
        displayName: 'Luna Vale',
        appearancePreset: 'river',
        mapId: 'lantern-square',
        mapVersionId: null,
        x: 12,
        y: 7.5,
        facingDirection: 'south',
        gameStateVersion: 1,
        stateVersion: 1,
        lastTransitionAt: null,
        createdAt: '2026-07-11T10:00:00.000Z',
        updatedAt: '2026-07-12T10:00:00.000Z',
        lastEnteredAt: '2026-07-12T10:00:00.000Z',
      },
    });

    expect(parsed.entryState).toBe('active');
    expect(parsed.profile.mapVersionId).toBeNull();
    expect(parsed.profile.stateVersion).toBe(1);
  });
});
