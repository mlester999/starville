import { z } from 'zod';

export const MAINTENANCE_FALLBACK_TITLE = 'SERVER PAUSED';
export const MAINTENANCE_FALLBACK_MESSAGE =
  'Starville is temporarily unavailable for maintenance.\nPlease check back soon.';

export const maintenanceStateSchema = z.enum([
  'disabled',
  'scheduled',
  'active',
  'expired',
  'completed',
  'configuration_error',
]);
export const announcementSeveritySchema = z.enum(['information', 'success', 'warning', 'critical']);
export const announcementPresentationSchema = z.enum(['ticker', 'banner']);
export const announcementStatusSchema = z.enum([
  'draft',
  'scheduled',
  'active',
  'expired',
  'deactivated',
  'archived',
]);

const timestamp = z.iso.datetime({ offset: true });
const optionalTimestamp = timestamp.nullable();
const safeText = (minimum: number, maximum: number) =>
  z
    .string()
    .trim()
    .min(minimum)
    .max(maximum)
    .refine((value) =>
      [...value].every((character) => {
        const code = character.charCodeAt(0);
        return (
          character !== '<' &&
          character !== '>' &&
          (code === 10 || (code >= 32 && (code < 127 || code > 159)))
        );
      }),
    );
export const safeCtaUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((value) => {
    if (/^\/(?!\/)/u.test(value)) return true;
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'CTA URL must be HTTPS or an internal absolute path');

export const publicAnnouncementSchema = z
  .object({
    id: z.uuid(),
    revision: z.number().int().positive(),
    message: safeText(1, 500),
    severity: announcementSeveritySchema,
    presentation: announcementPresentationSchema,
    priority: z.number().int().min(0).max(1000),
    dismissible: z.boolean(),
    ctaLabel: safeText(1, 40).nullable(),
    ctaUrl: safeCtaUrlSchema.nullable(),
    startsAt: timestamp,
    endsAt: optionalTimestamp,
  })
  .strict();

export const publicMaintenanceSchema = z
  .object({
    state: maintenanceStateSchema,
    active: z.boolean(),
    revision: z.number().int().nonnegative(),
    title: safeText(1, 80),
    message: safeText(1, 1000),
    updateDetails: z.array(safeText(1, 160)).max(10),
    expectedEndAt: optionalTimestamp,
    expectedReturnMessage: safeText(1, 240).nullable(),
    showReturnToLanding: z.boolean(),
    ctaLabel: safeText(1, 40).nullable(),
    ctaUrl: safeCtaUrlSchema.nullable(),
    updatedAt: timestamp,
  })
  .strict();

export const publicLiveOperationsSchema = z
  .object({
    maintenance: publicMaintenanceSchema,
    announcements: z.array(publicAnnouncementSchema).max(10),
    generatedAt: timestamp,
  })
  .strict();

export const adminMaintenanceSchema = publicMaintenanceSchema
  .extend({
    enabled: z.boolean(),
    scheduledStartAt: optionalTimestamp,
    autoDisableAtEnd: z.boolean(),
    internalReason: safeText(12, 500),
    updatedByAdminId: z.uuid().nullable(),
  })
  .strict();

export const adminAnnouncementSchema = publicAnnouncementSchema
  .omit({ startsAt: true })
  .extend({
    internalTitle: safeText(1, 100),
    lifecycleStatus: z.enum(['draft', 'published', 'deactivated', 'archived']),
    effectiveStatus: announcementStatusSchema,
    startsAt: optionalTimestamp,
    internalReason: safeText(12, 500),
    createdByAdminId: z.uuid(),
    updatedByAdminId: z.uuid(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

export const liveOperationsAuditSchema = z
  .object({
    id: z.uuid(),
    event: z
      .string()
      .regex(/^live_operations\.[a-z_.]+$/u)
      .max(100),
    targetType: z.enum(['maintenance', 'announcement']),
    targetId: z.uuid().nullable(),
    actorAdminUserId: z.uuid(),
    requestId: z.string().max(128),
    reason: safeText(12, 500),
    beforeState: z.record(z.string(), z.unknown()),
    afterState: z.record(z.string(), z.unknown()),
    createdAt: timestamp,
  })
  .strict();

export const adminLiveOperationsSchema = z
  .object({
    maintenance: adminMaintenanceSchema,
    announcements: z.array(adminAnnouncementSchema).max(100),
    announcementPage: z.number().int().positive(),
    announcementPageSize: z.number().int().min(1).max(100),
    announcementTotal: z.number().int().nonnegative(),
    announcementTotalPages: z.number().int().nonnegative(),
    audit: z.array(liveOperationsAuditSchema).max(100),
    auditPage: z.number().int().positive(),
    auditPageSize: z.number().int().min(1).max(100),
    auditTotal: z.number().int().nonnegative(),
    auditTotalPages: z.number().int().nonnegative(),
  })
  .strict();

export const maintenanceMutationSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    enabled: z.boolean(),
    scheduledStartAt: optionalTimestamp,
    expectedEndAt: optionalTimestamp,
    autoDisableAtEnd: z.boolean(),
    title: safeText(1, 80),
    message: safeText(1, 1000),
    updateDetails: z.array(safeText(1, 160)).max(10),
    expectedReturnMessage: safeText(1, 240).nullable(),
    showReturnToLanding: z.boolean(),
    ctaLabel: safeText(1, 40).nullable(),
    ctaUrl: safeCtaUrlSchema.nullable(),
    reason: safeText(12, 500),
    confirmation: z.string().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const immediate =
      value.scheduledStartAt === null || new Date(value.scheduledStartAt).valueOf() <= Date.now();
    if (value.enabled && immediate && value.confirmation !== 'MAINTENANCE') {
      context.addIssue({
        code: 'custom',
        path: ['confirmation'],
        message: 'Confirmation mismatch',
      });
    }
    if (
      value.expectedEndAt !== null &&
      value.scheduledStartAt !== null &&
      value.expectedEndAt <= value.scheduledStartAt
    ) {
      context.addIssue({
        code: 'custom',
        path: ['expectedEndAt'],
        message: 'End must follow start',
      });
    }
    if ((value.ctaLabel === null) !== (value.ctaUrl === null)) {
      context.addIssue({
        code: 'custom',
        path: ['ctaLabel'],
        message: 'CTA label and URL are paired',
      });
    }
  });

export const announcementMutationSchema = z
  .object({
    id: z.uuid().optional(),
    expectedRevision: z.number().int().nonnegative(),
    internalTitle: safeText(1, 100),
    message: safeText(1, 500),
    severity: announcementSeveritySchema,
    presentation: announcementPresentationSchema,
    priority: z.number().int().min(0).max(1000),
    startsAt: optionalTimestamp,
    endsAt: optionalTimestamp,
    dismissible: z.boolean(),
    ctaLabel: safeText(1, 40).nullable(),
    ctaUrl: safeCtaUrlSchema.nullable(),
    reason: safeText(12, 500),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.endsAt !== null && value.startsAt !== null && value.endsAt <= value.startsAt) {
      context.addIssue({ code: 'custom', path: ['endsAt'], message: 'End must follow start' });
    }
    if ((value.ctaLabel === null) !== (value.ctaUrl === null)) {
      context.addIssue({
        code: 'custom',
        path: ['ctaLabel'],
        message: 'CTA label and URL are paired',
      });
    }
  });

export type PublicLiveOperations = z.infer<typeof publicLiveOperationsSchema>;
export type PublicMaintenance = z.infer<typeof publicMaintenanceSchema>;
export type PublicAnnouncement = z.infer<typeof publicAnnouncementSchema>;
export type AdminLiveOperations = z.infer<typeof adminLiveOperationsSchema>;
export type MaintenanceMutation = z.infer<typeof maintenanceMutationSchema>;
export type AnnouncementMutation = z.infer<typeof announcementMutationSchema>;
