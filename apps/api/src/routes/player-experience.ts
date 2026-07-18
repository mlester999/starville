import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  dailyRefreshSchema,
  onboardingAcknowledgeSchema,
  onboardingPreferenceSchema,
  onboardingRecoverySchema,
  onboardingSkipSchema,
  onboardingStartSchema,
} from '@starville/player-experience';

import { authorizeAdminRequest } from '../admin-authorization.js';
import type { AdminAuthGateway, ServiceLogger } from '../contracts.js';
import { PublicApiError, type SafeApiErrorCode } from '../errors.js';
import type { PlayerService } from '../player/contracts.js';
import { authorizePlayerRequest, requirePlayerEntry } from '../player/http-authorization.js';
import {
  PlayerExperiencePersistenceError,
  adminDailyPolicySuccessorSchema,
  adminPlayerExperienceCorrectionSchema,
  adminPlayerExperienceQuerySchema,
  type PlayerExperienceGateway,
  type PlayerExperiencePersistenceStatus,
} from '../player-experience/gateway.js';
import type { TokenAccessService } from '../token-access/contracts.js';
import {
  assertTrustedBrowserMutation,
  disableResponseCaching,
  type TokenAccessCookieOptions,
} from '../token-access/http.js';

const PLAYER_PREFIX = '/api/v1/token-access/player/experience';
const feedbackQuerySchema = z
  .object({
    after: z.coerce.number().int().nonnegative().default(0),
    limit: z.coerce.number().int().min(1).max(20).default(20),
  })
  .strict();
const activitySchema = z
  .object({
    action: z.enum(['pause', 'resume']),
    expectedRevision: z.number().int().positive(),
  })
  .strict();
const uuidParams = z.object({ id: z.uuid() }).strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new PublicApiError(400, 'INVALID_PLAYER_EXPERIENCE_REQUEST');
  return parsed.data;
}

function persistenceFailure(status: PlayerExperiencePersistenceStatus): never {
  const mapping: Record<
    PlayerExperiencePersistenceStatus,
    readonly [PublicApiError['statusCode'], SafeApiErrorCode]
  > = {
    onboarding_not_available: [404, 'PLAYER_EXPERIENCE_NOT_AVAILABLE'],
    onboarding_already_completed: [409, 'ONBOARDING_ALREADY_COMPLETED'],
    expected_revision_conflict: [409, 'PLAYER_EXPERIENCE_CONFLICT'],
    onboarding_recovery_not_allowed: [409, 'ONBOARDING_RECOVERY_NOT_ALLOWED'],
    rate_limited: [429, 'RATE_LIMITED'],
    bootstrap_required: [409, 'COZY_GAMEPLAY_BOOTSTRAP_REQUIRED'],
    rename_required: [409, 'PLAYER_RENAME_REQUIRED'],
    suspended: [403, 'PLAYER_SUSPENDED'],
    request_already_processed: [409, 'PLAYER_EXPERIENCE_CONFLICT'],
  };
  const [statusCode, code] = mapping[status];
  throw new PublicApiError(statusCode, code);
}

async function operation<T>(invoke: () => Promise<T>): Promise<T> {
  try {
    return await invoke();
  } catch (error) {
    if (error instanceof PlayerExperiencePersistenceError)
      throw new PublicApiError(503, 'PLAYER_EXPERIENCE_UNAVAILABLE');
    throw error;
  }
}

async function wallet(
  request: FastifyRequest,
  reply: FastifyReply,
  options: {
    playerService: PlayerService;
    tokenAccessService: TokenAccessService;
    cookie: TokenAccessCookieOptions;
  },
): Promise<string> {
  const address = await authorizePlayerRequest(
    request,
    reply,
    options.tokenAccessService,
    options.cookie,
  );
  if (
    (await requirePlayerEntry(options.playerService, address, request.id, false, false)) ===
    undefined
  )
    throw new PublicApiError(404, 'PLAYER_PROFILE_REQUIRED');
  return address;
}

function data<T>(value: T | PlayerExperiencePersistenceStatus, requestId: string) {
  if (typeof value === 'string') persistenceFailure(value as PlayerExperiencePersistenceStatus);
  return { success: true, data: value, requestId };
}

