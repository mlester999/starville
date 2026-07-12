import { describe, expect, it } from 'vitest';

import {
  operationsSummarySchema,
  playerActionResultSchema,
  playerActivitySchema,
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
        requiredAmount: '1000',
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
      nextCursor: null,
    });

    expect(parsed.accessEvents).toHaveLength(1);
    expect(JSON.stringify(parsed)).not.toContain('walletAddress');
  });
});
