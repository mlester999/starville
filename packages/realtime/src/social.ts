import { z } from 'zod';

import { itemCategorySchema } from '@starville/cozy-gameplay';
import { appearancePresetSchema } from '@starville/game-core';

export const SOCIAL_INTERACTION_DISTANCE = 3 as const;
export const SOCIAL_MAX_OFFER_ROWS = 8 as const;
export const SOCIAL_MAX_TOTAL_QUANTITY = 999 as const;

const uuidSchema = z.uuid();
const timestampSchema = z.iso.datetime({ offset: true });
const requestIdSchema = z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/u);
const itemSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
  .max(80);

export const socialInteractionStatusSchema = z.enum([
  'pending',
  'negotiating',
  'completed',
  'declined',
  'cancelled',
  'expired',
  'invalidated',
  'failed',
]);
export type SocialInteractionStatus = z.infer<typeof socialInteractionStatusSchema>;

export const socialParticipantSchema = z
  .object({
    presenceId: uuidSchema,
    displayName: z.string().trim().min(3).max(20),
  })
  .strict();
export type SocialParticipant = z.infer<typeof socialParticipantSchema>;

export const publicPlayerInspectSchema = z
  .object({
    presenceId: uuidSchema,
    displayName: z.string().trim().min(3).max(20),
    level: z.number().int().min(1).max(999),
    appearancePreset: appearancePresetSchema,
    worldId: z.string().min(1).max(80),
    worldName: z.string().trim().min(1).max(120),
    channelNumber: z.number().int().min(1).max(99),
  })
  .strict();
export type PublicPlayerInspect = z.infer<typeof publicPlayerInspectSchema>;

export const socialTransferItemSchema = z
  .object({
    itemSlug: itemSlugSchema,
    name: z.string().trim().min(1).max(80),
    category: itemCategorySchema,
    assetRef: z.string().min(1).max(80).nullable(),
    availableQuantity: z.number().int().min(0).max(199_800),
    reservedQuantity: z.number().int().min(0).max(199_800),
    minimumTransferQuantity: z.number().int().min(1).max(999),
    maximumTransferQuantity: z.number().int().min(1).max(999),
    giftable: z.boolean(),
    tradable: z.boolean(),
  })
  .strict()
  .refine((item) => item.reservedQuantity <= item.availableQuantity, {
    path: ['reservedQuantity'],
    message: 'Reserved quantity cannot exceed owned quantity',
  });
export type SocialTransferItem = z.infer<typeof socialTransferItemSchema>;

export const socialOfferItemInputSchema = z
  .object({ itemSlug: itemSlugSchema, quantity: z.number().int().min(1).max(999) })
  .strict();
export type SocialOfferItemInput = z.infer<typeof socialOfferItemInputSchema>;

export const socialOfferItemInputListSchema = z
  .array(socialOfferItemInputSchema)
  .max(SOCIAL_MAX_OFFER_ROWS)
  .superRefine((items, context) => {
    const slugs = items.map((item) => item.itemSlug);
    if (new Set(slugs).size !== slugs.length) {
      context.addIssue({ code: 'custom', message: 'Offer items must be unique' });
    }
    if (items.reduce((total, item) => total + item.quantity, 0) > SOCIAL_MAX_TOTAL_QUANTITY) {
      context.addIssue({ code: 'custom', message: 'Offer quantity is too large' });
    }
  });

export const socialOfferItemSchema = socialOfferItemInputSchema
  .extend({
    name: z.string().trim().min(1).max(80),
    category: itemCategorySchema,
    assetRef: z.string().min(1).max(80).nullable(),
  })
  .strict();
export type SocialOfferItem = z.infer<typeof socialOfferItemSchema>;

export const socialGiftViewSchema = z
  .object({
    id: uuidSchema,
    kind: z.literal('gift'),
    status: socialInteractionStatusSchema,
    sender: socialParticipantSchema,
    target: socialParticipantSchema,
    item: socialOfferItemSchema,
    createdAt: timestampSchema,
    expiresAt: timestampSchema,
  })
  .strict();
export type SocialGiftView = z.infer<typeof socialGiftViewSchema>;

export const socialTradeOfferSchema = z
  .object({
    participant: socialParticipantSchema,
    items: z.array(socialOfferItemSchema).max(SOCIAL_MAX_OFFER_ROWS),
    confirmedRevision: z.number().int().positive().nullable(),
  })
  .strict()
  .superRefine((offer, context) => {
    const slugs = offer.items.map((item) => item.itemSlug);
    if (new Set(slugs).size !== slugs.length) {
      context.addIssue({ code: 'custom', path: ['items'], message: 'Offer items must be unique' });
    }
    if (offer.items.reduce((total, item) => total + item.quantity, 0) > SOCIAL_MAX_TOTAL_QUANTITY) {
      context.addIssue({ code: 'custom', path: ['items'], message: 'Offer quantity is too large' });
    }
  });
