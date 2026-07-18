import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  progressionIdentityMutationSchema,
  progressionQuestCompleteSchema,
  progressionQuestMutationSchema,
  progressionQuestTrackSchema,
  progressionRewardRetrySchema,
} from '@starville/progression';
import { progressionSimulationInputSchema } from '@starville/progression-simulation';
import type { AdminPermissionKey } from '@starville/admin-auth';
import { authorizeAdminRequest } from '../admin-authorization.js';
import type { AdminAuthGateway, ServiceLogger } from '../contracts.js';
import { PublicApiError, type SafeApiErrorCode } from '../errors.js';
import type { PlayerService } from '../player/contracts.js';
import { authorizePlayerRequest, requirePlayerEntry } from '../player/http-authorization.js';
import {
  ProgressionPersistenceError,
  adminProgressionQuerySchema,
  progressionCorrectionApplySchema,
  progressionCorrectionSchema,
  progressionCurveSuccessorSchema,
  progressionLiveOpsSchema,
  progressionPresentationUpdateSchema,
  progressionReconciliationSchema,
  progressionSuccessorSchema,
  progressionVersionTransitionSchema,
  type ProgressionGateway,
  type ProgressionPersistenceStatus,
} from '../progression/gateway.js';
import type { TokenAccessService } from '../token-access/contracts.js';
import {
  assertTrustedBrowserMutation,
  disableResponseCaching,
  type TokenAccessCookieOptions,
} from '../token-access/http.js';

const PLAYER_PREFIX = '/api/v1/token-access/player/progression';
const uuidParams = z.object({ id: z.uuid() }).strict();
const kindParams = z
  .object({
    kind: z.enum(['skill', 'xp_rule', 'unlock', 'quest_chain', 'achievement']),
    id: z.uuid(),
  })
  .strict();
