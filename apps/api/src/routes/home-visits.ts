import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  admissionsRequestSchema,
  homeAppreciationRequestSchema,
  homeGuestbookWriteRequestSchema,
  homeHelperWaterRequestSchema,
  homeVisitInteractionRequestSchema,
  homeVisitInvitationRequestSchema,
  homeVisitModerationRequestSchema,
  homeVisitReportRequestSchema,
  joinHomeVisitRequestSchema,
  leaveHomeVisitRequestSchema,
  ownerGuestbookModerationRequestSchema,
  revokeHomeVisitInvitationRequestSchema,
  sessionRevisionRequestSchema,
  startHomeVisitRequestSchema,
  updateHomeSocialSettingsRequestSchema,
} from '@starville/housing';

import { authorizeAdminRequest } from '../admin-authorization.js';
import type { AdminAuthGateway, ServiceLogger } from '../contracts.js';
import { PublicApiError, type SafeApiErrorCode } from '../errors.js';
import {
  HomeVisitPersistenceError,
  adminHomeGuestbookModerationSchema,
  adminHomeVisitPolicySuccessorSchema,
  adminHomeVisitPolicyTransitionSchema,
  adminHomeVisitQuerySchema,
  adminHomeVisitReconciliationSchema,
  adminHomeVisitReportTransitionSchema,
  adminHomeVisitSessionCloseSchema,
  type HomeVisitGateway,
  type HomeVisitPersistenceStatus,
} from '../home-visits/gateway.js';
import type { PlayerService } from '../player/contracts.js';
import { authorizePlayerRequest, requirePlayerEntry } from '../player/http-authorization.js';
import type { TokenAccessService } from '../token-access/contracts.js';
import {
  assertTrustedBrowserMutation,
  disableResponseCaching,
  type TokenAccessCookieOptions,
} from '../token-access/http.js';

const PLAYER_PREFIX = '/api/v1/token-access/player/home-visits';
const uuidParams = z.object({ id: z.uuid() }).strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new PublicApiError(400, 'INVALID_HOME_VISIT_REQUEST');
  return parsed.data;
}

