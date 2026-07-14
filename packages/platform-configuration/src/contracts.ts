import { z } from 'zod';

import {
  PLATFORM_FONT_REGISTRY,
  PLATFORM_ICON_KEYS,
  PLATFORM_MODULE_REGISTRY,
  PLATFORM_ROUTE_REGISTRY,
} from './registries';

const safeText = (minimum: number, maximum: number) =>
  z
    .string()
    .trim()
    .min(minimum)
    .max(maximum)
    .refine((value) => !/[<>\p{Cc}]/u.test(value), 'Text contains unsupported markup or controls');
const nullableSafeText = (maximum: number) => safeText(1, maximum).nullable();
const safeEmail = z.email().max(254).nullable();
const internalPath = z
  .string()
  .max(300)
  .regex(/^\/(?!\/)[a-z0-9/_?&=.#%-]*$/iu);
const externalUrl = z
  .url()
  .max(500)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        url.hostname.length > 0 &&
        url.username.length === 0 &&
        url.password.length === 0
      );
    } catch {
      return false;
    }
  }, 'Only HTTPS links are supported');
export const platformLinkSchema = z.union([internalPath, externalUrl]);
const nullableLink = platformLinkSchema.nullable();
const nullableExternalLink = externalUrl.nullable();
const uuidOrNull = z.uuid().nullable();
const color = z.string().regex(/^#[0-9a-f]{6}$/iu);

export const platformBrandingSchema = z
  .object({
    fullGameName: safeText(2, 80),
    shortGameName: safeText(2, 32),
    administrationName: safeText(2, 80),
    tagline: safeText(2, 140),
    shortDescription: safeText(2, 320),
    supportEmail: safeEmail,
    copyrightText: safeText(2, 160),
    primaryWebsiteUrl: nullableLink,
    documentationUrl: nullableLink,
    discordUrl: nullableExternalLink,
    xUrl: nullableExternalLink,
    communityUrl: nullableExternalLink,
    legalUrl: nullableLink,
    privacyUrl: nullableLink,
    termsUrl: nullableLink,
  })
  .strict();

export const platformBrandingAssetsSchema = z
  .object({
    brand_logo: uuidOrNull,
    brand_mark: uuidOrNull,
    favicon: uuidOrNull,
    admin_login_background: uuidOrNull,
    landing_hero_background: uuidOrNull,
    social_share_image: uuidOrNull,
  })
  .strict();

export const platformThemeSchema = z
  .object({
    preset: z.enum(['starville_twilight', 'cozy_light', 'custom']),
    tokens: z
      .object({
        background: color,
        surface: color,
        elevatedSurface: color,
        textPrimary: color,
        textSecondary: color,
        primaryAction: color,
        primaryActionText: color,
        secondaryAction: color,
        border: color,
        success: color,
        warning: color,
        danger: color,
        information: color,
        focusRing: color,
        navigationBackground: color,
        navigationActive: color,
        loginPageOverlay: color,
        landingHeroOverlay: color,
      })
      .strict(),
  })
  .strict();

const fontKey = z.enum(
  Object.keys(PLATFORM_FONT_REGISTRY) as [keyof typeof PLATFORM_FONT_REGISTRY],
);
export const platformTypographySchema = z
  .object({ display: fontKey, heading: fontKey, body: fontKey, monospace: fontKey })
  .strict();

export const platformAdminLoginSchema = z
  .object({
    eyebrow: safeText(2, 60),
    title: safeText(2, 100),
    subtitle: safeText(2, 180),
    supportingDescription: safeText(2, 500),
    backgroundFocalPointX: z.number().min(0).max(100),
    backgroundFocalPointY: z.number().min(0).max(100),
    overlayStrength: z.number().min(0.2).max(0.9),
    supportLink: nullableLink,
    documentationLink: nullableLink,
    securityNotice: safeText(2, 240),
    footerCopy: safeText(2, 240),
  })
  .strict();

export const LANDING_SECTION_KINDS = [
  'announcement',
  'hero',
  'features',
  'how_to_play',
  'world_preview',
  'game_systems',
  'wallet_access',
  'documentation_cta',
  'community_cta',
  'token_contract',
  'footer',
] as const;

const landingItem = z.object({ heading: safeText(1, 80), description: safeText(1, 240) }).strict();
export const platformLandingSectionSchema = z
  .object({
    key: z.enum(LANDING_SECTION_KINDS),
    enabled: z.boolean(),
    order: z.number().int().min(0).max(100),
    heading: nullableSafeText(120),
    description: nullableSafeText(500),
    ctaLabel: nullableSafeText(40),
    ctaDestination: nullableLink,
    assetVersionId: uuidOrNull,
    items: z.array(landingItem).max(8),
  })
  .strict()
  .refine((section) => (section.ctaLabel === null) === (section.ctaDestination === null), {
    message: 'CTA label and destination must be configured together',
  });

const routeKey = z.enum(
  Object.keys(PLATFORM_ROUTE_REGISTRY) as [keyof typeof PLATFORM_ROUTE_REGISTRY],
);
const moduleKey = z.enum(
  Object.keys(PLATFORM_MODULE_REGISTRY) as [keyof typeof PLATFORM_MODULE_REGISTRY],
);
export const platformNavigationItemSchema = z
  .object({
    routeKey,
    moduleKey,
    label: safeText(1, 40),
    icon: z.enum(PLATFORM_ICON_KEYS),
    order: z.number().int().min(0).max(100),
    group: safeText(1, 40),
    badgeLabel: nullableSafeText(20),
  })
  .strict();

export const platformModuleSettingSchema = z
  .object({ key: moduleKey, enabled: z.boolean(), label: safeText(1, 60) })
  .strict();

export const platformConfigurationSchema = z
  .object({
    schemaVersion: z.literal(1),
    branding: platformBrandingSchema,
    brandingAssets: platformBrandingAssetsSchema,
    theme: platformThemeSchema,
    typography: platformTypographySchema,
    adminLogin: platformAdminLoginSchema,
    landing: z.object({ sections: z.array(platformLandingSectionSchema).min(2).max(20) }).strict(),
    navigation: z
      .object({
        collapsedByDefault: z.boolean(),
        items: z.array(platformNavigationItemSchema).max(32),
      })
      .strict(),
    modules: z.array(platformModuleSettingSchema).min(5).max(32),
  })
  .strict();

export type PlatformConfiguration = z.infer<typeof platformConfigurationSchema>;
export type PlatformLandingSection = z.infer<typeof platformLandingSectionSchema>;

const runtimeAssetUrl = z
  .url()
  .max(1000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
      );
    } catch {
      return false;
    }
  }, 'Asset delivery must use HTTPS outside local development');