const presentationParams = z.object({ kind: z.enum(['title', 'badge']), id: z.uuid() }).strict();
const eventQuery = z
  .object({
    after: z.coerce.number().int().nonnegative().default(0),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new PublicApiError(400, 'INVALID_PROGRESSION_REQUEST');
  return parsed.data;
}

function persistenceFailure(status: string): never {
  const mapping: Record<
    ProgressionPersistenceStatus,
    readonly [PublicApiError['statusCode'], SafeApiErrorCode]
  > = {
    progression_not_found: [404, 'PROGRESSION_NOT_FOUND'],
    suspended: [403, 'PLAYER_SUSPENDED'],
    rename_required: [409, 'PLAYER_RENAME_REQUIRED'],
    bootstrap_required: [409, 'COZY_GAMEPLAY_BOOTSTRAP_REQUIRED'],
    rate_limited: [429, 'RATE_LIMITED'],
    progression_disabled: [503, 'PROGRESSION_DISABLED'],
    progression_conflict: [409, 'PROGRESSION_CONFLICT'],
    quest_not_found: [404, 'QUEST_NOT_AVAILABLE'],
    quest_not_available: [409, 'QUEST_NOT_AVAILABLE'],
    quest_prerequisite_not_met: [409, 'UNLOCK_REQUIREMENT_NOT_MET'],
    quest_objective_incomplete: [409, 'QUEST_OBJECTIVE_INCOMPLETE'],
    title_not_owned: [403, 'TITLE_NOT_OWNED'],
    title_disabled: [409, 'TITLE_DISABLED'],
    badge_not_owned: [403, 'BADGE_NOT_OWNED'],
    badge_disabled: [409, 'BADGE_DISABLED'],
    reward_not_found: [404, 'REWARD_SETTLEMENT_FAILED'],
    reward_already_settled: [409, 'QUEST_REWARD_ALREADY_SETTLED'],
    inventory_full: [409, 'INVENTORY_FULL'],
    reward_settlement_failed: [503, 'REWARD_SETTLEMENT_FAILED'],
    service_unavailable: [503, 'PROGRESSION_UNAVAILABLE'],
  };
  const [statusCode, code] =
    mapping[status as ProgressionPersistenceStatus] ?? ([503, 'PROGRESSION_UNAVAILABLE'] as const);
  throw new PublicApiError(statusCode, code);
}

async function operation<T>(invoke: () => Promise<T>): Promise<T> {
  try {
    return await invoke();
  } catch (error) {
    if (error instanceof ProgressionPersistenceError)
      throw new PublicApiError(503, 'PROGRESSION_UNAVAILABLE');
    throw error;
  }
}

async function playerWallet(
  request: FastifyRequest,
  reply: FastifyReply,
  options: {
    playerService: PlayerService;
    tokenAccessService: TokenAccessService;
    cookie: TokenAccessCookieOptions;
  },
): Promise<string> {
  const wallet = await authorizePlayerRequest(
    request,
    reply,
    options.tokenAccessService,
    options.cookie,
  );
  if (
    (await requirePlayerEntry(options.playerService, wallet, request.id, false, false)) ===
    undefined
  ) {
    throw new PublicApiError(404, 'PLAYER_PROFILE_REQUIRED');
  }
  return wallet;
}

function permissionForKind(kind: z.infer<typeof kindParams>['kind']): AdminPermissionKey {
  switch (kind) {
    case 'skill':
      return 'progression.skills.manage';
    case 'xp_rule':
      return 'progression.xp_rules.manage';
    case 'unlock':
      return 'progression.unlocks.manage';
    case 'quest_chain':
      return 'progression.quests.manage';
    case 'achievement':
      return 'progression.achievements.manage';
  }
}

export function registerProgressionRoutes(
  app: FastifyInstance,
  options: {
    gateway: ProgressionGateway;
    playerService: PlayerService;
    tokenAccessService: TokenAccessService;
    cookie: TokenAccessCookieOptions;
    adminGateway: AdminAuthGateway;
    logger: ServiceLogger;
    allowedOrigins: ReadonlySet<string>;
  },
): void {
  app.get(PLAYER_PREFIX, async (request, reply) => {
    disableResponseCaching(reply);
    const wallet = await playerWallet(request, reply, options);
    const result = await operation(() => options.gateway.workspace(wallet, request.id));
    if (typeof result === 'string') persistenceFailure(result);
    return { success: true, data: result, requestId: request.id };
  });

  app.get(`${PLAYER_PREFIX}/events`, async (request, reply) => {
    disableResponseCaching(reply);
    const wallet = await playerWallet(request, reply, options);
    const query = parse(eventQuery, request.query);
    const result = await operation(() =>
      options.gateway.events(wallet, query.after, query.limit, request.id),
    );
    if (typeof result === 'string') persistenceFailure(result);
    return { success: true, data: result, requestId: request.id };
  });

  app.post(`${PLAYER_PREFIX}/quests/:id/accept`, { bodyLimit: 2_048 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const wallet = await playerWallet(request, reply, options);
    const { id } = parse(uuidParams, request.params);
    const input = parse(progressionQuestMutationSchema, request.body);
    if (input.questDefinitionId !== id)
      throw new PublicApiError(400, 'INVALID_PROGRESSION_REQUEST');
    const result = await operation(() =>
      options.gateway.acceptQuest(
        wallet,
        id,
        input.expectedConfigurationRevision,
        input.idempotencyKey,
        request.id,
      ),
    );
    if (typeof result === 'string') persistenceFailure(result);
    return { success: true, data: result, requestId: request.id };
  });

  app.patch(
    `${PLAYER_PREFIX}/quests/:id/tracking`,
    { bodyLimit: 1_024 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const wallet = await playerWallet(request, reply, options);
      const { id } = parse(uuidParams, request.params);
      const input = parse(progressionQuestTrackSchema, request.body);
      const result = await operation(() =>
        options.gateway.trackQuest(
          wallet,
          id,
          input.tracked,
          input.expectedStateVersion,
          request.id,
        ),
      );
      if (typeof result === 'string') persistenceFailure(result);
      return { success: true, data: result, requestId: request.id };
    },
  );

  app.post(`${PLAYER_PREFIX}/quests/:id/complete`, { bodyLimit: 2_048 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const wallet = await playerWallet(request, reply, options);
    const { id } = parse(uuidParams, request.params);
    const input = parse(progressionQuestCompleteSchema, request.body);
    const result = await operation(() =>
      options.gateway.completeQuest(
        wallet,
        id,
        input.expectedStateVersion,
        input.idempotencyKey,
        request.id,
      ),
    );
    if (typeof result === 'string') persistenceFailure(result);
    return { success: true, data: result, requestId: request.id };
  });

  app.patch(`${PLAYER_PREFIX}/identity`, { bodyLimit: 1_024 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const wallet = await playerWallet(request, reply, options);
    const input = parse(progressionIdentityMutationSchema, request.body);
    const result = await operation(() =>
      options.gateway.updateIdentity(
        wallet,
        input.titleId,
        input.badgeId,
        input.expectedRevision,
        request.id,
      ),
    );
    if (typeof result === 'string') persistenceFailure(result);
    return { success: true, data: result, requestId: request.id };
  });

  app.post(`${PLAYER_PREFIX}/rewards/:id/retry`, { bodyLimit: 1_024 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const wallet = await playerWallet(request, reply, options);
    const { id } = parse(uuidParams, request.params);
    const input = parse(progressionRewardRetrySchema, request.body);
    const result = await operation(() =>
      options.gateway.retryReward(wallet, id, input.expectedRevision, request.id),
    );
    if (typeof result === 'string') persistenceFailure(result);
    return { success: true, data: result, requestId: request.id };
  });

  app.get('/api/v1/admin/progression', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'progression.skills.inspect',
    );
    const query = parse(adminProgressionQuerySchema, request.query);
    return {
      success: true,
      data: await operation(() =>
        options.gateway.adminWorkspace(identity, query.wallet, query.search, request.id),
      ),
      requestId: request.id,
    };
  });

  app.post(
    '/api/v1/admin/progression/simulations',
    { bodyLimit: 8_192 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'progression.curves.manage',
      );
      return {
        success: true,
        data: options.gateway.simulate(
          identity,
          parse(progressionSimulationInputSchema, request.body),
        ),
        requestId: request.id,
      };
    },
  );

  app.post(
    '/api/v1/admin/progression/curves/successors',
    { bodyLimit: 8_192 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'progression.curves.manage',
      );
      return {
        success: true,
        data: await operation(() =>
          options.gateway.curveSuccessor(
            identity,
            parse(progressionCurveSuccessorSchema, request.body),
            request.id,
          ),
        ),
        requestId: request.id,
      };
    },
  );

  app.post(
    '/api/v1/admin/progression/curves/:id/validate',
    { bodyLimit: 2_048 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'progression.curves.manage',
      );
      const { id } = parse(uuidParams, request.params);
      const input = parse(progressionVersionTransitionSchema, request.body);
      if (input.action !== 'validate') throw new PublicApiError(400, 'INVALID_PROGRESSION_REQUEST');
      return {
        success: true,
        data: await operation(() => options.gateway.validateCurve(identity, id, input, request.id)),
        requestId: request.id,
      };
    },
  );

  app.post(
    '/api/v1/admin/progression/curves/:id/activate',
    { bodyLimit: 2_048 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'progression.curves.manage',
      );
      const { id } = parse(uuidParams, request.params);
      const input = parse(progressionVersionTransitionSchema, request.body);
      if (input.action !== 'activate') throw new PublicApiError(400, 'INVALID_PROGRESSION_REQUEST');
      return {
        success: true,
        data: await operation(() => options.gateway.activateCurve(identity, id, input, request.id)),
        requestId: request.id,
      };
    },
  );

  app.post(
    '/api/v1/admin/progression/:kind/:id/successors',
    { bodyLimit: 8_192 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const parsed = parse(kindParams, request.params);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        permissionForKind(parsed.kind),
      );
      return {
        success: true,
        data: await operation(() =>
          options.gateway.successor(
            identity,
            parsed.kind,
            parsed.id,
            parse(progressionSuccessorSchema, request.body),
            request.id,
          ),
        ),
        requestId: request.id,
      };
    },
  );

  app.post(
    '/api/v1/admin/progression/:kind/versions/:id/transition',
    { bodyLimit: 2_048 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const parsed = parse(kindParams, request.params);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        permissionForKind(parsed.kind),
      );
      return {
        success: true,
        data: await operation(() =>
          options.gateway.transition(
            identity,
            parsed.kind,
            parsed.id,
            parse(progressionVersionTransitionSchema, request.body),
            request.id,
          ),
        ),
        requestId: request.id,
      };
    },
  );

  app.patch('/api/v1/admin/progression/live-ops', { bodyLimit: 4_096 }, async (request, reply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'progression.live_ops.manage',
    );
    return {
      success: true,
      data: await operation(() =>
        options.gateway.liveOps(
          identity,
          parse(progressionLiveOpsSchema, request.body),
          request.id,
        ),
      ),
      requestId: request.id,
    };
  });

  app.patch(
    '/api/v1/admin/progression/presentation/:kind/:id',
    { bodyLimit: 4_096 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const parsed = parse(presentationParams, request.params);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'progression.titles.manage',
      );
      return {
        success: true,
        data: await operation(() =>
          options.gateway.updatePresentation(
            identity,
            parsed.kind,
            parsed.id,
            parse(progressionPresentationUpdateSchema, request.body),
            request.id,
          ),
        ),
        requestId: request.id,
      };
    },
  );

  app.post(
    '/api/v1/admin/progression/reconciliation',
    { bodyLimit: 2_048 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'progression.reconciliation.manage',
      );
      return {
        success: true,
        data: await operation(() =>
          options.gateway.reconcile(
            identity,
            parse(progressionReconciliationSchema, request.body),
            request.id,
          ),
        ),
        requestId: request.id,
      };
    },
  );

  app.post(
    '/api/v1/admin/progression/corrections',
    { bodyLimit: 2_048 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'progression.corrections.manage',
      );
      return {
        success: true,
        data: await operation(() =>
          options.gateway.correction(
            identity,
            parse(progressionCorrectionSchema, request.body),
            request.id,
          ),
        ),
        requestId: request.id,
      };
    },
  );

  app.post(
    '/api/v1/admin/progression/corrections/:id/apply',
    { bodyLimit: 2_048 },
    async (request, reply) => {
      assertTrustedBrowserMutation(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'progression.corrections.manage',
      );
      const { id } = parse(uuidParams, request.params);
      return {
        success: true,
        data: await operation(() =>
          options.gateway.applyCorrection(
            identity,
            id,
            parse(progressionCorrectionApplySchema, request.body),
            request.id,
          ),
        ),
        requestId: request.id,
      };
    },
  );
}
