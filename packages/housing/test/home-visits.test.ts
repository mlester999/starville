import { describe, expect, it } from 'vitest';

import {
  homeAppreciationRequestSchema,
  homeVisitInvitationSchema,
  homeVisitGameTestFixture,
  homeVisitModerationRequestSchema,
  homeVisitRealtimeClientMessageSchema,
  homeVisitRealtimeServerMessageSchema,
  homeVisitWorkspaceSchema,
  joinHomeVisitRequestSchema,
  updateHomeSocialSettingsRequestSchema,
} from '../src';

describe('Phase 11F home visit contracts', () => {
  it('keeps the Game Test fixture temporary and bounded to owner plus ten visitors', () => {
    expect(homeVisitGameTestFixture.gameTest).toBe(true);
    expect(homeVisitGameTestFixture.participants).toHaveLength(11);
    expect(homeVisitGameTestFixture.hostSession?.visitorCount).toBe(10);
    expect(homeVisitWorkspaceSchema.parse(homeVisitGameTestFixture)).toEqual(
      homeVisitGameTestFixture,
    );
  });

  it('rejects discovery outside Public visibility', () => {
    const result = updateHomeSocialSettingsRequestSchema.safeParse({
      ...homeVisitGameTestFixture.settings,
      visibility: 'friends_only',
      publicDiscoveryEnabled: true,
      expectedConfigurationRevision: 1,
      idempotencyKey: 'phase11f-settings-0001',
    });
    expect(result.success).toBe(false);
  });

  it('rejects helpers outside Allow Helpers mode', () => {
    const result = updateHomeSocialSettingsRequestSchema.safeParse({
      ...homeVisitGameTestFixture.settings,
      interactionMode: 'social_interactions',
      helperActionsEnabled: true,
      expectedConfigurationRevision: 1,
      idempotencyKey: 'phase11f-settings-0002',
    });
    expect(result.success).toBe(false);
  });

  it('carries the current session revision on invitations instead of guessing it', () => {
    const session = homeVisitGameTestFixture.hostSession;
    const owner = homeVisitGameTestFixture.participants[0]?.player;
    expect(session).not.toBeNull();
    expect(owner).toBeDefined();
    expect(
      homeVisitInvitationSchema.parse({
        id: 'f1100000-0000-4000-8000-000000000010',
        homeId: homeVisitGameTestFixture.ownedHome?.id,
        sessionId: session?.id,
        owner,
        type: 'direct_player',
        status: 'pending',
        expiresAt: '2026-07-18T12:05:00.000Z',
        configurationRevision: 1,
        sessionConfigurationRevision: session?.configurationRevision,
      }).sessionConfigurationRevision,
    ).toBe(session?.configurationRevision);
  });

  it('requires canonical UUIDs, idempotency keys, and optimistic revisions on mutations', () => {
    expect(
      joinHomeVisitRequestSchema.safeParse({
        visitSessionId: 'not-a-uuid',
        invitationId: null,
        expectedSessionRevision: 1,
        idempotencyKey: 'phase11f-join-invalid-0001',
      }).success,
    ).toBe(false);
    expect(
      homeVisitModerationRequestSchema.safeParse({
        visitSessionId: homeVisitGameTestFixture.hostSession?.id,
        visitorParticipantId: homeVisitGameTestFixture.participants[1]?.id,
        action: 'remove',
        reason: 'Owner safety action.',
        expectedSessionRevision: 0,
        idempotencyKey: 'phase11f-moderation-0001',
      }).success,
    ).toBe(false);
    expect(
      homeAppreciationRequestSchema.safeParse({
        participantId: homeVisitGameTestFixture.participants[1]?.id,
        reaction: 'fake-reward',
        expectedRevision: 0,
        idempotencyKey: 'phase11f-appreciation-0001',
      }).success,
    ).toBe(false);
  });

  it('bounds participant movement and accepts only server-authored success messages', () => {
    expect(
      homeVisitRealtimeClientMessageSchema.safeParse({
        type: 'movement',
        x: 129,
        y: 2,
        facingDirection: 'south',
        sequence: 1,
      }).success,
    ).toBe(false);
    expect(
      homeVisitRealtimeClientMessageSchema.safeParse({
        type: 'movement',
        x: 3,
        y: 2,
        facingDirection: 'east',
        sequence: 1,
      }).success,
    ).toBe(true);
    expect(
      homeVisitRealtimeServerMessageSchema.safeParse({
        type: 'helper_success',
        reward: 1000,
      }).success,
    ).toBe(false);
  });

  it('contains only safe public profiles and no persisted preview authority', () => {
    expect(JSON.stringify(homeVisitGameTestFixture)).not.toContain('walletAddress');
    expect(JSON.stringify(homeVisitGameTestFixture)).not.toContain('inventory');
    expect(JSON.stringify(homeVisitGameTestFixture)).not.toContain('storage');
    expect(homeVisitGameTestFixture.gameTest).toBe(true);
  });
});