export function registerPlayerExperienceRoutes(
  app: FastifyInstance,
  options: {
    gateway: PlayerExperienceGateway;
    playerService: PlayerService;
    tokenAccessService: TokenAccessService;
    cookie: TokenAccessCookieOptions;
    adminGateway: AdminAuthGateway;
    logger: ServiceLogger;
    allowedOrigins: ReadonlySet<string>;
  },
): void {
  const mutate = (request: FastifyRequest, reply: FastifyReply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
  };

  app.get(PLAYER_PREFIX, async (request, reply) => {
    disableResponseCaching(reply);
    const query = parse(feedbackQuerySchema, request.query);
    return data(
      await operation(async () =>
        options.gateway.workspace(
          await wallet(request, reply, options),
          query.after,
          query.limit,
          request.id,
        ),
      ),
      request.id,
    );
  });

  app.post(`${PLAYER_PREFIX}/start`, { bodyLimit: 1_024 }, async (request, reply) => {
    mutate(request, reply);
    const input = parse(onboardingStartSchema, request.body);
    return data(
      await operation(async () =>
        options.gateway.start(
          await wallet(request, reply, options),
          input.expectedRevision,
          input.idempotencyKey,
          request.id,
        ),
      ),
      request.id,
    );
  });

  app.patch(`${PLAYER_PREFIX}/activity`, { bodyLimit: 1_024 }, async (request, reply) => {
    mutate(request, reply);
    const input = parse(activitySchema, request.body);
    return data(
      await operation(async () =>
        options.gateway.activity(
          await wallet(request, reply, options),
          input.action,
          input.expectedRevision,
          request.id,
        ),
      ),
      request.id,
    );
  });

  app.patch(`${PLAYER_PREFIX}/preferences`, { bodyLimit: 1_024 }, async (request, reply) => {
    mutate(request, reply);
    const input = parse(onboardingPreferenceSchema, request.body);
    return data(
      await operation(async () =>
        options.gateway.preferences(
          await wallet(request, reply, options),
          input.minimized,
          input.reducedGuidance,
          input.expectedRevision,
          request.id,
        ),
      ),
      request.id,
    );
  });

  app.post(`${PLAYER_PREFIX}/acknowledgements`, { bodyLimit: 1_024 }, async (request, reply) => {
    mutate(request, reply);
    const input = parse(onboardingAcknowledgeSchema, request.body);
    return data(
      await operation(async () =>
        options.gateway.acknowledge(
          await wallet(request, reply, options),
          input.stepKey,
          input.expectedRevision,
          input.idempotencyKey,
          request.id,
        ),
      ),
      request.id,
    );
  });

  app.post(`${PLAYER_PREFIX}/skip-optional`, { bodyLimit: 1_024 }, async (request, reply) => {
    mutate(request, reply);
    const input = parse(onboardingSkipSchema, request.body);
    return data(
      await operation(async () =>
        options.gateway.skipOptional(
          await wallet(request, reply, options),
          input.expectedRevision,
          input.reason,
          request.id,
        ),
      ),
      request.id,
    );
  });

  app.post(`${PLAYER_PREFIX}/recovery`, { bodyLimit: 1_024 }, async (request, reply) => {
    mutate(request, reply);
    const input = parse(onboardingRecoverySchema, request.body);
    return data(
      await operation(async () =>
        options.gateway.recover(
          await wallet(request, reply, options),
          input.reasonCode,
          input.expectedRevision,
          input.idempotencyKey,
          request.id,
        ),
      ),
      request.id,
    );
  });

  app.post(`${PLAYER_PREFIX}/daily-refresh`, { bodyLimit: 1_024 }, async (request, reply) => {
    mutate(request, reply);
    const input = parse(dailyRefreshSchema, request.body);
    return data(
      await operation(async () =>
        options.gateway.refreshDaily(
          await wallet(request, reply, options),
          input.expectedAssignmentRevision,
          input.idempotencyKey,
          request.id,
        ),
      ),
      request.id,
    );
  });

  app.get('/api/v1/admin/player-experience', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'player_experience.inspect',
    );
    const result = await operation(() =>
      options.gateway.adminWorkspace(
        identity,
        parse(adminPlayerExperienceQuerySchema, request.query),
        request.id,
      ),
    );
    return { success: true, data: result, requestId: request.id };
  });

  app.post(
    '/api/v1/admin/player-experience/players/:id/corrections',
    { bodyLimit: 2_048 },
    async (request, reply) => {
      mutate(request, reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'player_experience.support',
      );
      const { id } = parse(uuidParams, request.params);
      const result = await operation(() =>
        options.gateway.adminCorrect(
          identity,
          id,
          parse(adminPlayerExperienceCorrectionSchema, request.body),
          request.id,
        ),
      );
      return { success: true, data: result, requestId: request.id };
    },
  );

  app.post(
    '/api/v1/admin/player-experience/daily-policy-successors',
    { bodyLimit: 2_048 },
    async (request, reply) => {
      mutate(request, reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'player_experience.policy.manage',
      );
      const result = await operation(() =>
        options.gateway.adminCreateDailyPolicySuccessor(
          identity,
          parse(adminDailyPolicySuccessorSchema, request.body),
          request.id,
        ),
      );
      return { success: true, data: result, requestId: request.id };
    },
  );
}
