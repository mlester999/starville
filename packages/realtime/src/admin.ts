import { z } from 'zod';

import { mapIdSchema } from '@starville/game-core';

const populationSchema = z
  .object({
    worldId: mapIdSchema,
    worldName: z.string().min(1).max(80),
    channelId: z.uuid(),
    channelNumber: z.number().int().min(1).max(99),
    capacity: z.number().int().min(1).max(200),
    active: z.number().int().nonnegative(),
    stale: z.number().int().nonnegative(),
  })
  .strict();

const disconnectSchema = z
  .object({
    reason: z.string().min(1).max(64),
    count: z.number().int().nonnegative(),
    latestAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const adminRealtimeOverviewSchema = z
  .object({
    generatedAt: z.iso.datetime({ offset: true }),
    activeSessions: z.number().int().nonnegative(),
    staleSessions: z.number().int().nonnegative(),
    reconnectingSessions: z.number().int().nonnegative(),
    maintenanceActive: z.boolean(),
    populations: z.array(populationSchema).max(300),
    recentDisconnects: z.array(disconnectSchema).max(20),
  })
  .strict();
export type AdminRealtimeOverview = z.infer<typeof adminRealtimeOverviewSchema>;
