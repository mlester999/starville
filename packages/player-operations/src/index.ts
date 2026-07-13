import {
  playerProfileObjectSchema,
  playerProfileSchema,
  refineMatchingPlayerStateVersions,
} from '@starville/game-core';
import { walletAddressSchema, walletNetworkSchema } from '@starville/wallet-access';
import { z } from 'zod';

export const PLAYER_MODERATION_STATUSES = ['active', 'suspended'] as const;
export const PLAYER_ENTRY_STATES = ['active', 'rename_required', 'suspended'] as const;
export const PLAYER_DIRECTORY_SORTS = [
  'last_entered_at',
  'display_name',
  'created_at',
  'moderation_status',
] as const;
export const PLAYER_AUDIT_EVENTS = [
  'player.suspended',
  'player.restored',
  'player.position_reset',
  'player.rename_required',
  'player.rename_completed',
  'player.sessions_revoked',
  'player.access_denied.suspended',
  'player.access_denied.rename_required',
] as const;

export const playerModerationStatusSchema = z.enum(PLAYER_MODERATION_STATUSES);
export const playerEntryStateSchema = z.enum(PLAYER_ENTRY_STATES);
export const playerDirectorySortSchema = z.enum(PLAYER_DIRECTORY_SORTS);
export const playerAuditEventSchema = z.enum(PLAYER_AUDIT_EVENTS);

const dateTimeSchema = z.iso.datetime({ offset: true });
const nullableDateTimeSchema = dateTimeSchema.nullable();
const countSchema = z.number().int().nonnegative();
const versionSchema = z.number().int().positive();

export const playerEntryProfileSchema = z
  .object({
    entryState: playerEntryStateSchema,
    profile: playerProfileSchema,
  })
  .strict();

export const playerDirectoryItemSchema = z
  .object({
    id: z.uuid(),
    displayName: z.string().min(3).max(20),
    walletAddress: walletAddressSchema.nullable(),
    appearancePreset: playerProfileSchema.shape.appearancePreset,
    mapId: playerProfileSchema.shape.mapId,
    moderationStatus: playerModerationStatusSchema,
    renameRequired: z.boolean(),
    moderationVersion: versionSchema,
    activeAccessSessions: countSchema,
    lastEnteredAt: dateTimeSchema,
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
  })
  .strict();

export const playerDirectorySchema = z
  .object({
    items: z.array(playerDirectoryItemSchema),
    page: z.number().int().positive(),
    pageSize: z.number().int().min(1).max(100),
    total: countSchema,
    totalPages: countSchema,
  })
  .strict();

export const playerModerationStateSchema = z
  .object({
    status: playerModerationStatusSchema,
    suspensionReason: z.string().max(500).nullable(),
    suspendedAt: nullableDateTimeSchema,
    suspendedByAdminId: z.uuid().nullable(),
    restoredAt: nullableDateTimeSchema,
    restoredByAdminId: z.uuid().nullable(),
    restorationReason: z.string().max(500).nullable(),
    renameRequired: z.boolean(),
    renameReason: z.string().max(500).nullable(),
    renameRequiredAt: nullableDateTimeSchema,
    renameRequiredByAdminId: z.uuid().nullable(),
    version: versionSchema,
    updatedAt: dateTimeSchema,
  })
  .strict();

const playerDetailProfileSchema = refineMatchingPlayerStateVersions(
  playerProfileObjectSchema.extend({
    walletAddress: walletAddressSchema.nullable(),
  }),
);

export const playerDetailSchema = z
  .object({
    profile: playerDetailProfileSchema,
    moderation: playerModerationStateSchema,
    access: z
      .object({
        activeSessions: countSchema,
        latestSessionStatus: z
          .enum(['active', 'revoked', 'expired', 'insufficient_balance', 'configuration_changed'])
          .nullable(),
        latestSessionAt: nullableDateTimeSchema,
      })
      .strict(),
  })
  .strict();

