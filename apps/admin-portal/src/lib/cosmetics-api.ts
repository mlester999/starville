import 'server-only';

import { cosmeticShopStateSchema } from '@starville/cosmetics';
import { z } from 'zod';

import { callTrustedAdminApi } from './admin-api';

const dateTimeSchema = z.iso.datetime({ offset: true });

export const cosmeticsOverviewSchema = z
  .object({
    status: z.literal('loaded'),
    overview: z
      .object({
        ownedEntitlements: z.number().int().nonnegative(),
        revokedEntitlements: z.number().int().nonnegative(),
        savedLoadouts: z.number().int().nonnegative(),
        activeEmotes: z.number().int().nonnegative(),
        activeCollections: z.number().int().nonnegative(),
        shop: cosmeticShopStateSchema,
      })
      .strict(),
  })
  .strict();

export const cosmeticsSettingsSchema = z
  .object({
    status: z.literal('loaded'),
    settings: z
      .object({
        wardrobeEnabled: z.boolean(),
        emotesEnabled: z.boolean(),
        collectionsEnabled: z.boolean(),
        maintenanceMode: z.boolean(),
        maximumLoadouts: z.literal(5),
        maximumEmoteWheelSlots: z.number().int().min(1).max(8),
        emoteRateLimit: z.number().int().min(1).max(30),
        revision: z.number().int().positive(),
        shop: cosmeticShopStateSchema,
      })
      .strict(),
  })
  .strict();

export const cosmeticsAuditSchema = z
  .object({
    status: z.literal('loaded'),
    page: z.number().int().positive(),
    pageSize: z.union([z.literal(20), z.literal(50), z.literal(100)]),
    total: z.number().int().nonnegative(),
    items: z
      .array(
        z
          .object({
            receiptId: z.uuid(),
            playerProfileId: z.uuid(),
            definitionId: z.uuid(),
            cosmeticKey: z.string().min(3).max(80),
            operation: z.enum(['grant', 'revoke', 'reward']),
            source: z.string().min(3).max(80),
            reasonCategory: z.string().min(3).max(80),
            reason: z.string().min(12).max(500),
            administratorUserId: z.uuid().nullable(),
            createdAt: dateTimeSchema,
          })
          .strict(),
      )
      .max(100),
  })
  .strict();

export function loadCosmeticsOverview() {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: '/api/v1/admin/cosmetics/overview',
    parser: (value) => cosmeticsOverviewSchema.parse(value),
  });
}

export function loadCosmeticsSettings() {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: '/api/v1/admin/cosmetics/settings',
    parser: (value) => cosmeticsSettingsSchema.parse(value),
  });
}

export function loadCosmeticsShop() {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: '/api/v1/admin/cosmetics/shop',
    parser: (value) =>
      z
        .object({ status: z.literal('loaded'), shop: cosmeticShopStateSchema })
        .strict()
        .parse(value),
  });
}

export function loadCosmeticsAudit(page = 1) {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/cosmetics/audit?page=${String(page)}&pageSize=50`,
    parser: (value) => cosmeticsAuditSchema.parse(value),
  });
}
