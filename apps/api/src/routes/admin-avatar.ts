import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { AVATAR_CONTENT_LAYERS, avatarStableKeySchema } from '@starville/avatar';
import type { AdminPermissionKey } from '@starville/admin-auth';

import { authorizeAdminRequest } from '../admin-authorization.js';
import {
  AdminAvatarPersistenceError,
  AdminAvatarStatusError,
  adminAvatarCatalogQuerySchema,
  type AdminAvatarGateway,
  type AdminAvatarMutationResult,
} from '../avatar/admin-gateway.js';
import type { AdminAuthGateway, ServiceLogger } from '../contracts.js';
import { PublicApiError } from '../errors.js';
import { assertTrustedBrowserMutation, disableResponseCaching } from '../token-access/http.js';

const PREFIX = '/api/v1/admin/avatar-content';
const BODY_LIMIT = 65_536;
const identifierSchema = z.object({ id: z.uuid() }).strict();
const presetIdentifierSchema = z.object({ presetId: z.uuid() }).strict();
const operationIdentifierSchema = z
  .object({
    versionId: z.uuid(),
    operation: z.enum(['validate', 'submit', 'review', 'approve', 'activate', 'supersede']),
  })
  .strict();
const requestIdSchema = z.uuid();
const reasonSchema = z
  .string()
  .trim()
  .min(12)
  .max(500)
  .regex(/^[^<>\p{Cc}]+$/u);

type AdminAvatarAuditQuery = Parameters<AdminAvatarGateway['audit']>[1];

const auditQuerySchema: z.ZodType<AdminAvatarAuditQuery> = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce
      .number()
      .pipe(z.union([z.literal(20), z.literal(50), z.literal(100)]))
      .default(50),
  })
  .strict();

const createDraftSchema = z
  .object({
    stableKey: avatarStableKeySchema,
    publicName: z.string().trim().min(3).max(80),
    description: z.string().trim().min(3).max(500),
    category: avatarStableKeySchema,
    layer: z.enum(AVATAR_CONTENT_LAYERS),
    expectedRevision: z.literal(0),
    requestId: requestIdSchema,
  })
  .strict();

const updateDraftSchema = z
  .object({
    definitionId: z.uuid(),
    expectedRevision: z.number().int().positive(),
    publicName: z.string().trim().min(3).max(80),
    description: z.string().trim().min(3).max(500),
    renderOrder: z.number().int().min(-100).max(100),
    anchorX: z.number().min(0).max(1),
    anchorY: z.number().min(0).max(1),
    offsetX: z.number().int().min(-256).max(256),
    offsetY: z.number().int().min(-256).max(256),
    fallbackKey: avatarStableKeySchema.nullable(),
    directions: z
      .array(
        z.enum([
          'north',
          'northeast',
          'east',
          'southeast',
          'south',
          'southwest',
          'west',
          'northwest',
        ]),
      )
      .max(8),
    animationStates: z.array(z.enum(['idle', 'walk', 'jog'])).max(3),
    requestId: requestIdSchema,
  })
  .strict();

const validateLifecycleSchema = z
  .object({
    definitionId: z.uuid(),
    expectedRevision: z.number().int().positive(),
    requestId: requestIdSchema,
  })
  .strict();
const reasonedLifecycleSchema = validateLifecycleSchema.extend({ reason: reasonSchema }).strict();
const reviewLifecycleSchema = reasonedLifecycleSchema
  .extend({ decision: z.enum(['accept', 'changes_requested', 'reject']) })
  .strict();

const settingsUpdateSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    customizationEnabled: z.boolean(),
    creatorRequiredForNewPlayers: z.boolean(),
    maintenanceMode: z.boolean(),
    maximumAccessories: z.number().int().min(0).max(4),
    fallbackPresetKey: avatarStableKeySchema,
    requestId: requestIdSchema,
  })
  .strict();
