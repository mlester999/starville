import { createHash, randomBytes } from 'node:crypto';

import { z } from 'zod';
import { ENVIRONMENT_NAMES, type EnvironmentName } from '@starville/shared-types';
import { defaultMapSpawn, mapManifestSchema, validateMapManifest } from '@starville/game-core';
import { WORLD_ASSET_CATALOG } from '@starville/game-content';

import type { ServiceLogger } from '../contracts.js';
import { PublicApiError } from '../errors.js';
import { pinnedAssetMaterialSchema } from './player-gateway.js';
import { projectWorldAssetDeliveries } from './player-service.js';
import type {
  WorldGameTestGateway,
  WorldGameTestProjection,
  WorldGameTestService,
} from './game-test-contracts.js';

const uuidSchema = z.uuid();
const checksumSchema = z.string().regex(/^[0-9a-f]{64}$/u);
const timestampSchema = z.iso.datetime({ offset: true });
const environmentSchema = z.enum(ENVIRONMENT_NAMES);
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);

function hasOnlySafeTextCharacters(value: string): boolean {
  return ![...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 || character === '<' || character === '>';
  });
}

const buildSchema = z.string().trim().min(1).max(120).refine(hasOnlySafeTextCharacters);
const returnPathSchema = z
  .string()
  .min(1)
  .max(500)
  .startsWith('/')
  .refine(
    (value) =>
      !value.startsWith('//') &&
      !value.includes('\\') &&
      !value.includes('://') &&
      hasOnlySafeTextCharacters(value),
  );
const createSchema = z
  .object({
    expectedEditVersion: z.number().int().positive(),
    expectedChecksum: checksumSchema,
    returnPath: returnPathSchema,
    clientRequestId: uuidSchema,
  })
  .strict();
const exchangeSchema = z.object({ grantToken: tokenSchema, gameClientBuild: buildSchema }).strict();
const evidenceResultSchema = z.enum(['passed', 'failed', 'blocked', 'needs_changes']);
const checklistSchema = z
  .record(z.string().regex(/^[a-z][a-z0-9_]{1,62}$/u), z.boolean())
  .refine((value) => Object.keys(value).length >= 1 && Object.keys(value).length <= 20);
const evidenceSchema = z
  .object({
    result: evidenceResultSchema,
    checklist: checklistSchema,
    notes: z.string().trim().min(1).max(2_000).refine(hasOnlySafeTextCharacters),
  })
  .strict();

const issuedSchema = z
  .object({
    status: z.literal('issued'),
    sessionId: uuidSchema,
    worldMapId: uuidSchema,
    worldMapVersionId: uuidSchema,
    environment: environmentSchema,
    expiresAt: timestampSchema,
    returnPath: returnPathSchema,
  })
  .strict();
const rawProjectionSchema = z
  .object({
    status: z.literal('loaded'),
    session: z
      .object({
        id: uuidSchema,
        worldMapId: uuidSchema,
        worldMapVersionId: uuidSchema,
        environment: environmentSchema,
        status: z.literal('active'),
        returnPath: returnPathSchema,
        createdAt: timestampSchema,
        expiresAt: timestampSchema,
        gameClientBuild: buildSchema,
      })
      .strict(),
    map: z
      .object({
        id: uuidSchema,
        slug: z.string(),
        displayName: z.string().min(1).max(80),
        description: z.string().min(1).max(280),
        defaultSpawnId: z.string().min(1).max(64),
      })
      .strict(),
    version: z
      .object({
        id: uuidSchema,
        versionNumber: z.number().int().positive(),
        editVersion: z.number().int().positive(),
        checksum: checksumSchema,
        lifecycleStatus: z.enum(['validated', 'published', 'superseded']),
      })
      .strict(),
    manifest: mapManifestSchema,
    assetDeliveries: z.array(pinnedAssetMaterialSchema).max(128),
    previewIdentity: z
      .object({
        displayName: z.literal('Game Test Administrator'),
        appearancePreset: z.literal('moss'),
      })
      .strict(),
    realtime: z
      .object({
        mode: z.literal('disabled_private_solo'),
        publicChannelJoined: z.literal(false),
      })
      .strict(),
    latestEvidence: z
      .object({
        id: uuidSchema,
        result: evidenceResultSchema,
        gameClientBuild: buildSchema,
        recordedAt: timestampSchema,
      })
      .strict()
      .nullable(),
    newerDraftAvailable: z.boolean(),
  })
  .strict();
