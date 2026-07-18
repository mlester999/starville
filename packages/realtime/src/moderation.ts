import { z } from 'zod';

import { chatMessageSchema, chatReportCategorySchema } from './chat';

export const chatReportStatusSchema = z.enum(['open', 'under_review', 'actioned', 'dismissed']);
export type ChatReportStatus = z.infer<typeof chatReportStatusSchema>;

export const adminChatReportSummarySchema = z
  .object({
    id: z.uuid(),
    messageId: z.uuid(),
    status: chatReportStatusSchema,
    category: chatReportCategorySchema,
    reportedPresenceId: z.uuid(),
    reportedDisplayName: z.string().min(3).max(20),
    reporterPresenceId: z.uuid(),
    reporterDisplayName: z.string().min(3).max(20),
    worldId: z.string().min(1).max(64),
    channelId: z.uuid(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    revision: z.number().int().positive(),
  })
  .strict();
export type AdminChatReportSummary = z.infer<typeof adminChatReportSummarySchema>;

export const adminChatReportListSchema = z
  .object({
    items: z.array(adminChatReportSummarySchema).max(100),
    page: z.number().int().positive(),
    pageSize: z.union([z.literal(10), z.literal(50), z.literal(100)]),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    openCount: z.number().int().nonnegative(),
  })
  .strict();
export type AdminChatReportList = z.infer<typeof adminChatReportListSchema>;

export const adminChatModerationEntrySchema = z
  .object({
    id: z.uuid(),
    action: z.enum(['under_review', 'dismiss', 'warn', 'chat_mute', 'chat_unmute', 'escalate']),
    reason: z.string().min(12).max(500),
    createdAt: z.iso.datetime({ offset: true }),
    muteExpiresAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

export const adminChatReportDetailSchema = z
  .object({
    report: adminChatReportSummarySchema.extend({
      reason: z.string().min(3).max(500),
      evidence: chatMessageSchema,
    }),
    moderationHistory: z.array(adminChatModerationEntrySchema).max(100),
    relatedReports: z.array(adminChatReportSummarySchema).max(20),
    activeMuteUntil: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export type AdminChatReportDetail = z.infer<typeof adminChatReportDetailSchema>;

export const adminChatReportActionSchema = z
  .object({
    action: z.enum(['under_review', 'dismiss', 'warn', 'chat_mute', 'chat_unmute', 'escalate']),
    reason: z.string().trim().min(12).max(500),
    expectedRevision: z.number().int().positive(),
    requestId: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/u),
    muteDurationMinutes: z
      .union([z.literal(15), z.literal(60), z.literal(1440), z.literal(10080)])
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.action === 'chat_mute' && value.muteDurationMinutes === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['muteDurationMinutes'],
        message: 'Mute duration is required.',
      });
    }
    if (value.action !== 'chat_mute' && value.muteDurationMinutes !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['muteDurationMinutes'],
        message: 'Mute duration is not accepted.',
      });
    }
  });
export type AdminChatReportAction = z.infer<typeof adminChatReportActionSchema>;