export const platformAssetUrlsSchema = z
  .object({
    branding: z
      .object({
        brand_logo: runtimeAssetUrl.nullable(),
        brand_mark: runtimeAssetUrl.nullable(),
        favicon: runtimeAssetUrl.nullable(),
        admin_login_background: runtimeAssetUrl.nullable(),
        landing_hero_background: runtimeAssetUrl.nullable(),
        social_share_image: runtimeAssetUrl.nullable(),
      })
      .strict(),
    landing: z.partialRecord(z.enum(LANDING_SECTION_KINDS), runtimeAssetUrl),
  })
  .strict();
export type PlatformAssetUrls = z.infer<typeof platformAssetUrlsSchema>;

export const EMPTY_PLATFORM_ASSET_URLS: PlatformAssetUrls = {
  branding: {
    brand_logo: null,
    brand_mark: null,
    favicon: null,
    admin_login_background: null,
    landing_hero_background: null,
    social_share_image: null,
  },
  landing: {},
};

export const CONFIGURATION_LIFECYCLE_STATUSES = [
  'draft',
  'validated',
  'in_review',
  'published',
  'superseded',
  'rolled_back',
] as const;
export const configurationLifecycleStatusSchema = z.enum(CONFIGURATION_LIFECYCLE_STATUSES);
export type ConfigurationLifecycleStatus = z.infer<typeof configurationLifecycleStatusSchema>;

