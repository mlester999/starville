import { z } from 'zod';

import { appearancePresetSchema, mapIdSchema } from '@starville/game-core';

export const DEFAULT_MAXIMUM_FRIENDS = 100 as const;
export const DEFAULT_PARTY_CAPACITY = 4 as const;
export const MAXIMUM_PARTY_CAPACITY = 8 as const;
export const SOCIAL_GRAPH_NOTIFICATION_LIMIT = 20 as const;

const uuidSchema = z.uuid();
const timestampSchema = z.iso.datetime({ offset: true });
export const socialGraphRequestIdSchema = z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/u);

export const friendshipStatusSchema = z.enum(['accepted', 'removed', 'invalidated']);
export type FriendshipStatus = z.infer<typeof friendshipStatusSchema>;

export const friendRequestStatusSchema = z.enum([
  'pending',
  'accepted',
  'declined',
  'cancelled',
  'expired',
  'invalidated',
]);
export type FriendRequestStatus = z.infer<typeof friendRequestStatusSchema>;

export const friendPresenceStatusSchema = z.enum(['online', 'reconnecting', 'offline']);
export const friendLastSeenCategorySchema = z.enum(['recently', 'today', 'earlier']).nullable();

export const socialGraphPlayerSchema = z
  .object({
    presenceId: uuidSchema,
    displayName: z.string().trim().min(3).max(20),
    level: z.number().int().min(1).max(999),
    appearancePreset: appearancePresetSchema,
  })
  .strict();
export type SocialGraphPlayer = z.infer<typeof socialGraphPlayerSchema>;

export const friendViewSchema = socialGraphPlayerSchema
  .extend({
    friendshipId: uuidSchema,
    connectionStatus: friendPresenceStatusSchema,
    worldId: mapIdSchema.nullable(),
    worldName: z.string().trim().min(1).max(120).nullable(),
    channelNumber: z.number().int().min(1).max(99).nullable(),
    partyState: z.enum(['none', 'in_party', 'same_party']),
    lastSeenCategory: friendLastSeenCategorySchema,
  })
  .strict();
export type FriendView = z.infer<typeof friendViewSchema>;

export const friendRequestViewSchema = z
  .object({
    id: uuidSchema,
    status: friendRequestStatusSchema,
    sender: socialGraphPlayerSchema,
    target: socialGraphPlayerSchema,
    createdAt: timestampSchema,
    expiresAt: timestampSchema,
  })
  .strict();
export type FriendRequestView = z.infer<typeof friendRequestViewSchema>;

export const partyMemberRoleSchema = z.enum(['leader', 'member']);
export type PartyMemberRole = z.infer<typeof partyMemberRoleSchema>;

export const partyReadyStateSchema = z.enum([
  'waiting',
  'ready',
  'not_ready',
  'disconnected',
  'expired',
]);
export type PartyReadyState = z.infer<typeof partyReadyStateSchema>;

export const partyMemberSchema = socialGraphPlayerSchema
  .extend({
    role: partyMemberRoleSchema,
    connectionStatus: friendPresenceStatusSchema,
    worldId: mapIdSchema.nullable(),
    worldName: z.string().trim().min(1).max(120).nullable(),
    channelNumber: z.number().int().min(1).max(99).nullable(),
    readyState: partyReadyStateSchema,
    joinedAt: timestampSchema,
  })
  .strict();
export type PartyMember = z.infer<typeof partyMemberSchema>;

export const partyInvitationStatusSchema = z.enum([
  'pending',
  'accepted',
  'declined',
  'cancelled',
  'expired',
  'invalidated',
]);

export const partyInvitationSchema = z
  .object({
    id: uuidSchema,
    partyId: uuidSchema,
    partyRevision: z.number().int().positive(),
    status: partyInvitationStatusSchema,
    inviter: socialGraphPlayerSchema,
    target: socialGraphPlayerSchema,
    createdAt: timestampSchema,
    expiresAt: timestampSchema,
  })
  .strict();
export type PartyInvitation = z.infer<typeof partyInvitationSchema>;

export const partyReadyCheckSchema = z
  .object({
    id: uuidSchema,
    status: z.enum(['active', 'completed', 'expired', 'invalidated']),
    partyRevision: z.number().int().positive(),
    createdAt: timestampSchema,
    expiresAt: timestampSchema,
    responses: z
      .array(
        z
          .object({
            presenceId: uuidSchema,
            state: partyReadyStateSchema,
            respondedAt: timestampSchema.nullable(),
          })
          .strict(),
      )
      .max(MAXIMUM_PARTY_CAPACITY),
  })
  .strict();
