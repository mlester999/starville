import { z } from 'zod';

const timestamp = z.iso.datetime({ offset: true });
const revision = z.number().int().positive();
const uuid = z.uuid();
const idempotencyKey = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]+$/u);
const safeKey = z.string().regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u);

export const homeVisibilitySchema = z.enum(['public', 'friends_only', 'invite_only', 'private']);
export type HomeVisibility = z.infer<typeof homeVisibilitySchema>;

export const homeInteractionModeSchema = z.enum([
  'view_only',
  'social_interactions',
  'allow_helpers',
]);
export type HomeInteractionMode = z.infer<typeof homeInteractionModeSchema>;

export const homeVisitCapabilitySchema = z.enum([
  'home.enter',
  'home.walk',
  'home.inspect',
  'home.emote',
  'home.sit',
  'home.photo_area',
  'home.guestbook.write',
  'home.appreciate',
  'home.helper.water_crop',
]);

export const homeVisitSafeProfileSchema = z
  .object({
    presenceId: uuid,
    displayName: z.string().min(2).max(24),
    level: z.number().int().min(1).max(1_000_000),
    appearancePreset: z.string().min(1).max(80),
    titleKey: safeKey.nullable(),
    badgeKey: safeKey.nullable(),
  })
  .strict();

export const homeVisitPolicySchema = z
  .object({
    versionId: uuid,
    version: revision,
    maximumVisitors: z.number().int().min(1).max(10),
    ownerDisconnectGraceSeconds: z.number().int().min(15).max(300),
    visitorReconnectGraceSeconds: z.number().int().min(10).max(120),
    invitationExpirySeconds: z.number().int().min(300).max(86_400),
    guestbookCooldownSeconds: z.number().int().min(60).max(86_400),
    guestbookDailyLimit: z.number().int().min(1).max(20),
    appreciationPolicy: z.literal('persistent_selection'),
    helperWateringsPerVisitorDay: z.literal(1),
    visitsEnabled: z.boolean(),
    publicDiscoveryEnabled: z.boolean(),
    invitationsEnabled: z.boolean(),
    admissionsEnabled: z.boolean(),
    socialInteractionsEnabled: z.boolean(),
    guestbookWritesEnabled: z.boolean(),
    appreciationEnabled: z.boolean(),
    helperActionsEnabled: z.boolean(),
    maintenanceMessage: z.string().min(1).max(280).nullable(),
    configurationRevision: revision,
  })
  .strict();

export const homeSocialSettingsSchema = z
  .object({
    homeId: uuid,
    visibility: homeVisibilitySchema,
    interactionMode: homeInteractionModeSchema,
    publicDiscoveryEnabled: z.boolean(),
    friendInvitationsEnabled: z.boolean(),
    partyInvitationsEnabled: z.boolean(),
    guestbookEnabled: z.boolean(),
    appreciationEnabled: z.boolean(),
    helperActionsEnabled: z.boolean(),
    joinNotificationsEnabled: z.boolean(),
    leaveNotificationsEnabled: z.boolean(),
    defaultVisitorMuted: z.boolean(),
    maximumVisitors: z.number().int().min(1).max(10),
    admissionsOpen: z.boolean(),
    configurationRevision: revision,
    updatedAt: timestamp,
  })
  .strict();

export const homeVisitSessionSchema = z
  .object({
    id: uuid,
    homeId: uuid,
    ownerPlayerId: uuid,
    worldInstanceId: uuid,
    status: z.enum(['starting', 'open', 'closing', 'closed', 'failed']),
    visibility: homeVisibilitySchema,
    interactionMode: homeInteractionModeSchema,
    maximumVisitors: z.number().int().min(1).max(10),
    visitorCount: z.number().int().min(0).max(10),
    admissionsOpen: z.boolean(),
    ownerPresenceState: z.enum(['connected', 'reconnecting', 'absent']),
    startedAt: timestamp,
    ownerReconnectDeadline: timestamp.nullable(),
    closingAt: timestamp.nullable(),
    closedAt: timestamp.nullable(),
    closeReason: safeKey.nullable(),
    configurationRevision: revision,
  })
  .strict();

