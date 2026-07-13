import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import {
  dustAccountSchema,
  dustLedgerEntrySchema,
  gameplayContentInspectionSchema,
  inventoryMovementSchema,
  inventorySchema,
  paginationMetaSchema,
  timestampSchema,
} from '@starville/cozy-gameplay';

import type { AdminDatabaseIdentity } from '../contracts.js';
import { PublicApiError } from '../errors.js';

const playerIdSchema = z.uuid();
export const adminCozyPageQuerySchema = z
  .object({
    page: z.preprocess(
      (value) => (value === undefined ? 1 : Number(value)),
      z.number().int().positive(),
    ),
    pageSize: z.preprocess(
      (value) => (value === undefined ? 10 : Number(value)),
      z.union([z.literal(10), z.literal(50), z.literal(100)]),
    ),
  })
  .strict();

const adminLedgerEntrySchema = dustLedgerEntrySchema.omit({ requestId: true });
export const adminPlayerEconomySchema = z
  .object({
    initialized: z.boolean(),
    account: dustAccountSchema.nullable(),
    items: z.array(adminLedgerEntrySchema).max(100),
    pagination: paginationMetaSchema,
  })
  .strict();
export const adminPlayerInventorySchema = z
  .object({
    initialized: z.boolean(),
    inventory: inventorySchema.nullable(),
    items: z.array(inventoryMovementSchema).max(100),
    pagination: paginationMetaSchema,
  })
  .strict();
export const adminPlayerCozySchema = z
  .object({
    initialized: z.boolean(),
    farm: z
      .object({
        total: z.number().int().nonnegative(),
        ready: z.number().int().nonnegative(),
        occupied: z.number().int().nonnegative(),
      })
      .strict(),
    home: z
      .object({
        templateName: z.string().min(1).max(80),
        templateVersion: z.number().int().positive(),
        placedFurnitureCount: z.number().int().nonnegative().max(200),
        insideHome: z.boolean(),
      })
      .strict()
      .nullable(),
    lastGameplayUpdate: timestampSchema.nullable(),
  })
  .strict();

type AdminPlayerEconomy = z.infer<typeof adminPlayerEconomySchema>;
type AdminPlayerInventory = z.infer<typeof adminPlayerInventorySchema>;
type AdminPlayerCozy = z.infer<typeof adminPlayerCozySchema>;
type GameplayContentInspection = z.infer<typeof gameplayContentInspectionSchema>;

const notFoundSchema = z.object({ status: z.literal('not_found') }).strict();
const loadedEconomySchema = adminPlayerEconomySchema.extend({ status: z.literal('loaded') });
const loadedInventorySchema = adminPlayerInventorySchema.extend({ status: z.literal('loaded') });
const loadedCozySchema = adminPlayerCozySchema.extend({ status: z.literal('loaded') });
const loadedContentSchema = gameplayContentInspectionSchema.extend({ status: z.literal('loaded') });

function identityParameters(identity: AdminDatabaseIdentity) {
  return {
    p_user_id: identity.userId,
    p_auth_session_id: identity.authSessionId,
    p_assurance_level: identity.assuranceLevel,
  } as const;
}

async function rpc(
  client: SupabaseClient,
  operation: string,
  parameters: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const result = await client.rpc(operation, parameters);
  if (result.error !== null) throw new PublicApiError(503, 'OPERATIONS_UNAVAILABLE');
  return result.data;
}

function loaded<Value>(
  value: unknown,
  schema: { parse(input: unknown): Value & { status: 'loaded' } },
): Value {
  if (notFoundSchema.safeParse(value).success) throw new PublicApiError(404, 'PLAYER_NOT_FOUND');
  const { status: _status, ...result } = schema.parse(value);
  void _status;
  return result as Value;
}

export interface AdminCozyService {
  getEconomy(
    identity: AdminDatabaseIdentity,
    playerId: unknown,
    query: unknown,
  ): Promise<AdminPlayerEconomy>;
  getInventory(
    identity: AdminDatabaseIdentity,
    playerId: unknown,
    query: unknown,
  ): Promise<AdminPlayerInventory>;
  getCozy(identity: AdminDatabaseIdentity, playerId: unknown): Promise<AdminPlayerCozy>;
  getContent(identity: AdminDatabaseIdentity): Promise<GameplayContentInspection>;
}

export function createAdminCozyService(client: SupabaseClient): AdminCozyService {
  return {
    async getEconomy(identity, rawPlayerId, rawQuery) {
      const playerId = playerIdSchema.safeParse(rawPlayerId);
      const query = adminCozyPageQuerySchema.safeParse(rawQuery);
      if (!playerId.success || !query.success) throw new PublicApiError(400, 'INVALID_REQUEST');
      return loaded(
        await rpc(client, 'get_admin_player_economy', {
          ...identityParameters(identity),
          p_player_profile_id: playerId.data,
          p_page: query.data.page,
          p_page_size: query.data.pageSize,
        }),
        loadedEconomySchema,
      );
    },

    async getInventory(identity, rawPlayerId, rawQuery) {
      const playerId = playerIdSchema.safeParse(rawPlayerId);
      const query = adminCozyPageQuerySchema.safeParse(rawQuery);
      if (!playerId.success || !query.success) throw new PublicApiError(400, 'INVALID_REQUEST');
      return loaded(
        await rpc(client, 'get_admin_player_inventory', {
          ...identityParameters(identity),
          p_player_profile_id: playerId.data,
          p_page: query.data.page,
          p_page_size: query.data.pageSize,
        }),
        loadedInventorySchema,
      );
    },

    async getCozy(identity, rawPlayerId) {
      const playerId = playerIdSchema.safeParse(rawPlayerId);
      if (!playerId.success) throw new PublicApiError(400, 'INVALID_REQUEST');
      return loaded(
        await rpc(client, 'get_admin_player_cozy_gameplay', {
          ...identityParameters(identity),
          p_player_profile_id: playerId.data,
        }),
        loadedCozySchema,
      );
    },

    async getContent(identity) {
      return loaded(
        await rpc(client, 'get_admin_gameplay_content', identityParameters(identity)),
        loadedContentSchema,
      );
    },
  };
}
