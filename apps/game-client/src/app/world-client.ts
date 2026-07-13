import { z } from 'zod';

import { worldAssetDeliveriesSchema, type WorldAssetDelivery } from '@starville/asset-management';
import {
  facingDirectionSchema,
  mapIdSchema,
  mapManifestSchema,
  validateMapManifest,
  type MapManifest,
} from '@starville/game-core';
import { WORLD_ASSET_CATALOG } from '@starville/game-content';

import { PlayerRequestError, requestPlayerApi } from './player-client';

const identifierSchema = z.uuid();
const checksumSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const timestampSchema = z.iso.datetime({ offset: true });

const publishedMapSchema = z
  .object({
    id: identifierSchema,
    slug: mapIdSchema,
    displayName: z.string().min(1).max(80),
    description: z.string().min(1).max(280),
  })
  .strict();

const publishedVersionSchema = z
  .object({
    id: identifierSchema,
    versionNumber: z.number().int().positive(),
    checksum: checksumSchema,
    publishedAt: timestampSchema,
  })
  .strict();

export const publishedPlayerStateSchema = z
  .object({
    mapId: mapIdSchema,
    mapVersionId: identifierSchema,
    x: z.number().finite(),
    y: z.number().finite(),
    facingDirection: facingDirectionSchema,
    gameStateVersion: z.number().int().positive(),
    updatedAt: timestampSchema,
    lastTransitionAt: timestampSchema.nullable().optional(),
  })
  .strict();

export const publishedWorldSchema = z
  .object({
    map: publishedMapSchema,
    version: publishedVersionSchema,
    manifest: mapManifestSchema,
    assetDeliveries: worldAssetDeliveriesSchema.optional().default([]),
    playerState: publishedPlayerStateSchema,
  })
  .strict()
  .superRefine((world, context) => {
    if (
      world.map.slug !== world.manifest.slug ||
      world.playerState.mapId !== world.manifest.id ||
      world.playerState.mapVersionId !== world.version.id
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Published world identity does not match the player state',
      });
    }
  });

const publishedManifestSchema = z
  .object({
    map: publishedMapSchema,
    version: publishedVersionSchema,
    manifest: mapManifestSchema,
    assetDeliveries: worldAssetDeliveriesSchema.optional().default([]),
  })
  .strict();

const transitionSchema = z
  .object({
    exitId: z.string().min(1).max(64),
    fromMapId: mapIdSchema.nullable(),
    toMapId: mapIdSchema,
    destinationSpawnId: z.string().min(1).max(64),
    completedAt: timestampSchema,
  })
  .strict();

const transitionWorldSchema = publishedWorldSchema.safeExtend({ transition: transitionSchema });

export type PublishedPlayerState = z.infer<typeof publishedPlayerStateSchema>;
export type PublishedWorld = Omit<z.infer<typeof publishedWorldSchema>, 'manifest'> & {
  readonly manifest: MapManifest;
};
export type PublishedManifest = Omit<z.infer<typeof publishedManifestSchema>, 'manifest'> & {
  readonly manifest: MapManifest;
};
export type WorldTransition = Omit<z.infer<typeof transitionWorldSchema>, 'manifest'> & {
  readonly manifest: MapManifest;
};

function validatedManifest(
  value: z.infer<typeof mapManifestSchema>,
  deliveries: readonly WorldAssetDelivery[],
): MapManifest {
  try {
    const declaredAssets = new Set(value.assets);
    if (deliveries.some(({ assetKey }) => !declaredAssets.has(assetKey))) {
      throw new Error('Published world contains an undeclared asset delivery');
    }
    const availableAssets = new Set([
      ...WORLD_ASSET_CATALOG.keys(),
      ...deliveries.map(({ assetKey }) => assetKey),
    ]);
    return validateMapManifest(value, availableAssets);
  } catch {
    throw new PlayerRequestError(502, 'INVALID_WORLD_RESPONSE');
  }
}

function parseWorld(value: unknown): PublishedWorld {
  const result = publishedWorldSchema.safeParse(value);
  if (!result.success) throw new PlayerRequestError(502, 'INVALID_WORLD_RESPONSE');
  return {
    ...result.data,
    manifest: validatedManifest(result.data.manifest, result.data.assetDeliveries),
  } as PublishedWorld;
}

export async function loadCurrentPublishedWorld(
  apiUrl: string,
  signal?: AbortSignal,
): Promise<PublishedWorld> {
  return parseWorld(
    await requestPlayerApi(apiUrl, '/world/current', {
      method: 'GET',
      ...(signal === undefined ? {} : { signal }),
    }),
  );
}

export async function loadPublishedWorldManifest(
  apiUrl: string,
  mapId: z.infer<typeof mapIdSchema>,
  signal?: AbortSignal,
): Promise<PublishedManifest> {
  const value = await requestPlayerApi(
    apiUrl,
    `/world/maps/${encodeURIComponent(mapId)}/manifest`,
    {
      method: 'GET',
      ...(signal === undefined ? {} : { signal }),
    },
  );
  const result = publishedManifestSchema.safeParse(value);
  if (!result.success) throw new PlayerRequestError(502, 'INVALID_WORLD_RESPONSE');
  return {
    ...result.data,
    manifest: validatedManifest(result.data.manifest, result.data.assetDeliveries),
  } as PublishedManifest;
}

export async function transitionPublishedWorld(
  apiUrl: string,
  input: {
    readonly exitId: string;
    readonly expectedGameStateVersion: number;
    readonly expectedMapVersionId: string;
  },
  signal?: AbortSignal,
): Promise<WorldTransition> {
  const value = await requestPlayerApi(apiUrl, '/world/transition', {
    method: 'POST',
    body: input,
    ...(signal === undefined ? {} : { signal }),
  });
  const result = transitionWorldSchema.safeParse(value);
  if (!result.success) throw new PlayerRequestError(502, 'INVALID_WORLD_RESPONSE');
  return {
    ...result.data,
    manifest: validatedManifest(result.data.manifest, result.data.assetDeliveries),
  } as WorldTransition;
}