export const homeVisitParticipantSchema = z
  .object({
    id: uuid,
    sessionId: uuid,
    player: homeVisitSafeProfileSchema,
    role: z.enum(['owner', 'visitor']),
    interactionMode: homeInteractionModeSchema,
    capabilities: z.array(homeVisitCapabilitySchema).min(3).max(9),
    status: z.enum(['active', 'reconnecting', 'left', 'removed', 'expired', 'returned']),
    presenceState: z.enum(['connected', 'reconnecting', 'offline', 'returned']),
    x: z.number().min(0).max(128),
    y: z.number().min(0).max(128),
    facingDirection: z.enum([
      'north',
      'northeast',
      'east',
      'southeast',
      'south',
      'southwest',
      'west',
      'northwest',
    ]),
    movementSequence: z.string().regex(/^\d+$/u),
    socialState: z.enum(['idle', 'moving', 'emoting', 'seated', 'photo_area', 'helping']),
    joinedAt: timestamp,
    reconnectDeadline: timestamp.nullable(),
    stateVersion: revision,
  })
  .strict();

export const homeVisitInvitationSchema = z
  .object({
    id: uuid,
    homeId: uuid,
    sessionId: uuid.nullable(),
    owner: homeVisitSafeProfileSchema,
    type: z.enum(['direct_player', 'friend', 'party_snapshot']),
    status: z.enum(['pending', 'accepted']),
    expiresAt: timestamp,
    configurationRevision: revision,
    sessionConfigurationRevision: revision.nullable(),
  })
  .strict();

export const homeVisitDiscoveryCardSchema = z
  .object({
    session: homeVisitSessionSchema,
    owner: homeVisitSafeProfileSchema,
    homeTitle: z.string().min(2).max(80),
    homeTier: z.number().int().min(1).max(20),
    friend: z.boolean(),
    joinEligible: z.boolean(),
  })
  .strict();

export const homeGuestbookEntrySchema = z
  .object({
    id: uuid,
    author: homeVisitSafeProfileSchema,
    message: z.string().min(1).max(300),
    moderationStatus: z.literal('visible'),
    createdAt: timestamp,
    stateVersion: revision,
  })
  .strict();

export const homeVisitWorkspaceSchema = z
  .object({
    policy: homeVisitPolicySchema,
    ownedHome: z
      .object({
        id: uuid,
        homeTier: z.number().int().min(1).max(20),
        insideHome: z.boolean(),
        stateVersion: revision,
      })
      .strict()
      .nullable(),
    settings: homeSocialSettingsSchema.nullable(),
    hostSession: homeVisitSessionSchema.nullable(),
    activeParticipant: homeVisitParticipantSchema.nullable(),
    participants: z.array(homeVisitParticipantSchema).max(11),
    invitations: z.array(homeVisitInvitationSchema).max(100),
    discovery: z.array(homeVisitDiscoveryCardSchema).max(50),
    recentVisits: z.array(z.record(z.string(), z.unknown())).max(20),
    guestbook: z.array(homeGuestbookEntrySchema).max(50),
    appreciation: z
      .record(z.string(), z.number().int().nonnegative())
      .refine(
        (value) =>
          Object.keys(value).every((key) =>
            ['cozy', 'beautiful', 'creative', 'welcoming'].includes(key),
          ),
        {
          message: 'Unknown appreciation key',
        },
      ),
    ownAppreciation: z
      .object({
        reactionKey: z.enum(['cozy', 'beautiful', 'creative', 'welcoming']),
        stateVersion: revision,
      })
      .strict()
      .nullable(),
    gameTest: z.boolean(),
    serverTime: timestamp,
  })
  .strict();
export type HomeVisitWorkspace = z.infer<typeof homeVisitWorkspaceSchema>;