export type PartyReadyCheck = z.infer<typeof partyReadyCheckSchema>;

export const partySnapshotSchema = z
  .object({
    partyId: uuidSchema,
    revision: z.number().int().positive(),
    status: z.enum(['active', 'disbanded', 'expired']),
    capacity: z.number().int().min(2).max(MAXIMUM_PARTY_CAPACITY),
    leaderPresenceId: uuidSchema,
    members: z.array(partyMemberSchema).min(1).max(MAXIMUM_PARTY_CAPACITY),
    pendingInvitationCount: z.number().int().min(0).max(50),
    readyCheck: partyReadyCheckSchema.nullable(),
    leaderReconnectDeadline: timestampSchema.nullable(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (snapshot.status !== 'active') return;
    const leaders = snapshot.members.filter((member) => member.role === 'leader');
    if (leaders.length !== 1 || leaders[0]?.presenceId !== snapshot.leaderPresenceId) {
      context.addIssue({
        code: 'custom',
        path: ['members'],
        message: 'Party must have one leader',
      });
    }
  });
export type PartySnapshot = z.infer<typeof partySnapshotSchema>;

export const socialGraphNotificationTypeSchema = z.enum([
  'friend_request',
  'friend_accepted',
  'party_invitation',
  'invitation_accepted',
  'invitation_declined',
  'member_joined',
  'member_left',
  'member_kicked',
  'leader_changed',
  'ready_check',
  'party_disbanded',
]);

export const socialGraphNotificationSchema = z
  .object({
    id: uuidSchema,
    type: socialGraphNotificationTypeSchema,
    message: z.string().trim().min(1).max(160),
    actorPresenceId: uuidSchema.nullable(),
    partyId: uuidSchema.nullable(),
    createdAt: timestampSchema,
    expiresAt: timestampSchema,
  })
  .strict();
export type SocialGraphNotification = z.infer<typeof socialGraphNotificationSchema>;

export const socialGraphSettingsViewSchema = z
  .object({
    maximumFriends: z.number().int().min(1).max(500),
    maximumIncomingRequests: z.number().int().min(1).max(200),
    maximumOutgoingRequests: z.number().int().min(1).max(100),
    partyCapacity: z.number().int().min(2).max(MAXIMUM_PARTY_CAPACITY),
    friendRequestExpirySeconds: z.number().int().min(3_600).max(2_592_000),
    partyInvitationExpirySeconds: z.number().int().min(30).max(3_600),
    readyCheckExpirySeconds: z.number().int().min(10).max(120),
    leaderReconnectGraceSeconds: z.number().int().min(15).max(600),
    partyDormantTimeoutSeconds: z.number().int().min(300).max(604_800),
    nearbyInvitationsEnabled: z.boolean(),
    partyChatEnabled: z.boolean(),
    friendLocationVisibilityEnabled: z.boolean(),
    version: z.number().int().positive(),
  })
  .strict();
export type SocialGraphSettingsView = z.infer<typeof socialGraphSettingsViewSchema>;

export const socialGraphBootstrapSchema = z
  .object({
    friends: z.array(friendViewSchema).max(500),
    incomingRequests: z.array(friendRequestViewSchema).max(200),
    outgoingRequests: z.array(friendRequestViewSchema).max(100),
    party: partySnapshotSchema.nullable(),
    invitations: z.array(partyInvitationSchema).max(50),
    notifications: z.array(socialGraphNotificationSchema).max(SOCIAL_GRAPH_NOTIFICATION_LIMIT),
    settings: socialGraphSettingsViewSchema,
  })
  .strict();
export type SocialGraphBootstrap = z.infer<typeof socialGraphBootstrapSchema>;

export const socialGraphErrorCodeSchema = z.enum([
  'player_unavailable',
  'already_friends',
  'friend_limit_reached',
  'request_changed',
  'request_expired',
  'party_changed',
  'party_full',
  'already_in_party',
  'not_party_leader',
  'invitation_changed',
  'blocked',
  'rate_limited',
  'access_changed',
  'maintenance',
  'persistence_unavailable',
]);
export type SocialGraphErrorCode = z.infer<typeof socialGraphErrorCodeSchema>;

export const socialGraphOperationResultSchema = z
  .object({
    status: z.string().min(1).max(64),
    friendRequest: friendRequestViewSchema.optional(),
    party: partySnapshotSchema.nullable().optional(),
    invitation: partyInvitationSchema.optional(),
    notification: socialGraphNotificationSchema.optional(),
    affectedPresenceIds: z.array(uuidSchema).max(16).default([]),
  })
  .strict();
export type SocialGraphOperationResult = z.infer<typeof socialGraphOperationResultSchema>;

export const adminSocialGraphPartySummarySchema = z
  .object({
    partyId: uuidSchema,
    status: z.enum(['active', 'disbanded', 'expired']),
    revision: z.number().int().positive(),
    capacity: z.number().int().min(2).max(MAXIMUM_PARTY_CAPACITY),
    leaderDisplayName: z.string().min(3).max(20),
    memberCount: z.number().int().min(0).max(MAXIMUM_PARTY_CAPACITY),
    reconnectingCount: z.number().int().min(0).max(MAXIMUM_PARTY_CAPACITY),
    pendingInvitationCount: z.number().int().min(0).max(50),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const adminSocialGraphListSchema = z
  .object({
    parties: z.array(adminSocialGraphPartySummarySchema).max(100),
    friendshipRequestCount: z.number().int().nonnegative(),
    acceptedFriendshipCount: z.number().int().nonnegative(),
    recentDisbandCount: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.union([z.literal(10), z.literal(50), z.literal(100)]),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();
export type AdminSocialGraphList = z.infer<typeof adminSocialGraphListSchema>;

export const adminSocialGraphAuditSchema = z
  .object({
    id: uuidSchema,
    action: z.string().min(1).max(80),
    result: z.string().min(1).max(80),
    partyRevision: z.number().int().positive().nullable(),
    createdAt: timestampSchema,
  })
  .strict();

export const adminSocialGraphPartyDetailSchema = z
  .object({
    party: partySnapshotSchema,
    invitations: z.array(partyInvitationSchema).max(50),
    audit: z.array(adminSocialGraphAuditSchema).max(100),
  })
  .strict();
export type AdminSocialGraphPartyDetail = z.infer<typeof adminSocialGraphPartyDetailSchema>;

export const adminSocialGraphAuditEntrySchema = z
  .object({
    id: uuidSchema,
    entityType: z.enum([
      'friend_request',
      'friendship',
      'party',
      'party_invitation',
      'ready_check',
      'settings',
    ]),
    entityId: uuidSchema.nullable(),
    partyId: uuidSchema.nullable(),
    actorPresenceId: uuidSchema.nullable(),
    action: z.string().min(1).max(80),
    result: z.string().min(1).max(80),
    requestId: z.string().min(1).max(128),
    partyRevision: z.number().int().positive().nullable(),
    moderationProtected: z.boolean(),
    createdAt: timestampSchema,
  })
  .strict();
export type AdminSocialGraphAuditEntry = z.infer<typeof adminSocialGraphAuditEntrySchema>;

export const adminSocialGraphAuditListSchema = z
  .object({
    items: z.array(adminSocialGraphAuditEntrySchema).max(100),
    page: z.number().int().positive(),
    pageSize: z.union([z.literal(10), z.literal(50), z.literal(100)]),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();
export type AdminSocialGraphAuditList = z.infer<typeof adminSocialGraphAuditListSchema>;

export const updateSocialGraphSettingsInputSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    maximumFriends: z.number().int().min(1).max(500),
    partyCapacity: z.number().int().min(2).max(MAXIMUM_PARTY_CAPACITY),
    friendRequestExpirySeconds: z.number().int().min(3_600).max(2_592_000),
    partyInvitationExpirySeconds: z.number().int().min(30).max(3_600),
    readyCheckExpirySeconds: z.number().int().min(10).max(120),
    leaderReconnectGraceSeconds: z.number().int().min(15).max(600),
    partyDormantTimeoutSeconds: z.number().int().min(300).max(604_800),
    nearbyInvitationsEnabled: z.boolean(),
    partyChatEnabled: z.boolean(),
    friendLocationVisibilityEnabled: z.boolean(),
  })
  .strict();
export type UpdateSocialGraphSettingsInput = z.infer<typeof updateSocialGraphSettingsInputSchema>;