const presetPublicationSchema = z
  .object({
    presetId: z.uuid(),
    expectedRevision: z.number().int().positive(),
    reason: reasonSchema,
    requestId: requestIdSchema,
  })
  .strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new PublicApiError(400, 'INVALID_AVATAR_ADMIN_REQUEST');
  return parsed.data;
}

function mutationFailure(result: AdminAvatarMutationResult): AdminAvatarMutationResult {
  switch (result.status) {
    case 'created':
    case 'updated':
    case 'valid':
    case 'invalid':
    case 'submitted':
    case 'reviewed':
    case 'changes_requested':
    case 'rejected':
    case 'approved':
    case 'active':
    case 'superseded':
    case 'published':
      return result;
    case 'rate_limited':
      throw new PublicApiError(429, 'RATE_LIMITED');
    case 'not_found':
    case 'content_unavailable':
      throw new PublicApiError(404, 'AVATAR_CONTENT_NOT_FOUND');
    case 'key_conflict':
      throw new PublicApiError(409, 'AVATAR_CONTENT_KEY_CONFLICT');
    case 'version_changed':
    case 'settings_changed':
      throw new PublicApiError(409, 'AVATAR_CONTENT_CHANGED');
    case 'separation_required':
      throw new PublicApiError(403, 'AVATAR_SEPARATION_REQUIRED');
    case 'immutable_version':
    case 'invalid_state':
    case 'validation_required':
    case 'review_required':
    case 'approval_required':
    case 'request_already_processed':
      throw new PublicApiError(409, 'AVATAR_LIFECYCLE_CONFLICT');
  }
}

async function operation<T>(invoke: () => Promise<T>): Promise<T> {
  try {
    return await invoke();
  } catch (error) {
    if (error instanceof AdminAvatarStatusError) {
      throw new PublicApiError(
        error.status === 'not_found' ? 404 : 429,
        error.status === 'not_found' ? 'AVATAR_CONTENT_NOT_FOUND' : 'RATE_LIMITED',
      );
    }
    if (error instanceof AdminAvatarPersistenceError) {
      throw new PublicApiError(503, 'AVATAR_ADMIN_UNAVAILABLE');
    }
    throw error;
  }
}

function id(request: FastifyRequest): string {
  return parse(identifierSchema, request.params).id;
}

function permissionForLifecycle(
  operationName: z.infer<typeof operationIdentifierSchema>['operation'],
): AdminPermissionKey {
  switch (operationName) {
    case 'validate':
    case 'submit':
      return 'avatar_content.edit';
    case 'review':
      return 'avatar_content.review';
    case 'approve':
      return 'avatar_content.approve';
    case 'activate':
    case 'supersede':
      return 'avatar_content.activate';
  }
}