export const playerActivityItemSchema = z
  .object({
    id: z.uuid(),
    event: playerAuditEventSchema,
    actorType: z.enum(['admin', 'player', 'system']),
    actorAdminUserId: z.uuid().nullable(),
    requestId: z.string().max(128).nullable(),
    outcome: z.enum(['success', 'denied', 'error']),
    reasonCode: z.string().max(80).nullable(),
    reason: z.string().max(500).nullable(),
    beforeState: z.record(z.string(), z.unknown()),
    afterState: z.record(z.string(), z.unknown()),
    metadata: z.record(z.string(), z.unknown()),
    createdAt: dateTimeSchema,
  })
  .strict();

export const playerAccessActivityItemSchema = z
  .object({
    id: z.uuid(),
    event: z
      .string()
      .regex(/^wallet\.[a-z_.]+$/u)
      .max(80),
    result: z.enum(['success', 'denied', 'error']),
    reasonCode: z.string().max(80).nullable(),
    createdAt: dateTimeSchema,
  })
  .strict();

export const playerActivitySchema = z
  .object({
    items: z.array(playerActivityItemSchema).max(100),
    accessEvents: z.array(playerAccessActivityItemSchema).max(100),
    accessPage: z.number().int().positive(),
    accessPageSize: z.union([z.literal(10), z.literal(50), z.literal(100)]),
    accessTotal: countSchema,
    accessTotalPages: countSchema,
    nextCursor: dateTimeSchema.nullable(),
  })
  .strict();

export const playerActionResultSchema = z
  .object({
    playerId: z.uuid(),
    moderationStatus: playerModerationStatusSchema,
    renameRequired: z.boolean(),
    moderationVersion: versionSchema,
    gameStateVersion: versionSchema,
    revokedSessionCount: countSchema,
    replayed: z.boolean(),
  })
  .strict();

export const serviceOperationStatusSchema = z
  .object({
    service: z.enum(['api', 'realtime-server', 'worker']),
    status: z.enum(['healthy', 'degraded', 'unavailable', 'unknown']),
    checkedAt: dateTimeSchema,
    responseTimeMs: countSchema.nullable(),
  })
  .strict();

export const operationsSummarySchema = z
  .object({
    generatedAt: dateTimeSchema,
    players: z
      .object({
        total: countSchema,
        active: countSchema,
        suspended: countSchema,
        renameRequired: countSchema,
        createdLast24Hours: countSchema,
        enteredLast24Hours: countSchema,
      })
      .strict(),
    access: z
      .object({
        activeSessions: countSchema,
        definition: z.literal('Unexpired, unrevoked sessions valid for the current token config'),
      })
      .strict(),
    tokenAccess: z
      .object({
        enabled: z.boolean(),
        network: walletNetworkSchema,
        symbol: z.string().min(1).max(16),
        requiredAmount: z.string().regex(/^\d+(?:\.\d+)?$/u),
        configVersion: versionSchema,
        validationState: z.enum(['unconfigured', 'validated', 'invalid']),
      })
      .strict(),
    services: z.array(serviceOperationStatusSchema).length(3),
  })
  .strict();

export type PlayerModerationStatus = z.infer<typeof playerModerationStatusSchema>;
export type PlayerEntryState = z.infer<typeof playerEntryStateSchema>;
export type PlayerEntryProfile = z.infer<typeof playerEntryProfileSchema>;
export type PlayerDirectoryItem = z.infer<typeof playerDirectoryItemSchema>;
export type PlayerDirectory = z.infer<typeof playerDirectorySchema>;
export type PlayerDetail = z.infer<typeof playerDetailSchema>;
export type PlayerActivity = z.infer<typeof playerActivitySchema>;
export type PlayerActionResult = z.infer<typeof playerActionResultSchema>;
export type OperationsSummary = z.infer<typeof operationsSummarySchema>;
