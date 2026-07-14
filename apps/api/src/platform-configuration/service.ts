import {
  BRANDING_ASSET_PROFILES,
  EMPTY_PLATFORM_ASSET_URLS,
  STARVILLE_DEFAULT_CONFIGURATION,
  activePlatformConfigurationSchema,
  adminPlatformConfigurationSchema,
  createPlatformDraftSchema,
  platformMutationResultSchema,
  platformVersionActionSchema,
  platformVersionSchema,
  publishPlatformVersionSchema,
  rollbackPlatformVersionSchema,
  updatePlatformDraftSchema,
  validatePlatformConfiguration,
} from '@starville/platform-configuration';
import { z } from 'zod';

import type { ServiceLogger } from '../contracts.js';
import { PublicApiError } from '../errors.js';
import type { PlatformConfigurationGateway, PlatformConfigurationService } from './contracts.js';

const platformKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u)
  .min(2)
  .max(48);
const versionIdSchema = z.uuid();

function invalidRequest(): never {
  throw new PublicApiError(422, 'INVALID_PLATFORM_CONFIGURATION_REQUEST');
}

function mutation(value: unknown) {
  const parsed = platformMutationResultSchema.parse(value);
  if (parsed.status === 'rate_limited') {
    throw new PublicApiError(429, 'RATE_LIMITED');
  }
  if (parsed.status === 'version_conflict') {
    throw new PublicApiError(409, 'PLATFORM_CONFIGURATION_VERSION_CONFLICT');
  }
  return parsed;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function resolveAssetUrls(
  value: unknown,
  publicAssetUrl: ((path: string) => string) | undefined,
): unknown {
  const source = record(value);
  if (source === undefined) return value;
  const deliveryPaths = record(source['assetDeliveryPaths']);
  const brandingPaths = record(deliveryPaths?.['branding']);
  const landingPaths = record(deliveryPaths?.['landing']);
  const branding = { ...EMPTY_PLATFORM_ASSET_URLS.branding };
  if (publicAssetUrl !== undefined) {
    for (const profile of BRANDING_ASSET_PROFILES) {
      const path = brandingPaths?.[profile];
      if (typeof path === 'string') branding[profile] = publicAssetUrl(path);
    }
  }
  const landing: Record<string, string> = {};
  if (publicAssetUrl !== undefined && landingPaths !== undefined) {
    for (const [key, path] of Object.entries(landingPaths)) {
      if (typeof path === 'string') landing[key] = publicAssetUrl(path);
    }
  }
  const safe = { ...source };
  delete safe['assetDeliveryPaths'];
  return { ...safe, assetUrls: { branding, landing } };
}

function resolveAdminAssetUrls(
  value: unknown,
  publicAssetUrl: ((path: string) => string) | undefined,
): unknown {
  const source = record(value);
  if (source === undefined) return value;
  return {
    ...source,
    active: resolveAssetUrls(source['active'], publicAssetUrl),
    draft: source['draft'] === null ? null : resolveAssetUrls(source['draft'], publicAssetUrl),
    versions: Array.isArray(source['versions'])
      ? source['versions'].map((version) => resolveAssetUrls(version, publicAssetUrl))
      : source['versions'],
  };
}

export function createPlatformConfigurationService(options: {
  readonly gateway: PlatformConfigurationGateway;
  readonly logger: ServiceLogger;
  readonly cacheTtlMs?: number;
  readonly clock?: () => number;
  readonly publicAssetUrl?: (path: string) => string;
}): PlatformConfigurationService {
  const cache = new Map<
    string,
    {
      readonly expiresAt: number;
      readonly value: z.infer<typeof activePlatformConfigurationSchema>;
    }
  >();
  const clock = options.clock ?? Date.now;
  const cacheTtlMs = options.cacheTtlMs ?? 30_000;

  async function active(platformKey: string, requestId: string) {
    const cached = cache.get(platformKey);
    if (cached !== undefined && cached.expiresAt > clock()) return cached.value;
    try {
      const result = activePlatformConfigurationSchema.parse(
        resolveAssetUrls(await options.gateway.getActive(platformKey), options.publicAssetUrl),
      );
      cache.set(platformKey, { expiresAt: clock() + cacheTtlMs, value: result });
      return result;
    } catch (error) {
      options.logger.warn('platform_configuration.runtime.fallback', {
        requestId,
        platformKey,
        error,
      });
      return activePlatformConfigurationSchema.parse({
        platformKey,
        versionId: null,
        versionNumber: 0,
        revision: 0,
        configuration: STARVILLE_DEFAULT_CONFIGURATION,
        assetUrls: EMPTY_PLATFORM_ASSET_URLS,
        fallback: true,
        etag: 'platform-compiled-starville-v1',
      });
    }
  }

  return {
    async getActive(rawPlatformKey, requestId) {
      const platformKey = platformKeySchema.safeParse(rawPlatformKey);
      if (!platformKey.success) invalidRequest();
      return active(platformKey.data, requestId);
    },
    async getAdmin(identity, rawPlatformKey, requestId) {
      const platformKey = platformKeySchema.safeParse(rawPlatformKey);
      if (!platformKey.success) invalidRequest();
      try {
        return adminPlatformConfigurationSchema.parse(
          resolveAdminAssetUrls(
            await options.gateway.getAdmin(identity, platformKey.data),
            options.publicAssetUrl,
          ),
        );
      } catch {
        options.logger.warn('platform_configuration.admin.unavailable', { requestId });
        throw new PublicApiError(503, 'PLATFORM_CONFIGURATION_UNAVAILABLE');
      }
    },
    async preview(identity, rawPlatformKey, rawVersionId, requestId) {
      const platformKey = platformKeySchema.safeParse(rawPlatformKey);
      const versionId = versionIdSchema.safeParse(rawVersionId);
      if (!platformKey.success || !versionId.success) invalidRequest();
      try {
        return platformVersionSchema.parse(
          resolveAssetUrls(
            await options.gateway.preview(identity, platformKey.data, versionId.data),
            options.publicAssetUrl,
          ),
        );
      } catch {
        options.logger.warn('platform_configuration.preview.unavailable', { requestId });
        throw new PublicApiError(503, 'PLATFORM_CONFIGURATION_PREVIEW_UNAVAILABLE');
      }
    },
    async createDraft(identity, value, requestId) {
      const input = createPlatformDraftSchema.safeParse(value);
      if (!input.success) invalidRequest();
      return mutation(
        await options.gateway.createDraft(
          identity,
          input.data.platformKey,
          input.data.reason,
          requestId,
        ),
      );
    },
    async updateDraft(identity, rawVersionId, value, requestId) {
      const versionId = versionIdSchema.safeParse(rawVersionId);
      const input = updatePlatformDraftSchema.safeParse(value);
      if (!versionId.success || !input.success) invalidRequest();
      return mutation(
        await options.gateway.updateDraft(
          identity,
          versionId.data,
          input.data.expectedRevision,
          input.data.configuration,
          input.data.reason,
          requestId,
        ),
      );
    },
    async validate(identity, rawVersionId, value, requestId) {
      const versionId = versionIdSchema.safeParse(rawVersionId);
      const input = platformVersionActionSchema.safeParse(value);
      if (!versionId.success || !input.success) invalidRequest();
      const admin = await this.getAdmin(identity, 'starville', requestId);
      const selected = admin.versions.find(({ id }) => id === versionId.data);
      if (selected === undefined) invalidRequest();
      const validation = validatePlatformConfiguration(selected.configuration);
      return mutation(
        await options.gateway.validate(
          identity,
          versionId.data,
          input.data.expectedRevision,
          validation,
          input.data.reason,
          requestId,
        ),
      );
    },
    async submitReview(identity, rawVersionId, value, requestId) {
      const versionId = versionIdSchema.safeParse(rawVersionId);
      const input = platformVersionActionSchema.safeParse(value);
      if (!versionId.success || !input.success) invalidRequest();
      return mutation(
        await options.gateway.submitReview(
          identity,
          versionId.data,
          input.data.expectedRevision,
          input.data.reason,
          requestId,
        ),
      );
    },
    async review(identity, rawVersionId, value, requestId) {
      const versionId = versionIdSchema.safeParse(rawVersionId);
      const input = platformVersionActionSchema.safeParse(value);
      if (!versionId.success || !input.success) invalidRequest();
      return mutation(
        await options.gateway.review(
          identity,
          versionId.data,
          input.data.expectedRevision,
          input.data.reason,
          requestId,
        ),
      );
    },
    async publish(identity, rawVersionId, value, requestId) {
      const versionId = versionIdSchema.safeParse(rawVersionId);
      const input = publishPlatformVersionSchema.safeParse(value);
      if (!versionId.success || !input.success) invalidRequest();
      const result = mutation(
        await options.gateway.publish(
          identity,
          versionId.data,
          input.data.expectedRevision,
          input.data.expectedActiveRevision,
          input.data.reason,
          requestId,
        ),
      );
      cache.clear();
      return result;
    },
    async rollback(identity, rawVersionId, value, requestId) {
      const versionId = versionIdSchema.safeParse(rawVersionId);
      const input = rollbackPlatformVersionSchema.safeParse(value);
      if (!versionId.success || !input.success) invalidRequest();
      const result = mutation(
        await options.gateway.rollback(
          identity,
          versionId.data,
          input.data.expectedActiveRevision,
          input.data.reason,
          requestId,
        ),
      );
      cache.clear();
      return result;
    },
    invalidate(platformKey) {
      cache.delete(platformKey);
    },
  };
}
