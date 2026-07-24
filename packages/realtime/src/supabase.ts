import { z } from 'zod';

import { publicPresenceSchema, realtimeChannelSchema } from './protocol';

export const SUPABASE_REALTIME_PROTOCOL_VERSION = 1 as const;
export const SUPABASE_REALTIME_MAX_PAYLOAD_BYTES = 16_384;
export const SUPABASE_REALTIME_MOVEMENT_INTERVAL_MS = 100;

export const supabaseRealtimeEnvironmentSchema = z.enum(['development', 'test', 'production']);
export type SupabaseRealtimeEnvironment = z.infer<typeof supabaseRealtimeEnvironmentSchema>;

const safeTopicSegmentSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const uuidSchema = z.uuid();

function topic(
  environment: SupabaseRealtimeEnvironment,
  scope: 'world' | 'player' | 'party' | 'home',
  id: string,
  suffix?: string,
): string {
  const parsedEnvironment = supabaseRealtimeEnvironmentSchema.parse(environment);
  const parsedId = scope === 'world' ? safeTopicSegmentSchema.parse(id) : uuidSchema.parse(id);
  return `starville:${parsedEnvironment}:${scope}:${parsedId}${suffix ?? ''}`;
}

export function worldRealtimeTopic(
  environment: SupabaseRealtimeEnvironment,
  mapSlug: string,
  channelId: string,
): string {
  return topic(environment, 'world', mapSlug, `:channel:${uuidSchema.parse(channelId)}`);
}

export function playerRealtimeTopic(
  environment: SupabaseRealtimeEnvironment,
  publicPresenceId: string,
): string {
  return topic(environment, 'player', publicPresenceId);
}

export function partyRealtimeTopic(
  environment: SupabaseRealtimeEnvironment,
  publicPartyId: string,
): string {
  return topic(environment, 'party', publicPartyId);
}

export function homeRealtimeTopic(
  environment: SupabaseRealtimeEnvironment,
  homeId: string,
): string {
  return topic(environment, 'home', homeId);
}

export const supabasePresencePayloadSchema = z
  .object({
    version: z.literal(SUPABASE_REALTIME_PROTOCOL_VERSION),
    membershipId: uuidSchema,
    player: publicPresenceSchema,
    status: z.enum(['online', 'reconnecting']),
  })
  .strict();
export type SupabasePresencePayload = z.infer<typeof supabasePresencePayloadSchema>;

export const supabaseMovementBroadcastSchema = z
  .object({
    version: z.literal(SUPABASE_REALTIME_PROTOCOL_VERSION),
    membershipId: uuidSchema,
    presenceId: uuidSchema,
    worldId: safeTopicSegmentSchema,
    worldVersionId: uuidSchema,
    channelId: uuidSchema,
    sequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    timestamp: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
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
    movementState: z.enum(['idle', 'walking']),
    animationState: z
      .string()
      .trim()
      .min(1)
      .max(48)
      .regex(/^[a-z0-9_-]+$/u),
  })
  .strict();
export type SupabaseMovementBroadcast = z.infer<typeof supabaseMovementBroadcastSchema>;

export const supabaseRealtimeAuthorizationViewSchema = z
  .object({
    membershipId: uuidSchema,
    topic: z.string().min(1).max(256),
    authorizationExpiresAt: z.iso.datetime({ offset: true }),
    self: publicPresenceSchema,
    channels: z.array(realtimeChannelSchema).max(99),
  })
  .strict();
export type SupabaseRealtimeAuthorizationView = z.infer<
  typeof supabaseRealtimeAuthorizationViewSchema
>;

export function parseSupabaseRealtimePayload<T>(
  schema: z.ZodType<T>,
  payload: unknown,
): T | undefined {
  let serialized: string;
  try {
    serialized = JSON.stringify(payload);
  } catch {
    return undefined;
  }
  if (new TextEncoder().encode(serialized).byteLength > SUPABASE_REALTIME_MAX_PAYLOAD_BYTES) {
    return undefined;
  }
  const result = schema.safeParse(payload);
  return result.success ? result.data : undefined;
}
