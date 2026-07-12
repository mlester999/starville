import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import {
  facingDirectionSchema,
  mapIdSchema,
  mapManifestSchema,
  type MapManifest,
} from '@starville/game-core';

import type {
  PlayerWorldFailure,
  PlayerWorldGateway,
  PublishedManifestView,
  PublishedWorldMap,
  PublishedWorldPlayerState,
  PublishedWorldVersion,
  PublishedWorldView,
  WorldTransitionView,
} from './player-contracts.js';

const timestampSchema = z.iso.datetime({ offset: true });
const worldFailureSchema = z.object({
  status: z.enum([
    'not_found',
    'suspended',
    'rename_required',
    'rate_limited',
    'world_unavailable',
    'map_not_found',
    'version_conflict',
    'invalid_exit',
    'destination_unavailable',
  ]),
});
const mapRecordSchema = z.object({
  id: z.uuid(),
  slug: mapIdSchema,
  displayName: z.string().min(1).max(80),
  description: z.string().min(1).max(280),
  status: z.enum(['active', 'archived']),
  defaultSpawnId: z.string().min(1).max(64),
  activePublishedVersionId: z.uuid().nullable(),
  recordVersion: z.number().int().positive(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
const versionRecordSchema = z.object({
  id: z.uuid(),
  worldMapId: z.uuid(),
  versionNumber: z.number().int().positive(),
  lifecycleStatus: z.enum(['draft', 'validated', 'published', 'superseded', 'archived']),
  editVersion: z.number().int().positive(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/u),
  validationStatus: z.enum(['pending', 'valid', 'invalid']),
  validationResult: z.record(z.string(), z.unknown()),
  createdByAdminId: z.uuid().nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  validatedAt: timestampSchema.nullable(),
  validatedByAdminId: z.uuid().nullable(),
  publishedAt: timestampSchema.nullable(),
  publishedByAdminId: z.uuid().nullable(),
  publicationReason: z.string().nullable(),
  supersedesVersionId: z.uuid().nullable(),
  derivedFromVersionId: z.uuid().nullable(),
});
const playerStateSchema = z.object({
  mapId: mapIdSchema,
  mapVersionId: z.uuid(),
  x: z.coerce.number().finite(),
  y: z.coerce.number().finite(),
  facingDirection: facingDirectionSchema,
  gameStateVersion: z.number().int().positive(),
  stateVersion: z.number().int().positive(),
  lastTransitionAt: timestampSchema.nullable(),
  updatedAt: timestampSchema,
});
const loadedManifestSchema = z.object({
  status: z.literal('loaded'),
  map: mapRecordSchema,
  version: versionRecordSchema,
  manifest: mapManifestSchema,
});
const loadedWorldSchema = loadedManifestSchema.extend({ playerState: playerStateSchema });
const transitionedWorldSchema = loadedWorldSchema.omit({ status: true }).extend({
  status: z.enum(['transitioned', 'replayed']),
  transition: z.object({
    exitId: z.string().min(1).max(64),
    fromMapId: mapIdSchema.nullable(),
    toMapId: mapIdSchema,
    destinationSpawnId: z.string().min(1).max(64),
    completedAt: timestampSchema,
  }),
});

export class PlayerWorldPersistenceError extends Error {
  public constructor() {
    super('World persistence operation failed.');
    this.name = 'PlayerWorldPersistenceError';
  }
}

async function executeRpc(
  client: SupabaseClient,
  operation: string,
  parameters: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const { data, error } = await client.rpc(operation, parameters);
  if (error !== null) throw new PlayerWorldPersistenceError();
  return data;
}

function publicMap(value: z.infer<typeof mapRecordSchema>): PublishedWorldMap {
  return {
    id: value.id,
    slug: value.slug,
    displayName: value.displayName,
    description: value.description,
  };
}

function publicVersion(value: z.infer<typeof versionRecordSchema>): PublishedWorldVersion {
  if (value.lifecycleStatus !== 'published' || value.publishedAt === null) {
    throw new PlayerWorldPersistenceError();
  }
  return {
    id: value.id,
    versionNumber: value.versionNumber,
    checksum: value.checksum,
    publishedAt: value.publishedAt,
  };
}

function publicState(value: z.infer<typeof playerStateSchema>): PublishedWorldPlayerState {
  if (value.stateVersion !== value.gameStateVersion) throw new PlayerWorldPersistenceError();
  return {
    mapId: value.mapId,
    mapVersionId: value.mapVersionId,
    x: value.x,
    y: value.y,
    facingDirection: value.facingDirection,
    gameStateVersion: value.gameStateVersion,
    updatedAt: value.updatedAt,
    lastTransitionAt: value.lastTransitionAt,
  };
}

function parseFailure(value: unknown): PlayerWorldFailure | undefined {
  return worldFailureSchema.safeParse(value).data?.status;
}

function parseManifest(value: unknown): PublishedManifestView | PlayerWorldFailure {
  const failure = parseFailure(value);
  if (failure !== undefined) return failure;
  const parsed = loadedManifestSchema.safeParse(value);
  if (!parsed.success) throw new PlayerWorldPersistenceError();
  return {
    map: publicMap(parsed.data.map),
    version: publicVersion(parsed.data.version),
    manifest: parsed.data.manifest as MapManifest,
  };
}

function parseWorld(value: unknown): PublishedWorldView | PlayerWorldFailure {
  const failure = parseFailure(value);
  if (failure !== undefined) return failure;
  const parsed = loadedWorldSchema.safeParse(value);
  if (!parsed.success) throw new PlayerWorldPersistenceError();
  return {
    map: publicMap(parsed.data.map),
    version: publicVersion(parsed.data.version),
    manifest: parsed.data.manifest as MapManifest,
    playerState: publicState(parsed.data.playerState),
  };
}

function parseTransition(value: unknown): WorldTransitionView | PlayerWorldFailure {
  const failure = parseFailure(value);
  if (failure !== undefined) return failure;
  const parsed = transitionedWorldSchema.safeParse(value);
  if (!parsed.success) throw new PlayerWorldPersistenceError();
  return {
    map: publicMap(parsed.data.map),
    version: publicVersion(parsed.data.version),
    manifest: parsed.data.manifest as MapManifest,
    playerState: publicState(parsed.data.playerState),
    transition: parsed.data.transition,
  };
}

export function createSupabasePlayerWorldGateway(client: SupabaseClient): PlayerWorldGateway {
  return {
    async loadCurrent(walletAddress, requestId, rateLimit) {
      return parseWorld(
        await executeRpc(client, 'get_current_published_world', {
          p_wallet_address: walletAddress,
          p_request_id: requestId,
          p_rate_limit: rateLimit,
        }),
      );
    },
    async loadPublishedManifest(walletAddress, mapId, requestId, rateLimit) {
      return parseManifest(
        await executeRpc(client, 'get_published_world_manifest', {
          p_wallet_address: walletAddress,
          p_map_slug: mapId,
          p_request_id: requestId,
          p_rate_limit: rateLimit,
        }),
      );
    },
    async transition(walletAddress, input, requestId, rateLimit) {
      return parseTransition(
        await executeRpc(client, 'transition_player_world', {
          p_wallet_address: walletAddress,
          p_exit_id: input.exitId,
          p_expected_game_state_version: input.expectedGameStateVersion,
          p_expected_map_version_id: input.expectedMapVersionId,
          p_request_id: requestId,
          p_rate_limit: rateLimit,
        }),
      );
    },
  };
}