export function registerAdminAvatarRoutes(
  app: FastifyInstance,
  options: {
    readonly adminGateway: AdminAuthGateway;
    readonly avatarGateway: AdminAvatarGateway;
    readonly logger: ServiceLogger;
    readonly allowedOrigins: ReadonlySet<string>;
  },
): void {
  app.get(`${PREFIX}/overview`, async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'avatar_content.read',
    );
    return {
      success: true,
      data: await operation(() => options.avatarGateway.overview(identity)),
      requestId: request.id,
    };
  });

  app.get(`${PREFIX}/catalog`, async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'avatar_content.read',
    );
    const query = parse(adminAvatarCatalogQuerySchema, request.query);
    return {
      success: true,
      data: await operation(() => options.avatarGateway.list(identity, query)),
      requestId: request.id,
    };
  });

  app.get(`${PREFIX}/catalog/:id`, async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'avatar_content.read',
    );
    return {
      success: true,
      data: await operation(() =>
        options.avatarGateway.definition(identity, id(request), request.id),
      ),
      requestId: request.id,
    };
  });

  app.get(`${PREFIX}/presets`, async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'avatar_content.read',
    );
    return {
      success: true,
      data: await operation(() => options.avatarGateway.presets(identity)),
      requestId: request.id,
    };
  });

  app.get(`${PREFIX}/audit`, async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'avatar_content.audit.read',
    );
    const query = parse(auditQuerySchema, request.query);
    return {
      success: true,
      data: await operation(() => options.avatarGateway.audit(identity, query)),
      requestId: request.id,
    };
  });

  app.get(`${PREFIX}/settings`, async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'avatar_content.settings.read',
    );
    return {
      success: true,
      data: await operation(() => options.avatarGateway.settings(identity)),
      requestId: request.id,
    };
  });

  app.post(`${PREFIX}/catalog`, { bodyLimit: BODY_LIMIT }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'avatar_content.edit',
    );
    const input = parse(createDraftSchema, request.body);
    const result = await operation(() =>
      options.avatarGateway.createDraft(identity, input, input.requestId),
    );
    return { success: true, data: mutationFailure(result), requestId: request.id };
  });

  app.patch(`${PREFIX}/versions/:id`, { bodyLimit: BODY_LIMIT }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'avatar_content.edit',
    );
    const input = parse(updateDraftSchema, request.body);
    const definitionId = id(request);
    if (definitionId !== input.definitionId) {
      throw new PublicApiError(400, 'INVALID_AVATAR_ADMIN_REQUEST');
    }
    const { expectedRevision, requestId, ...configurationWithDefinitionId } = input;
    const { definitionId: verifiedDefinitionId, ...configuration } = configurationWithDefinitionId;
    const result = await operation(() =>
      options.avatarGateway.updateDraft(
        identity,
        verifiedDefinitionId,
        expectedRevision,
        configuration,
        requestId,
      ),
    );
    return { success: true, data: mutationFailure(result), requestId: request.id };
  });

  app.post(
    `${PREFIX}/versions/:versionId/:operation`,
    { bodyLimit: 4_096 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const parameters = parse(operationIdentifierSchema, request.params);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        permissionForLifecycle(parameters.operation),
      );
      const input =
        parameters.operation === 'validate'
          ? parse(validateLifecycleSchema, request.body)
          : parameters.operation === 'review'
            ? parse(reviewLifecycleSchema, request.body)
            : parse(reasonedLifecycleSchema, request.body);
      const reason =
        'reason' in input && typeof input.reason === 'string' ? input.reason : undefined;
      const decision =
        'decision' in input &&
        (input.decision === 'accept' ||
          input.decision === 'changes_requested' ||
          input.decision === 'reject')
          ? input.decision
          : undefined;
      const result = await operation(() =>
        options.avatarGateway.lifecycle(
          identity,
          parameters.operation,
          parameters.versionId,
          input.expectedRevision,
          reason,
          decision,
          input.requestId,
        ),
      );
      return { success: true, data: mutationFailure(result), requestId: request.id };
    },
  );

  app.patch(`${PREFIX}/settings`, { bodyLimit: 4_096 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'avatar_content.settings.edit',
    );
    const input = parse(settingsUpdateSchema, request.body);
    const { expectedRevision, requestId, ...settings } = input;
    const result = await operation(() =>
      options.avatarGateway.updateSettings(identity, expectedRevision, settings, requestId),
    );
    return { success: true, data: mutationFailure(result), requestId: request.id };
  });

  app.post(`${PREFIX}/presets/:presetId/publish`, { bodyLimit: 4_096 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'avatar_content.activate',
    );
    const parameters = parse(presetIdentifierSchema, request.params);
    const input = parse(presetPublicationSchema, request.body);
    if (parameters.presetId !== input.presetId) {
      throw new PublicApiError(400, 'INVALID_AVATAR_ADMIN_REQUEST');
    }
    const result = await operation(() =>
      options.avatarGateway.publishPreset(
        identity,
        parameters.presetId,
        input.expectedRevision,
        input.reason,
        input.requestId,
      ),
    );
    return { success: true, data: mutationFailure(result), requestId: request.id };
  });
}
