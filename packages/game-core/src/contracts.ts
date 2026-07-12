import { z } from 'zod';

export const FACING_DIRECTIONS = [
  'north',
  'northeast',
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
] as const;
export const facingDirectionSchema = z.enum(FACING_DIRECTIONS);
export type FacingDirection = z.infer<typeof facingDirectionSchema>;

export const APPEARANCE_PRESETS = ['moss', 'marigold', 'moonberry', 'river'] as const;
export const appearancePresetSchema = z.enum(APPEARANCE_PRESETS);
export type AppearancePreset = z.infer<typeof appearancePresetSchema>;

export const MAP_IDS = [
  'lantern-square',
  'moonpetal-meadow',
  'brooklight-crossing',
  'hearthfield-road',
  'whisperpine-gate',
] as const;
export const mapIdSchema = z.enum(MAP_IDS);
export type MapId = z.infer<typeof mapIdSchema>;

export const MAP_DIRECTIONS = ['north', 'east', 'south', 'west'] as const;
export const mapDirectionSchema = z.enum(MAP_DIRECTIONS);
export type MapDirection = z.infer<typeof mapDirectionSchema>;

export const displayNameSchema = z
  .string()
  .max(64)
  .transform((value) => value.normalize('NFKC').trim().replace(/\s+/gu, ' '))
  .pipe(
    z
      .string()
      .min(3, 'Display name must contain at least 3 characters')
      .max(20, 'Display name must contain at most 20 characters')
      .regex(
        /^[\p{L}\p{N} _-]+$/u,
        'Display name may contain letters, numbers, spaces, hyphens, and underscores only',
      ),
  );

const finiteCoordinateSchema = z.number().refine(Number.isFinite, 'Coordinate must be finite');

export const playerProfileCreateSchema = z
  .object({
    displayName: displayNameSchema,
    appearancePreset: appearancePresetSchema,
  })
  .strict();
export type PlayerProfileCreate = z.infer<typeof playerProfileCreateSchema>;

export const playerProfileUpdateSchema = playerProfileCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one profile field is required');
export type PlayerProfileUpdate = z.infer<typeof playerProfileUpdateSchema>;

export const playerStateUpdateSchema = z
  .object({
    mapId: mapIdSchema,
    x: finiteCoordinateSchema,
    y: finiteCoordinateSchema,
    facingDirection: facingDirectionSchema,
  })
  .strict();
export type PlayerStateUpdate = z.infer<typeof playerStateUpdateSchema>;

export const playerStateWriteSchema = playerStateUpdateSchema.extend({
  expectedGameStateVersion: z.number().int().positive(),
});
export type PlayerStateWrite = z.infer<typeof playerStateWriteSchema>;

export const persistedPlayerStateSchema = playerStateUpdateSchema.extend({
  gameStateVersion: z.number().int().positive(),
});
export type PersistedPlayerState = z.infer<typeof persistedPlayerStateSchema>;

export const playerProfileSchema = z
  .object({
    id: z.uuid(),
    displayName: displayNameSchema,
    appearancePreset: appearancePresetSchema,
    mapId: mapIdSchema,
    x: finiteCoordinateSchema,
    y: finiteCoordinateSchema,
    facingDirection: facingDirectionSchema,
    gameStateVersion: z.number().int().positive(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    lastEnteredAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type PlayerProfile = z.infer<typeof playerProfileSchema>;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}
