import { z } from 'zod';

import { operationsSummarySchema, playerDirectorySortSchema } from '@starville/player-operations';
import { displayNameSchema, MAP_IDS } from '@starville/game-core';

import type { ServiceLogger } from '../contracts.js';
import { PublicApiError } from '../errors.js';
import type {
  AdminOperationsGateway,
  AdminOperationsService,
  OperationsHealthReader,
  PlayerActionKey,
} from './contracts.js';

const integerQuery = (minimum: number, maximum: number, fallback: number) =>
  z.preprocess(
    (value) => (value === undefined ? fallback : value),
    z.coerce.number().int().min(minimum).max(maximum),
  );

function containsUnsafeReasonCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 || character === '<' || character === '>';
  });
}

const directoryQuerySchema = z
  .object({
    page: integerQuery(1, 10_000, 1),
    pageSize: integerQuery(1, 100, 25),
    search: z
      .string()
      .max(128)
      .optional()
      .transform((value) => (value ?? '').normalize('NFKC').trim()),
    status: z.enum(['all', 'active', 'suspended']).default('all'),
    rename: z.enum(['all', 'required', 'clear']).default('all'),
    mapId: z.enum(['all', ...MAP_IDS]).default('all'),
    recentDays: z.preprocess(
      (value) => (value === undefined || value === '' ? undefined : value),
      z.coerce.number().int().min(1).max(365).optional(),
    ),
    sort: playerDirectorySortSchema.default('last_entered_at'),
    direction: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

const activityQuerySchema = z
  .object({
    limit: integerQuery(1, 100, 25),
    accessPage: integerQuery(1, 10_000, 1),
    accessPageSize: z.preprocess(
      (value) => (value === undefined ? 10 : Number(value)),
      z.union([z.literal(10), z.literal(50), z.literal(100)]),
    ),
  })
  .strict();

const actionInputSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    reason: z
      .string()
      .trim()
      .min(12)
      .max(500)
      .refine((value) => !containsUnsafeReasonCharacters(value)),
    displayName: displayNameSchema.optional(),
  })
  .strict();

const playerIdSchema = z.uuid();

function invalidRequest(): never {
  throw new PublicApiError(400, 'INVALID_PLAYER_OPERATION');
}

async function trustedOperation<Result>(operation: () => Promise<Result>): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PublicApiError) throw error;
    throw new PublicApiError(503, 'OPERATIONS_UNAVAILABLE');
  }
}

export function createAdminOperationsService(options: {
  readonly gateway: AdminOperationsGateway;
  readonly healthReader: OperationsHealthReader;
  readonly logger: ServiceLogger;
  readonly actionRateLimit: number;
}): AdminOperationsService {
  const { gateway, healthReader, logger, actionRateLimit } = options;

  return {
    async listPlayers(identity, query) {
      const parsed = directoryQuerySchema.safeParse(query);
      if (!parsed.success) return invalidRequest();
      const { recentDays, ...requiredQuery } = parsed.data;
      return trustedOperation(() =>
        gateway.listPlayers(
          identity,
          recentDays === undefined ? requiredQuery : { ...requiredQuery, recentDays },
        ),
      );
    },

    async getPlayer(identity, playerId) {
      const parsedId = playerIdSchema.safeParse(playerId);
      if (!parsedId.success) return invalidRequest();
      const player = await trustedOperation(() => gateway.getPlayer(identity, parsedId.data));
      if (player === 'not_found') throw new PublicApiError(404, 'PLAYER_NOT_FOUND');
      return player;
    },

    async getPlayerActivity(identity, playerId, query) {
      const parsedId = playerIdSchema.safeParse(playerId);
      const parsedQuery = activityQuerySchema.safeParse(query);
      if (!parsedId.success || !parsedQuery.success) return invalidRequest();
      const activity = await trustedOperation(() =>
        gateway.getPlayerActivity(identity, parsedId.data, parsedQuery.data),
      );
      if (activity === 'not_found') throw new PublicApiError(404, 'PLAYER_NOT_FOUND');
      return activity;
    },

    async getOperationsSummary(identity, requestId) {
      const [summary, services] = await trustedOperation(() =>
        Promise.all([gateway.getSummary(identity), healthReader.read(requestId)]),
      );
      return operationsSummarySchema.parse({ ...summary, services });
    },

    async performPlayerAction(identity, playerId, action: PlayerActionKey, body, requestId) {
      const parsedId = playerIdSchema.safeParse(playerId);
      const parsedBody = actionInputSchema.safeParse(body);
      if (!parsedId.success || !parsedBody.success) return invalidRequest();
      if (action === 'rename' && parsedBody.data.displayName === undefined) return invalidRequest();
      if (action !== 'rename' && parsedBody.data.displayName !== undefined) return invalidRequest();
      const operationInput =
        parsedBody.data.displayName === undefined
          ? { expectedVersion: parsedBody.data.expectedVersion, reason: parsedBody.data.reason }
          : {
              expectedVersion: parsedBody.data.expectedVersion,
              reason: parsedBody.data.reason,
              displayName: parsedBody.data.displayName,
            };

      const result = await trustedOperation(() =>
        gateway.performPlayerAction(
          identity,
          parsedId.data,
          action,
          operationInput,
          requestId,
          actionRateLimit,
        ),
      );

      if (result === 'not_found') throw new PublicApiError(404, 'PLAYER_NOT_FOUND');
      if (result === 'rate_limited') throw new PublicApiError(429, 'RATE_LIMITED');
      if (result === 'version_conflict') {
        throw new PublicApiError(409, 'PLAYER_VERSION_CONFLICT');
      }
      if ('stateConflictCode' in result) {
        if (result.stateConflictCode === 'PLAYER_NAME_UNAVAILABLE')
          throw new PublicApiError(409, 'PLAYER_NAME_UNAVAILABLE');
        if (result.stateConflictCode === 'PLAYER_NAME_UNCHANGED')
          throw new PublicApiError(409, 'PLAYER_NAME_UNCHANGED');
        throw new PublicApiError(409, 'PLAYER_OPERATION_CONFLICT');
      }

      logger.child({ requestId }).info('admin.player_operation.completed', {
        action,
        playerProfileId: result.playerId,
        revokedSessionCount: result.revokedSessionCount,
      });
      return result;
    },
  };
}
