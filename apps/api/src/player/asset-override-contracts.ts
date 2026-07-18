import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import {
  GAMEPLAY_ASSET_OVERRIDE_MAX_KEYS,
  assetCollisionProfileSchema,
  assetIdentifierSchema,
  assetRotationSchema,
  assetUuidSchema,
  type GameplayAssetOverride,
} from '@starville/asset-management';

import type { ServiceLogger } from '../contracts.js';

export const gameplayAssetOverrideRequestSchema = z
  .object({
    assetKeys: z
      .array(assetIdentifierSchema)
      .min(1)
      .max(GAMEPLAY_ASSET_OVERRIDE_MAX_KEYS)
      .refine((keys) => new Set(keys).size === keys.length, 'Asset keys must be unique'),
  })
  .strict();

export const persistedGameplayAssetOverrideSchema = z
  .object({
    assetKey: assetIdentifierSchema,
    versionId: assetUuidSchema,
    versionNumber: z.number().int().positive(),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    bundledManifestVersion: z.null(),
    deliverySourcePath: z.string().trim().min(1).max(320),
    mediaType: z.literal('image/webp'),
    width: z.number().int().positive().max(8192),
    height: z.number().int().positive().max(8192),
    renderWidth: z.coerce.number().positive().max(4096),
    renderHeight: z.coerce.number().positive().max(4096),
    scale: z.coerce.number().min(0.05).max(8),
    anchor: z.object({ x: z.coerce.number(), y: z.coerce.number() }).strict(),
    footAnchor: z.object({ x: z.coerce.number(), y: z.coerce.number() }).strict(),
    depthAnchor: z.object({ x: z.coerce.number(), y: z.coerce.number() }).strict(),
    collision: assetCollisionProfileSchema,
    supportedRotations: z.array(assetRotationSchema).min(1).max(4),
    defaultRotation: assetRotationSchema,
    replacementAllowed: z.literal(true),
  })
  .strict();
export type PersistedGameplayAssetOverride = z.infer<typeof persistedGameplayAssetOverrideSchema>;

export const persistedGameplayAssetOverrideResultSchema = z
  .object({
    status: z.literal('loaded'),
    requestedKeyCount: z.number().int().min(1).max(GAMEPLAY_ASSET_OVERRIDE_MAX_KEYS),
    overrideCount: z.number().int().min(0).max(GAMEPLAY_ASSET_OVERRIDE_MAX_KEYS),
    items: z.array(persistedGameplayAssetOverrideSchema).max(GAMEPLAY_ASSET_OVERRIDE_MAX_KEYS),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.overrideCount !== value.items.length) {
      context.addIssue({ code: 'custom', message: 'Override count differs from the item set' });
    }
    const keys = value.items.map(({ assetKey }) => assetKey);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({ code: 'custom', message: 'Override keys must be unique' });
    }
  });

export type GameplayAssetOverrideFailure =
  'not_found' | 'suspended' | 'rename_required' | 'rate_limited';

export interface GameplayAssetOverrideGateway {
  loadActive(
    walletAddress: string,
    assetKeys: readonly string[],
    requestId: string,
    rateLimit: number,
  ): Promise<
    z.infer<typeof persistedGameplayAssetOverrideResultSchema> | GameplayAssetOverrideFailure
  >;
}

export interface GameplayAssetOverrideService {
  load(
    walletAddress: string,
    input: unknown,
    requestId: string,
  ): Promise<
    Readonly<{
      status: 'loaded';
      requestedKeyCount: number;
      items: readonly GameplayAssetOverride[];
    }>
  >;
}

export interface CreateGameplayAssetOverrideServiceOptions {
  readonly gateway: GameplayAssetOverrideGateway;
  readonly logger: ServiceLogger;
  readonly publicAssetUrl: (path: string) => string;
  readonly readRateLimit?: number;
}

export type SupabaseGameplayAssetOverrideClient = Pick<SupabaseClient, 'rpc'>;