const recordedEvidenceSchema = z
  .object({
    status: z.literal('recorded'),
    evidenceId: uuidSchema,
    sessionId: uuidSchema,
    worldMapVersionId: uuidSchema,
    result: evidenceResultSchema,
    gameClientBuild: buildSchema,
    environment: environmentSchema,
    recordedAt: timestampSchema,
    publicationReadiness: z.enum(['recommended', 'not_recommended']),
  })
  .strict();
const adminStatusSchema = z
  .object({
    status: z.literal('loaded'),
    worldMapId: uuidSchema,
    worldMapVersionId: uuidSchema,
    gameTestStatus: z.enum([
      'passed',
      'failed',
      'blocked',
      'needs_changes',
      'not_tested',
      'test_outdated',
    ]),
    latestEvidence: z
      .object({
        id: uuidSchema,
        result: evidenceResultSchema,
        testerAdministratorId: uuidSchema,
        testerDisplayName: z.string().min(1).max(100),
        gameClientBuild: buildSchema,
        environment: environmentSchema,
        recordedAt: timestampSchema,
      })
      .strict()
      .nullable(),
    activeSessions: z
      .array(
        z
          .object({
            id: uuidSchema,
            status: z.enum(['issued', 'active']),
            createdAt: timestampSchema,
            expiresAt: timestampSchema,
            exchangedAt: timestampSchema.nullable(),
            gameClientBuild: buildSchema.nullable(),
          })
          .strict(),
      )
      .max(5),
  })
  .strict();

const RESTRICTIONS = [
  'no_player_persistence',
  'no_rewards',
  'no_economy',
  'no_inventory',
  'no_social',
  'no_chat',
  'no_public_realtime',
  'no_world_transitions',
] as const;

function opaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function status(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = Reflect.get(value, 'status');
  return typeof candidate === 'string' ? candidate : undefined;
}

function mapCreateFailure(value: unknown): never {
  const outcome = status(value);
  if (outcome === 'mfa_required') throw new PublicApiError(403, 'MFA_REQUIRED');
  if (outcome === 'not_found') throw new PublicApiError(404, 'WORLD_GAME_TEST_NOT_FOUND');
  if (outcome === 'stale_revision') throw new PublicApiError(409, 'WORLD_GAME_TEST_STALE');
  if (outcome === 'maintenance_blocked') {
    throw new PublicApiError(503, 'WORLD_GAME_TEST_MAINTENANCE');
  }
  if (outcome === 'rate_limited' || outcome === 'active_limit') {
    throw new PublicApiError(429, 'RATE_LIMITED');
  }
  if (outcome === 'request_conflict') {
    throw new PublicApiError(409, 'WORLD_GAME_TEST_REQUEST_CONFLICT');
  }
  throw new PublicApiError(503, 'WORLD_GAME_TEST_UNAVAILABLE');
}

function mapSessionFailure(value: unknown): never {
  const outcome = status(value);
  if (outcome === 'maintenance_blocked') {
    throw new PublicApiError(503, 'WORLD_GAME_TEST_MAINTENANCE');
  }
  if (['invalid_grant', 'invalid_session', 'expired', 'revoked'].includes(outcome ?? '')) {
    throw new PublicApiError(401, 'WORLD_GAME_TEST_SESSION_INVALID');
  }
  throw new PublicApiError(503, 'WORLD_GAME_TEST_UNAVAILABLE');
}

function parseProjection(
  value: unknown,
  publicAssetUrl: (path: string) => string,
): WorldGameTestProjection {
  const parsed = rawProjectionSchema.safeParse(value);
  if (!parsed.success) mapSessionFailure(value);
  try {
    const raw = parsed.data;
    const deliveries = projectWorldAssetDeliveries(
      raw.manifest.assets,
      raw.assetDeliveries,
      publicAssetUrl,
    );
    const catalog = new Map(
      deliveries.map(({ assetKey }) => [assetKey, { key: assetKey, status: 'approved' as const }]),
    );
    for (const key of WORLD_ASSET_CATALOG.keys()) {
      if (!catalog.has(key)) catalog.set(key, { key, status: 'approved' });
    }
    const manifest = validateMapManifest(raw.manifest, catalog);
    if (
      raw.session.worldMapId !== raw.map.id ||
      raw.session.worldMapVersionId !== raw.version.id ||
      raw.map.slug !== manifest.slug ||
      raw.map.defaultSpawnId !== manifest.defaultSpawnId ||
      raw.version.versionNumber !== manifest.version
    ) {
      throw new Error('World Game Test revision identity mismatch');
    }
    const spawn = defaultMapSpawn(manifest);
    return {
      session: raw.session,
      map: { ...raw.map, slug: manifest.slug },
      version: raw.version,
      manifest,
      assetDeliveries: deliveries,
      playerState: {
        mapId: manifest.id,
        x: spawn.x,
        y: spawn.y,
        facingDirection: spawn.facingDirection,
      },
      previewIdentity: raw.previewIdentity,
      realtime: raw.realtime,
      latestEvidence: raw.latestEvidence,
      newerDraftAvailable: raw.newerDraftAvailable,
      restrictions: RESTRICTIONS,
    };
  } catch {
    throw new PublicApiError(503, 'WORLD_GAME_TEST_CONTENT_INVALID');
  }
}