export type SocialTradeOffer = z.infer<typeof socialTradeOfferSchema>;

export const socialTradeViewSchema = z
  .object({
    id: uuidSchema,
    kind: z.literal('trade'),
    status: socialInteractionStatusSchema,
    revision: z.number().int().positive(),
    senderOffer: socialTradeOfferSchema,
    targetOffer: socialTradeOfferSchema,
    createdAt: timestampSchema,
    expiresAt: timestampSchema,
    reconnectDeadline: timestampSchema.nullable(),
  })
  .strict();
export type SocialTradeView = z.infer<typeof socialTradeViewSchema>;

export const socialInteractionViewSchema = z.discriminatedUnion('kind', [
  socialGiftViewSchema,
  socialTradeViewSchema,
]);
export type SocialInteractionView = z.infer<typeof socialInteractionViewSchema>;
export const socialInteractionListSchema = z.array(socialInteractionViewSchema).max(20);
export const socialInteractionCollectionSchema = z
  .object({ interactions: socialInteractionListSchema })
  .strict();

export const socialInspectResultSchema = z
  .object({ status: z.string().min(1).max(64), profile: publicPlayerInspectSchema.optional() })
  .strict()
  .transform((value) => ({ status: value.status, profile: value.profile }));

export const socialReceiptSchema = z
  .object({
    id: uuidSchema,
    interactionId: uuidSchema,
    kind: z.enum(['gift', 'trade']),
    status: z.literal('completed'),
    participants: z.array(socialParticipantSchema).length(2),
    items: z
      .array(
        socialOfferItemSchema.extend({
          fromPresenceId: uuidSchema,
          toPresenceId: uuidSchema,
        }),
      )
      .max(SOCIAL_MAX_OFFER_ROWS * 2),
    completedAt: timestampSchema,
  })
  .strict();
export type SocialReceipt = z.infer<typeof socialReceiptSchema>;

export const socialBootstrapSchema = z
  .object({
    inventory: z.array(socialTransferItemSchema).max(200),
    pendingRequests: z.array(socialInteractionViewSchema).max(20),
    activeTrade: socialTradeViewSchema.nullable(),
    recentReceipts: z.array(socialReceiptSchema).max(10),
    interactionDistance: z.number().positive().max(12),
    dustTransferEnabled: z.literal(false),
  })
  .strict();
export type SocialBootstrap = z.infer<typeof socialBootstrapSchema>;

export const socialInteractionErrorCodeSchema = z.enum([
  'player_unavailable',
  'too_far_away',
  'blocked',
  'request_expired',
  'request_changed',
  'item_unavailable',
  'item_restricted',
  'inventory_full',
  'trade_changed',
  'trade_paused',
  'interaction_active',
  'rate_limited',
  'access_changed',
  'maintenance',
  'settlement_failed',
  'persistence_unavailable',
]);
export type SocialInteractionErrorCode = z.infer<typeof socialInteractionErrorCodeSchema>;

export const socialRequestIdSchema = requestIdSchema;
export const socialItemSlugSchema = itemSlugSchema;

export const adminSocialInteractionSummarySchema = z
  .object({
    id: uuidSchema,
    kind: z.enum(['gift', 'trade']),
    status: socialInteractionStatusSchema,
    sender: socialParticipantSchema,
    target: socialParticipantSchema,
    revision: z.number().int().positive(),
    createdAt: timestampSchema,
    expiresAt: timestampSchema,
    completedAt: timestampSchema.nullable(),
    failureCode: z.string().min(1).max(80).nullable(),
  })
  .strict();
export type AdminSocialInteractionSummary = z.infer<typeof adminSocialInteractionSummarySchema>;

export const adminSocialInteractionListSchema = z
  .object({
    items: z.array(adminSocialInteractionSummarySchema).max(100),
    page: z.number().int().positive(),
    pageSize: z.union([z.literal(10), z.literal(50), z.literal(100)]),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();
export type AdminSocialInteractionList = z.infer<typeof adminSocialInteractionListSchema>;

export const adminSocialInteractionAuditEntrySchema = z
  .object({
    id: uuidSchema,
    action: z.string().min(1).max(80),
    revision: z.number().int().positive(),
    result: z.string().min(1).max(80),
    createdAt: timestampSchema,
  })
  .strict();

export const adminSocialInteractionDetailSchema = z
  .object({
    interaction: socialInteractionViewSchema,
    receipt: socialReceiptSchema.nullable(),
    audit: z.array(adminSocialInteractionAuditEntrySchema).max(100),
  })
  .strict();
export type AdminSocialInteractionDetail = z.infer<typeof adminSocialInteractionDetailSchema>;

export function socialDistance(
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number },
): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}