async function playerWallet(
  request: FastifyRequest,
  reply: FastifyReply,
  options: {
    playerService: PlayerService;
    tokenAccessService: TokenAccessService;
    cookie: TokenAccessCookieOptions;
  },
) {
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

function persistenceFailure(status: HomeVisitPersistenceStatus): never {
  const mapping: Record<
    HomeVisitPersistenceStatus,
    readonly [PublicApiError['statusCode'], SafeApiErrorCode]
  > = {
    home_visit_not_found: [404, 'HOME_VISIT_NOT_FOUND'],
    home_visit_disabled: [503, 'HOME_VISIT_DISABLED'],
    home_visit_not_hosting: [409, 'HOME_VISIT_NOT_HOSTING'],
    home_visit_owner_absent: [409, 'HOME_VISIT_OWNER_ABSENT'],
    home_visit_private: [403, 'HOME_VISIT_PRIVATE'],
    home_visit_friend_required: [403, 'HOME_VISIT_FRIEND_REQUIRED'],
    home_visit_invitation_required: [403, 'HOME_VISIT_INVITATION_REQUIRED'],
    home_visit_invitation_invalid: [409, 'HOME_VISIT_INVITATION_INVALID'],
    home_visit_invitation_disabled: [503, 'HOME_VISIT_INVITATION_DISABLED'],
    home_visit_blocked: [403, 'HOME_VISIT_BLOCKED'],
    home_visit_full: [409, 'HOME_VISIT_FULL'],
    home_visit_already_joined: [409, 'HOME_VISIT_ALREADY_JOINED'],
    home_visit_permission_denied: [403, 'HOME_VISIT_PERMISSION_DENIED'],
    home_visit_interaction_disabled: [403, 'HOME_VISIT_INTERACTION_DISABLED'],
    home_visit_helpers_disabled: [403, 'HOME_VISIT_HELPERS_DISABLED'],
    home_visit_session_closing: [409, 'HOME_VISIT_SESSION_CLOSING'],
    home_visit_decoration_conflict: [409, 'HOME_VISIT_DECORATION_CONFLICT'],
    home_visit_conflict: [409, 'HOME_VISIT_TRANSITION_CONFLICT'],
    home_visitor_not_found: [404, 'HOME_VISITOR_NOT_FOUND'],
    home_seat_not_found: [404, 'HOME_SEAT_NOT_FOUND'],
    home_seat_occupied: [409, 'HOME_SEAT_OCCUPIED'],
    home_photo_area_not_found: [404, 'HOME_PHOTO_AREA_NOT_FOUND'],
    home_photo_area_full: [409, 'HOME_PHOTO_AREA_FULL'],
    home_guestbook_disabled: [403, 'HOME_GUESTBOOK_DISABLED'],
    home_guestbook_rate_limited: [429, 'HOME_GUESTBOOK_RATE_LIMITED'],
    home_guestbook_message_invalid: [400, 'HOME_GUESTBOOK_MESSAGE_INVALID'],
    home_appreciation_disabled: [403, 'HOME_APPRECIATION_DISABLED'],
    home_appreciation_rate_limited: [429, 'HOME_APPRECIATION_RATE_LIMITED'],
    home_helper_action_not_allowed: [403, 'HOME_HELPER_ACTION_NOT_ALLOWED'],
    home_helper_limit_reached: [409, 'HOME_HELPER_LIMIT_REACHED'],
    home_helper_target_invalid: [404, 'HOME_HELPER_TARGET_INVALID'],
    home_helper_too_far: [409, 'HOME_HELPER_TOO_FAR'],
    home_helper_state_conflict: [409, 'HOME_HELPER_STATE_CONFLICT'],
    crop_not_waterable: [409, 'CROP_NOT_WATERABLE'],
    home_visit_target_invalid: [404, 'HOME_VISIT_NOT_FOUND'],
    home_visit_policy_not_found: [404, 'HOME_VISIT_POLICY_NOT_FOUND'],
    home_visit_policy_transition_invalid: [409, 'HOME_VISIT_POLICY_TRANSITION_INVALID'],
    request_already_processed: [409, 'REQUEST_ALREADY_PROCESSED'],
    rate_limited: [429, 'RATE_LIMITED'],
  };
  const [statusCode, code] = mapping[status];
  throw new PublicApiError(statusCode, code);
}

async function operation<T>(invoke: () => Promise<T>): Promise<T> {
  try {
    return await invoke();
  } catch (error) {
    if (error instanceof HomeVisitPersistenceError) {
      throw new PublicApiError(503, 'HOME_VISITS_UNAVAILABLE');
    }
    throw error;
  }
}

function data(result: unknown, requestId: string) {
  if (typeof result === 'string') persistenceFailure(result as HomeVisitPersistenceStatus);
  return { success: true, data: result, requestId };
}

export function registerHomeVisitRoutes(
  app: FastifyInstance,
  options: {
    gateway: HomeVisitGateway;
    playerService: PlayerService;
    tokenAccessService: TokenAccessService;
    cookie: TokenAccessCookieOptions;
    adminGateway: AdminAuthGateway;
    logger: ServiceLogger;
    allowedOrigins: ReadonlySet<string>;
  },
): void {
  const wallet = (request: FastifyRequest, reply: FastifyReply) =>
    playerWallet(request, reply, options);
  const mutate = (request: FastifyRequest, reply: FastifyReply) => {
    assertTrustedBrowserMutation(request, options.allowedOrigins);
    disableResponseCaching(reply);
  };

  app.get(PLAYER_PREFIX, async (request, reply) => {
    disableResponseCaching(reply);
    return data(
      await operation(async () =>
        options.gateway.workspace(await wallet(request, reply), request.id),
      ),
      request.id,
    );
  });
  app.get(`${PLAYER_PREFIX}/game-test`, async (request, reply) => {
    disableResponseCaching(reply);
    await wallet(request, reply);
    return { success: true, data: options.gateway.gameTest(), requestId: request.id };
  });
  app.patch(`${PLAYER_PREFIX}/settings`, { bodyLimit: 4_096 }, async (request, reply) => {
    mutate(request, reply);
    return data(
      await operation(async () =>
        options.gateway.settings(
          await wallet(request, reply),
          parse(updateHomeSocialSettingsRequestSchema, request.body),
          request.id,
        ),
      ),
      request.id,
    );
  });
  app.post(`${PLAYER_PREFIX}/sessions`, { bodyLimit: 2_048 }, async (request, reply) => {
    mutate(request, reply);
    return data(
      await operation(async () =>
        options.gateway.start(
          await wallet(request, reply),
          parse(startHomeVisitRequestSchema, request.body),
          request.id,
        ),
      ),
      request.id,
    );
  });
  app.patch(
    `${PLAYER_PREFIX}/sessions/admissions`,
    { bodyLimit: 2_048 },
    async (request, reply) => {
      mutate(request, reply);
      return data(
        await operation(async () =>
          options.gateway.admissions(
            await wallet(request, reply),
            parse(admissionsRequestSchema, request.body),
            request.id,
          ),
        ),
        request.id,
      );
    },
  );
  app.post(`${PLAYER_PREFIX}/sessions/stop`, { bodyLimit: 2_048 }, async (request, reply) => {
    mutate(request, reply);
    return data(
      await operation(async () =>
        options.gateway.stop(
          await wallet(request, reply),
          parse(sessionRevisionRequestSchema, request.body),
          request.id,
        ),
      ),
      request.id,
    );
  });
  app.post(`${PLAYER_PREFIX}/invitations`, { bodyLimit: 2_048 }, async (request, reply) => {
    mutate(request, reply);
    return data(
      await operation(async () =>
        options.gateway.invite(
          await wallet(request, reply),
          parse(homeVisitInvitationRequestSchema, request.body),
          request.id,
        ),
      ),
      request.id,
    );
  });
  app.post(`${PLAYER_PREFIX}/invitations/revoke`, { bodyLimit: 2_048 }, async (request, reply) => {
    mutate(request, reply);
    return data(
      await operation(async () =>
        options.gateway.revokeInvitation(
          await wallet(request, reply),
          parse(revokeHomeVisitInvitationRequestSchema, request.body),
          request.id,
        ),
      ),
      request.id,
    );
  });
  app.post(`${PLAYER_PREFIX}/join`, { bodyLimit: 2_048 }, async (request, reply) => {
    mutate(request, reply);
    return data(
      await operation(async () =>
        options.gateway.join(
          await wallet(request, reply),
          parse(joinHomeVisitRequestSchema, request.body),
          request.id,
        ),
      ),
      request.id,
    );
  });
  app.post(`${PLAYER_PREFIX}/leave`, { bodyLimit: 2_048 }, async (request, reply) => {
    mutate(request, reply);
    return data(
      await operation(async () =>
        options.gateway.leave(
          await wallet(request, reply),
          parse(leaveHomeVisitRequestSchema, request.body),
          request.id,
        ),
      ),
      request.id,
    );
  });
  app.post(`${PLAYER_PREFIX}/interactions`, { bodyLimit: 2_048 }, async (request, reply) => {
    mutate(request, reply);
    return data(
      await operation(async () =>
        options.gateway.interact(
          await wallet(request, reply),
          parse(homeVisitInteractionRequestSchema, request.body),
          request.id,
        ),
      ),
      request.id,
    );
  });
  app.post(`${PLAYER_PREFIX}/guestbook`, { bodyLimit: 2_048 }, async (request, reply) => {
    mutate(request, reply);
    return data(
      await operation(async () =>
        options.gateway.guestbook(
          await wallet(request, reply),
          parse(homeGuestbookWriteRequestSchema, request.body),
          request.id,
        ),
      ),
      request.id,
    );
  });
  app.post(`${PLAYER_PREFIX}/appreciation`, { bodyLimit: 2_048 }, async (request, reply) => {
    mutate(request, reply);
    return data(
      await operation(async () =>
        options.gateway.appreciate(
          await wallet(request, reply),
          parse(homeAppreciationRequestSchema, request.body),
          request.id,
        ),
      ),
      request.id,
    );
  });
  app.post(`${PLAYER_PREFIX}/helpers/water`, { bodyLimit: 2_048 }, async (request, reply) => {
    mutate(request, reply);
    return data(
      await operation(async () =>
        options.gateway.helpWater(
          await wallet(request, reply),
          parse(homeHelperWaterRequestSchema, request.body),
          request.id,
        ),
      ),
      request.id,
    );
  });
  app.post(`${PLAYER_PREFIX}/moderation`, { bodyLimit: 2_048 }, async (request, reply) => {
    mutate(request, reply);
    return data(
      await operation(async () =>
        options.gateway.moderateVisitor(
          await wallet(request, reply),
          parse(homeVisitModerationRequestSchema, request.body),
          request.id,
        ),
      ),
      request.id,
    );
  });
  app.post(`${PLAYER_PREFIX}/reports`, { bodyLimit: 4_096 }, async (request, reply) => {
    mutate(request, reply);
    return data(
      await operation(async () =>
        options.gateway.report(
          await wallet(request, reply),
          parse(homeVisitReportRequestSchema, request.body),
          request.id,
        ),
      ),
      request.id,
    );
  });
  app.post(
    `${PLAYER_PREFIX}/guestbook/moderation`,
    { bodyLimit: 2_048 },
    async (request, reply) => {
      mutate(request, reply);
      return data(
        await operation(async () =>
          options.gateway.moderateGuestbook(
            await wallet(request, reply),
            parse(ownerGuestbookModerationRequestSchema, request.body),
            request.id,
          ),
        ),
        request.id,
      );
    },
  );

  app.get('/api/v1/admin/home-visits', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'home_visits.inspect',
    );
    return data(
      await operation(() =>
        options.gateway.adminWorkspace(
          identity,
          parse(adminHomeVisitQuerySchema, request.query),
          request.id,
        ),
      ),
      request.id,
    );
  });
  app.post('/api/v1/admin/home-visits/policies', { bodyLimit: 8_192 }, async (request, reply) => {
    mutate(request, reply);
    const identity = await authorizeAdminRequest(
      request,
      options.adminGateway,
      options.logger,
      'home_visits.policies.manage',
    );
    return data(
      await operation(() =>
        options.gateway.adminPolicySuccessor(
          identity,
          parse(adminHomeVisitPolicySuccessorSchema, request.body),
          request.id,
        ),
      ),
      request.id,
    );
  });
  app.post(
    '/api/v1/admin/home-visits/policies/:id/transition',
    { bodyLimit: 2_048 },
    async (request, reply) => {
      mutate(request, reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'home_visits.policies.manage',
      );
      const { id } = parse(uuidParams, request.params);
      return data(
        await operation(() =>
          options.gateway.adminPolicyTransition(
            identity,
            id,
            parse(adminHomeVisitPolicyTransitionSchema, request.body),
            request.id,
          ),
        ),
        request.id,
      );
    },
  );
  app.post(
    '/api/v1/admin/home-visits/sessions/:id/close',
    { bodyLimit: 2_048 },
    async (request, reply) => {
      mutate(request, reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'home_visits.manage',
      );
      const { id } = parse(uuidParams, request.params);
      return data(
        await operation(() =>
          options.gateway.adminCloseSession(
            identity,
            id,
            parse(adminHomeVisitSessionCloseSchema, request.body),
            request.id,
          ),
        ),
        request.id,
      );
    },
  );
  app.post(
    '/api/v1/admin/home-visits/guestbook/:id/moderate',
    { bodyLimit: 2_048 },
    async (request, reply) => {
      mutate(request, reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'home_visits.guestbooks.moderate',
      );
      const { id } = parse(uuidParams, request.params);
      return data(
        await operation(() =>
          options.gateway.adminModerateGuestbook(
            identity,
            id,
            parse(adminHomeGuestbookModerationSchema, request.body),
            request.id,
          ),
        ),
        request.id,
      );
    },
  );
  app.post(
    '/api/v1/admin/home-visits/reports/:id/transition',
    { bodyLimit: 2_048 },
    async (request, reply) => {
      mutate(request, reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'home_visits.manage',
      );
      const { id } = parse(uuidParams, request.params);
      return data(
        await operation(() =>
          options.gateway.adminTransitionReport(
            identity,
            id,
            parse(adminHomeVisitReportTransitionSchema, request.body),
            request.id,
          ),
        ),
        request.id,
      );
    },
  );
  app.post(
    '/api/v1/admin/home-visits/reconciliation',
    { bodyLimit: 2_048 },
    async (request, reply) => {
      mutate(request, reply);
      const identity = await authorizeAdminRequest(
        request,
        options.adminGateway,
        options.logger,
        'home_visits.reconciliation.manage',
      );
      return data(
        await operation(() =>
          options.gateway.adminReconcile(
            identity,
            parse(adminHomeVisitReconciliationSchema, request.body),
            request.id,
          ),
        ),
        request.id,
      );
    },
  );
}