export const validationFindingSchema = z
  .object({
    level: z.enum(['blocking_error', 'warning', 'recommendation', 'passed']),
    code: z
      .string()
      .regex(/^[A-Z0-9_]+$/u)
      .max(80),
    path: z.string().max(180),
    message: safeText(1, 300),
  })
  .strict();
export type ValidationFinding = z.infer<typeof validationFindingSchema>;

export const validationResultSchema = z
  .object({ valid: z.boolean(), findings: z.array(validationFindingSchema).max(200) })
  .strict();
export type ValidationResult = z.infer<typeof validationResultSchema>;

export const platformVersionSchema = z
  .object({
    id: z.uuid(),
    platformKey: z.string().min(2).max(48),
    versionNumber: z.number().int().positive(),
    lifecycleStatus: configurationLifecycleStatusSchema,
    configuration: platformConfigurationSchema,
    assetUrls: platformAssetUrlsSchema,
    validationResults: validationResultSchema.nullable(),
    revision: z.number().int().positive(),
    createdAt: z.iso.datetime({ offset: true }),
    reviewedAt: z.iso.datetime({ offset: true }).nullable(),
    publishedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export type PlatformVersion = z.infer<typeof platformVersionSchema>;

export const activePlatformConfigurationSchema = z
  .object({
    platformKey: z.string().min(2).max(48),
    versionId: z.uuid().nullable(),
    versionNumber: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    configuration: platformConfigurationSchema,
    assetUrls: platformAssetUrlsSchema,
    fallback: z.boolean(),
    etag: z.string().min(1).max(120),
  })
  .strict();
export type ActivePlatformConfiguration = z.infer<typeof activePlatformConfigurationSchema>;

export const platformMutationResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('version_conflict') }).strict(),
  z.object({ status: z.literal('rate_limited') }).strict(),
  z.object({ status: z.literal('idempotent'), version: platformVersionSchema }).strict(),
  z
    .object({
      status: z.enum([
        'created',
        'updated',
        'validated',
        'submitted',
        'reviewed',
        'published',
        'rolled_back',
      ]),
      version: platformVersionSchema,
    })
    .strict(),
]);
export type PlatformMutationResult = z.infer<typeof platformMutationResultSchema>;

export const platformAuditEventSchema = z
  .object({
    id: z.uuid(),
    versionId: z.uuid().nullable(),
    action: z.string().min(3).max(80),
    permissionKey: z.string().startsWith('platform_configuration.').max(100),
    administratorId: z.uuid().nullable(),
    requestId: z.string().min(1).max(128),
    reason: safeText(3, 500),
    beforeState: z.record(z.string(), z.unknown()),
    afterState: z.record(z.string(), z.unknown()),
    result: z.enum(['succeeded', 'failed', 'idempotent']),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type PlatformAuditEvent = z.infer<typeof platformAuditEventSchema>;

export const adminPlatformConfigurationSchema = z
  .object({
    active: activePlatformConfigurationSchema,
    draft: platformVersionSchema.nullable(),
    versions: z.array(platformVersionSchema).max(50),
    audit: z.array(platformAuditEventSchema).max(100),
  })
  .strict();
export type AdminPlatformConfiguration = z.infer<typeof adminPlatformConfigurationSchema>;

export const platformReasonSchema = safeText(3, 500);
export const createPlatformDraftSchema = z
  .object({ platformKey: z.string().min(2).max(48), reason: platformReasonSchema })
  .strict();
export const updatePlatformDraftSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    configuration: platformConfigurationSchema,
    reason: platformReasonSchema,
  })
  .strict();
export const platformVersionActionSchema = z
  .object({ expectedRevision: z.number().int().positive(), reason: platformReasonSchema })
  .strict();
export const publishPlatformVersionSchema = platformVersionActionSchema
  .extend({ expectedActiveRevision: z.number().int().positive() })
  .strict();
export const rollbackPlatformVersionSchema = z
  .object({ expectedActiveRevision: z.number().int().positive(), reason: platformReasonSchema })
  .strict();