export const updateHomeSocialSettingsRequestSchema = homeSocialSettingsSchema
  .pick({
    homeId: true,
    visibility: true,
    interactionMode: true,
    publicDiscoveryEnabled: true,
    friendInvitationsEnabled: true,
    partyInvitationsEnabled: true,
    guestbookEnabled: true,
    appreciationEnabled: true,
    helperActionsEnabled: true,
    joinNotificationsEnabled: true,
    leaveNotificationsEnabled: true,
    defaultVisitorMuted: true,
  })
  .extend({ expectedConfigurationRevision: revision, idempotencyKey })
  .strict()
  .superRefine((value, context) => {
    if (value.visibility !== 'public' && value.publicDiscoveryEnabled) {
      context.addIssue({
        code: 'custom',
        path: ['publicDiscoveryEnabled'],
        message: 'Discovery requires Public visibility',
      });
    }
    if (value.interactionMode !== 'allow_helpers' && value.helperActionsEnabled) {
      context.addIssue({
        code: 'custom',
        path: ['helperActionsEnabled'],
        message: 'Helpers require Allow Helpers mode',
      });
    }
  });

export const startHomeVisitRequestSchema = z
  .object({ homeId: uuid, expectedSettingsRevision: revision, idempotencyKey })
  .strict();
export const sessionRevisionRequestSchema = z
  .object({ visitSessionId: uuid, expectedSessionRevision: revision, idempotencyKey })
  .strict();
export const admissionsRequestSchema = sessionRevisionRequestSchema
  .extend({ open: z.boolean() })
  .strict();
export const homeVisitInvitationRequestSchema = z
  .object({
    visitSessionId: uuid,
    inviteePlayerProfileId: uuid,
    invitationType: z.enum(['direct_player', 'friend', 'party_snapshot']),
    idempotencyKey,
  })
  .strict();
export const revokeHomeVisitInvitationRequestSchema = z
  .object({ invitationId: uuid, expectedRevision: revision, idempotencyKey })
  .strict();
export const joinHomeVisitRequestSchema = z
  .object({
    visitSessionId: uuid,
    invitationId: uuid.nullable(),
    expectedSessionRevision: revision,
    idempotencyKey,
  })
  .strict();
export const leaveHomeVisitRequestSchema = z
  .object({ participantId: uuid, expectedParticipantRevision: revision, idempotencyKey })
  .strict();
export const homeVisitInteractionRequestSchema = z
  .object({
    participantId: uuid,
    action: z.enum([
      'emote',
      'sit',
      'stand',
      'join_photo_area',
      'leave_photo_area',
      'inspect_furniture',
    ]),
    targetId: uuid.nullable(),
    interactionKey: safeKey.nullable(),
    expectedParticipantRevision: revision,
    idempotencyKey,
  })
  .strict();
export const homeGuestbookWriteRequestSchema = z
  .object({ participantId: uuid, message: z.string().trim().min(1).max(300), idempotencyKey })
  .strict();
export const homeAppreciationRequestSchema = z
  .object({
    participantId: uuid,
    reaction: z.enum(['cozy', 'beautiful', 'creative', 'welcoming']),
    expectedRevision: z.number().int().nonnegative(),
    idempotencyKey,
  })
  .strict();
export const homeHelperWaterRequestSchema = z
  .object({
    participantId: uuid,
    cropInstanceId: uuid,
    expectedCropStateVersion: revision,
    idempotencyKey,
  })
  .strict();
export const homeVisitModerationRequestSchema = z
  .object({
    visitSessionId: uuid,
    visitorParticipantId: uuid,
    action: z.enum(['remove', 'block']),
    reason: z.string().trim().min(3).max(160),
    expectedSessionRevision: revision,
    idempotencyKey,
  })
  .strict();
export const homeVisitReportRequestSchema = z
  .object({
    visitSessionId: uuid,
    reportedParticipantId: uuid,
    guestbookEntryId: uuid.nullable(),
    category: z.enum([
      'harassment',
      'hate_or_abuse',
      'spam',
      'inappropriate_home',
      'unsafe_behavior',
      'other',
    ]),
    reason: z.string().trim().min(3).max(500),
    idempotencyKey,
  })
  .strict();
export const ownerGuestbookModerationRequestSchema = z
  .object({
    guestbookEntryId: uuid,
    action: z.enum(['hide', 'restore']),
    expectedRevision: revision,
    reason: z.string().trim().min(3).max(160),
    idempotencyKey,
  })
  .strict();