export function createWorldGameTestService(options: {
  readonly gateway: WorldGameTestGateway;
  readonly logger: ServiceLogger;
  readonly environment: EnvironmentName;
  readonly publicAssetUrl: (path: string) => string;
  readonly ttlMinutes?: number;
  readonly adminRateLimit?: number;
}): WorldGameTestService {
  const ttlMinutes = options.ttlMinutes ?? 20;
  const adminRateLimit = options.adminRateLimit ?? 12;
  if (ttlMinutes < 15 || ttlMinutes > 30)
    throw new Error('World Game Test TTL must be 15–30 minutes');

  const guarded = async <T>(requestId: string, operation: () => Promise<T>): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof PublicApiError) throw error;
      options.logger.child({ requestId }).error('world.game_test.failed', { error });
      throw new PublicApiError(503, 'WORLD_GAME_TEST_UNAVAILABLE');
    }
  };

  return {
    async createAdmin(identity, rawMapId, rawVersionId, body, requestId) {
      if (identity.assuranceLevel !== 'aal2') throw new PublicApiError(403, 'MFA_REQUIRED');
      const mapId = uuidSchema.safeParse(rawMapId);
      const versionId = uuidSchema.safeParse(rawVersionId);
      const input = createSchema.safeParse(body);
      if (!mapId.success || !versionId.success || !input.success) {
        throw new PublicApiError(400, 'INVALID_WORLD_GAME_TEST_REQUEST');
      }
      return guarded(requestId, async () => {
        const grantToken = opaqueToken();
        const result = await options.gateway.create(identity, {
          p_world_map_id: mapId.data,
          p_version_id: versionId.data,
          p_expected_edit_version: input.data.expectedEditVersion,
          p_expected_checksum: input.data.expectedChecksum,
          p_environment: options.environment,
          p_grant_token_hash: tokenHash(grantToken),
          p_return_path: input.data.returnPath,
          p_client_request_id: input.data.clientRequestId,
          p_request_id: requestId,
          p_rate_limit: adminRateLimit,
          p_ttl_minutes: ttlMinutes,
        });
        const issued = issuedSchema.safeParse(result);
        if (!issued.success) mapCreateFailure(result);
        options.logger.child({ requestId }).info('world.game_test.grant_issued', {
          sessionId: issued.data.sessionId,
          worldMapId: issued.data.worldMapId,
          worldMapVersionId: issued.data.worldMapVersionId,
          environment: issued.data.environment,
        });
        return { grantToken, ...issued.data };
      });
    },
    async exchange(body, requestId) {
      const input = exchangeSchema.safeParse(body);
      if (!input.success) throw new PublicApiError(400, 'INVALID_WORLD_GAME_TEST_GRANT');
      return guarded(requestId, async () => {
        const sessionToken = opaqueToken();
        const result = await options.gateway.exchange({
          p_grant_token_hash: tokenHash(input.data.grantToken),
          p_session_token_hash: tokenHash(sessionToken),
          p_environment: options.environment,
          p_game_client_build: input.data.gameClientBuild,
          p_request_id: requestId,
        });
        const projection = parseProjection(result, options.publicAssetUrl);
        options.logger.child({ requestId }).info('world.game_test.exchanged', {
          sessionId: projection.session.id,
          worldMapId: projection.session.worldMapId,
          worldMapVersionId: projection.session.worldMapVersionId,
        });
        return { sessionToken, projection };
      });
    },
    async load(rawSessionToken, requestId) {
      const sessionToken = tokenSchema.safeParse(rawSessionToken);
      if (!sessionToken.success) {
        throw new PublicApiError(401, 'WORLD_GAME_TEST_SESSION_INVALID');
      }
      return guarded(requestId, async () =>
        parseProjection(
          await options.gateway.load({
            p_session_token_hash: tokenHash(sessionToken.data),
            p_environment: options.environment,
            p_request_id: requestId,
          }),
          options.publicAssetUrl,
        ),
      );
    },
    async statusAdmin(identity, rawMapId, rawVersionId, requestId) {
      if (identity.assuranceLevel !== 'aal2') throw new PublicApiError(403, 'MFA_REQUIRED');
      const mapId = uuidSchema.safeParse(rawMapId);
      const versionId = uuidSchema.safeParse(rawVersionId);
      if (!mapId.success || !versionId.success) {
        throw new PublicApiError(400, 'INVALID_WORLD_GAME_TEST_REQUEST');
      }
      return guarded(requestId, async () => {
        const result = await options.gateway.statusAdmin(identity, {
          p_world_map_id: mapId.data,
          p_version_id: versionId.data,
          p_request_id: requestId,
        });
        if (status(result) === 'mfa_required') throw new PublicApiError(403, 'MFA_REQUIRED');
        if (status(result) === 'not_found') {
          throw new PublicApiError(404, 'WORLD_GAME_TEST_NOT_FOUND');
        }
        const parsed = adminStatusSchema.safeParse(result);
        if (!parsed.success) throw new PublicApiError(503, 'WORLD_GAME_TEST_UNAVAILABLE');
        return parsed.data;
      });
    },
    async exit(rawSessionToken, requestId) {
      const sessionToken = tokenSchema.safeParse(rawSessionToken);
      if (!sessionToken.success) return;
      await guarded(requestId, async () => {
        await options.gateway.exit({
          p_session_token_hash: tokenHash(sessionToken.data),
          p_environment: options.environment,
          p_request_id: requestId,
        });
      });
    },
    async revokeAdmin(identity, rawSessionId, requestId) {
      if (identity.assuranceLevel !== 'aal2') throw new PublicApiError(403, 'MFA_REQUIRED');
      const sessionId = uuidSchema.safeParse(rawSessionId);
      if (!sessionId.success) throw new PublicApiError(400, 'INVALID_WORLD_GAME_TEST_REQUEST');
      return guarded(requestId, async () => {
        const result = await options.gateway.revoke(identity, {
          p_game_test_session_id: sessionId.data,
          p_request_id: requestId,
        });
        if (status(result) === 'mfa_required') throw new PublicApiError(403, 'MFA_REQUIRED');
        if (status(result) === 'not_found') {
          throw new PublicApiError(404, 'WORLD_GAME_TEST_NOT_FOUND');
        }
        const parsed = z
          .object({ status: z.literal('revoked'), sessionId: uuidSchema })
          .strict()
          .safeParse(result);
        if (!parsed.success) throw new PublicApiError(503, 'WORLD_GAME_TEST_UNAVAILABLE');
        return { sessionId: parsed.data.sessionId };
      });
    },
    async recordEvidence(identity, rawSessionId, body, requestId) {
      if (identity.assuranceLevel !== 'aal2') throw new PublicApiError(403, 'MFA_REQUIRED');
      const sessionId = uuidSchema.safeParse(rawSessionId);
      const input = evidenceSchema.safeParse(body);
      if (!sessionId.success || !input.success) {
        throw new PublicApiError(400, 'INVALID_WORLD_GAME_TEST_EVIDENCE');
      }
      return guarded(requestId, async () => {
        const result = await options.gateway.recordEvidence(identity, {
          p_game_test_session_id: sessionId.data,
          p_result: input.data.result,
          p_checklist: input.data.checklist,
          p_notes: input.data.notes,
          p_request_id: requestId,
        });
        if (status(result) === 'mfa_required') throw new PublicApiError(403, 'MFA_REQUIRED');
        if (status(result) === 'not_found') {
          throw new PublicApiError(404, 'WORLD_GAME_TEST_NOT_FOUND');
        }
        if (status(result) === 'session_conflict') {
          throw new PublicApiError(409, 'WORLD_GAME_TEST_SESSION_CONFLICT');
        }
        const parsed = recordedEvidenceSchema.safeParse(result);
        if (!parsed.success) throw new PublicApiError(503, 'WORLD_GAME_TEST_UNAVAILABLE');
        options.logger.child({ requestId }).info('world.game_test.evidence_recorded', {
          sessionId: parsed.data.sessionId,
          worldMapVersionId: parsed.data.worldMapVersionId,
          result: parsed.data.result,
          environment: parsed.data.environment,
        });
        return parsed.data;
      });
    },
  };
}