export const homeVisitRealtimeTicketRequestSchema = z.object({ participantId: uuid }).strict();
export const homeVisitRealtimeTicketSchema = z
  .object({
    status: z.literal('issued'),
    ticket: z.string().min(32).max(256),
    expiresAt: timestamp,
    visitSessionId: uuid,
    participantId: uuid,
  })
  .strict();
export const homeVisitRealtimeEventSchema = z
  .object({
    eventNumber: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/u)]),
    eventKey: z.string().regex(/^home_[a-z0-9]+(?:_[a-z0-9]+)*$/u),
    actorParticipantId: uuid.nullable(),
    payload: z.record(z.string(), z.unknown()),
    createdAt: timestamp,
  })
  .strict();

export const homeVisitRealtimeClientMessageSchema = z.discriminatedUnion('type', [
  z
    .object({ type: z.literal('authenticate'), ticket: z.string().regex(/^[A-Za-z0-9_-]{43}$/u) })
    .strict(),
  z
    .object({
      type: z.literal('movement'),
      x: z.number().finite().min(0).max(128),
      y: z.number().finite().min(0).max(128),
      facingDirection: z.enum([
        'north',
        'northeast',
        'east',
        'southeast',
        'south',
        'southwest',
        'west',
        'northwest',
      ]),
      sequence: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal('sync'),
      afterEventNumber: z.string().regex(/^\d+$/u),
      forceSnapshot: z.boolean(),
    })
    .strict(),
  z.object({ type: z.literal('ping'), nonce: z.string().min(1).max(64) }).strict(),
]);

export const homeVisitRealtimeServerMessageSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('authenticated'),
      realtimeSessionId: uuid,
      visitSessionId: uuid,
      participantId: uuid,
      homeId: uuid,
      lastEventNumber: z.string().regex(/^\d+$/u),
      snapshot: z.record(z.string(), z.unknown()),
    })
    .strict(),
  z
    .object({
      type: z.literal('snapshot'),
      lastEventNumber: z.string().regex(/^\d+$/u),
      events: z.array(z.record(z.string(), z.unknown())).max(100),
      snapshot: z.record(z.string(), z.unknown()),
    })
    .strict(),
  z.object({ type: z.literal('movement_ack'), participant: homeVisitParticipantSchema }).strict(),
  z.object({ type: z.literal('pong'), nonce: z.string().min(1).max(64) }).strict(),
  z
    .object({
      type: z.literal('error'),
      code: z.enum([
        'AUTHENTICATION_TIMEOUT',
        'INVALID_MESSAGE',
        'INVALID_TICKET',
        'ACCESS_REVOKED',
        'HOME_VISIT_CLOSED',
        'HOME_VISIT_BLOCKED',
        'HOME_VISITOR_NOT_FOUND',
        'INVALID_POSITION',
        'STALE_SEQUENCE',
        'SERVICE_UNAVAILABLE',
      ]),
      retryable: z.boolean(),
    })
    .strict(),
]);

export type HomeVisitRealtimeClientMessage = z.infer<typeof homeVisitRealtimeClientMessageSchema>;
export type HomeVisitRealtimeServerMessage = z.infer<typeof homeVisitRealtimeServerMessageSchema>;

const fixtureOwner = {
  presenceId: 'f1100000-0000-4000-8000-000000000100',
  displayName: 'Willow Host',
  level: 12,
  appearancePreset: 'meadow-frame',
  titleKey: null,
  badgeKey: null,
} as const;
const fixtureSession = {
  id: 'f1100000-0000-4000-8000-000000000200',
  homeId: 'f1100000-0000-4000-8000-000000000201',
  ownerPlayerId: 'f1100000-0000-4000-8000-000000000202',
  worldInstanceId: 'f1100000-0000-4000-8000-000000000203',
  status: 'open',
  visibility: 'public',
  interactionMode: 'allow_helpers',
  maximumVisitors: 10,
  visitorCount: 10,
  admissionsOpen: true,
  ownerPresenceState: 'connected',
  startedAt: '2026-07-18T00:00:00.000+00:00',
  ownerReconnectDeadline: null,
  closingAt: null,
  closedAt: null,
  closeReason: null,
  configurationRevision: 1,
} as const;

export const homeVisitGameTestFixture = homeVisitWorkspaceSchema.parse({
  policy: {
    versionId: 'f1100000-0000-4000-8000-000000000001',
    version: 1,
    maximumVisitors: 10,
    ownerDisconnectGraceSeconds: 60,
    visitorReconnectGraceSeconds: 30,
    invitationExpirySeconds: 86_400,
    guestbookCooldownSeconds: 600,
    guestbookDailyLimit: 5,
    appreciationPolicy: 'persistent_selection',
    helperWateringsPerVisitorDay: 1,
    visitsEnabled: true,
    publicDiscoveryEnabled: true,
    invitationsEnabled: true,
    admissionsEnabled: true,
    socialInteractionsEnabled: true,
    guestbookWritesEnabled: true,
    appreciationEnabled: true,
    helperActionsEnabled: true,
    maintenanceMessage: null,
    configurationRevision: 1,
  },
  ownedHome: { id: fixtureSession.homeId, homeTier: 2, insideHome: true, stateVersion: 1 },
  settings: {
    homeId: fixtureSession.homeId,
    visibility: 'public',
    interactionMode: 'allow_helpers',
    publicDiscoveryEnabled: true,
    friendInvitationsEnabled: true,
    partyInvitationsEnabled: true,
    guestbookEnabled: true,
    appreciationEnabled: true,
    helperActionsEnabled: true,
    joinNotificationsEnabled: true,
    leaveNotificationsEnabled: true,
    defaultVisitorMuted: false,
    maximumVisitors: 10,
    admissionsOpen: true,
    configurationRevision: 1,
    updatedAt: '2026-07-18T00:00:00.000+00:00',
  },
  hostSession: fixtureSession,
  activeParticipant: null,
  participants: [
    {
      id: 'f1100000-0000-4000-8000-000000000300',
      sessionId: fixtureSession.id,
      player: fixtureOwner,
      role: 'owner',
      interactionMode: 'allow_helpers',
      capabilities: [
        'home.enter',
        'home.walk',
        'home.inspect',
        'home.emote',
        'home.sit',
        'home.photo_area',
        'home.guestbook.write',
        'home.appreciate',
        'home.helper.water_crop',
      ],
      status: 'active',
      presenceState: 'connected',
      x: 2,
      y: 2,
      facingDirection: 'south',
      movementSequence: '0',
      socialState: 'idle',
      joinedAt: '2026-07-18T00:00:00.000+00:00',
      reconnectDeadline: null,
      stateVersion: 1,
    },
    ...Array.from({ length: 10 }, (_, index) => ({
      id: `f1100000-0000-4000-8000-${String(400 + index).padStart(12, '0')}`,
      sessionId: fixtureSession.id,
      player: {
        ...fixtureOwner,
        presenceId: `f1100000-0000-4000-8000-${String(500 + index).padStart(12, '0')}`,
        displayName: `Guest ${index + 1}`,
      },
      role: 'visitor' as const,
      interactionMode: 'allow_helpers' as const,
      capabilities: [
        'home.enter',
        'home.walk',
        'home.inspect',
        'home.emote',
        'home.sit',
        'home.photo_area',
        'home.guestbook.write',
        'home.appreciate',
        'home.helper.water_crop',
      ] as const,
      status: 'active' as const,
      presenceState: 'connected' as const,
      x: 3 + (index % 4),
      y: 3 + Math.floor(index / 4),
      facingDirection: 'south' as const,
      movementSequence: '0',
      socialState: 'idle' as const,
      joinedAt: '2026-07-18T00:00:00.000+00:00',
      reconnectDeadline: null,
      stateVersion: 1,
    })),
  ],
  invitations: [],
  discovery: [],
  recentVisits: [],
  guestbook: [],
  appreciation: {},
  ownAppreciation: null,
  gameTest: true,
  serverTime: '2026-07-18T00:00:00.000+00:00',
});
