import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { tokenAccessAvailabilitySchema, walletNetworkSchema } from '@starville/wallet-access';

import type {
  AdminGatewayIdentity,
  AdminTokenGateUpdate,
  ChallengePersistenceInput,
  ConsumedChallengeConfig,
  PersistedAccessSession,
  PersistedChallenge,
  PersistenceStatus,
  RuntimeTokenGateConfig,
  TokenAccessGateway,
  WalletAccessEventInput,
} from './contracts.js';

const uuidSchema = z.uuid();
const statusSchema = z.enum([
  'active',
  'challenge_invalid',
  'claim_invalid',
  'claimed',
  'configuration_changed',
  'configuration_unavailable',
  'created',
  'expired',
  'insufficient_balance',
  'loaded',
  'none',
  'not_found',
  'rate_limited',
  'rejected',
  'revoked',
  'stale_slot',
  'used',
]);
const tokenProgramSchema = z.enum(['spl-token', 'spl-token-2022']);
const commitmentSchema = z.enum(['confirmed', 'finalized']);
const rawAmountSchema = z.string().regex(/^\d+$/u);

const runtimeConfigSchema = z.object({
  id: uuidSchema,
  environmentKey: z.string(),
  network: walletNetworkSchema,
  mintAddress: z.string().nullable(),
  tokenProgram: tokenProgramSchema.nullable(),
  symbol: z.string(),
  decimals: z.number().int().min(0).max(18).nullable(),
  requiredAmountRaw: rawAmountSchema.nullable(),
  requiredAmount: z.string(),
  enabled: z.boolean(),
  availability: tokenAccessAvailabilitySchema,
  commitment: commitmentSchema,
  sessionTtlSeconds: z.number().int(),
  recheckIntervalSeconds: z.number().int(),
  configVersion: z.number().int(),
  lastValidatedAt: z.string().nullable(),
  lastValidatedSlot: z.string().nullable(),
});

const challengeSchema = z.object({
  status: z.literal('loaded'),
  challengeId: uuidSchema,
  walletAddress: z.string(),
  network: walletNetworkSchema,
  configId: uuidSchema,
  configVersion: z.number().int(),
  nonceHash: z.string(),
  messageHash: z.string(),
  domain: z.string(),
  uri: z.string(),
  issuedAt: z.string(),
  expiresAt: z.string(),
});

const consumedChallengeSchema = z.object({
  status: z.literal('consumed'),
  challengeId: uuidSchema,
  walletAddress: z.string(),
  network: walletNetworkSchema,
  configId: uuidSchema,
  configVersion: z.number().int(),
  mintAddress: z.string(),
  tokenProgram: tokenProgramSchema,
  symbol: z.string(),
  decimals: z.number().int(),
  requiredAmountRaw: rawAmountSchema,
  requiredAmount: z.string(),
  commitment: commitmentSchema,
  sessionTtlSeconds: z.number().int(),
  recheckIntervalSeconds: z.number().int(),
});

const sessionSchema = z.object({
  status: z.literal('active'),
  sessionId: uuidSchema,
  walletAddress: z.string(),
  network: walletNetworkSchema,
  configId: uuidSchema,
  configVersion: z.number().int(),
  mintAddress: z.string(),
  tokenProgram: tokenProgramSchema,
  symbol: z.string(),
  decimals: z.number().int(),
  requiredAmountRaw: rawAmountSchema,
  requiredAmount: z.string(),
  observedAmountRaw: rawAmountSchema,
  checkedSlot: z.string(),
  lastBalanceCheckAt: z.string(),
  recheckIntervalSeconds: z.number().int(),
  recheckDue: z.boolean(),
  expiresAt: z.string(),
  commitment: commitmentSchema,
});

export class TokenAccessPersistenceError extends Error {
  readonly code: 'AUTHORIZATION_DENIED' | 'CONFIG_VERSION_CONFLICT' | 'PERSISTENCE_UNAVAILABLE';

  constructor(
    code: 'AUTHORIZATION_DENIED' | 'CONFIG_VERSION_CONFLICT' | 'PERSISTENCE_UNAVAILABLE',
  ) {
    super('Token-access persistence operation failed.');
    this.name = 'TokenAccessPersistenceError';
    this.code = code;
  }
}

function statusFrom(value: unknown): PersistenceStatus {
  return statusSchema.parse(z.object({ status: z.unknown() }).parse(value).status);
}

function withoutStatus<T extends Readonly<Record<string, unknown>>>(value: T): Omit<T, 'status'> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'status')) as Omit<
    T,
    'status'
  >;
}

function rpcErrorCode(
  error: unknown,
): 'AUTHORIZATION_DENIED' | 'CONFIG_VERSION_CONFLICT' | 'PERSISTENCE_UNAVAILABLE' {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.includes('CONFIG_VERSION_CONFLICT')
  ) {
    return 'CONFIG_VERSION_CONFLICT';
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    /ADMIN_ACCESS_DENIED|MISSING_PERMISSION/u.test(error.message)
  ) {
    return 'AUTHORIZATION_DENIED';
  }

  return 'PERSISTENCE_UNAVAILABLE';
}

async function executeRpc(
  client: SupabaseClient,
  operation: string,
  parameters: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const { data, error } = await client.rpc(operation, parameters);

  if (error !== null) {
    throw new TokenAccessPersistenceError(rpcErrorCode(error));
  }

  return data;
}

export function createSupabaseTokenAccessGateway(client: SupabaseClient): TokenAccessGateway {
  return {
    async getRuntimeConfig(environmentKey, network) {
      const data = await executeRpc(client, 'get_token_gate_runtime_config', {
        p_environment_key: environmentKey,
        p_network: network,
      });
      const parsed = runtimeConfigSchema.safeParse(data);
      return parsed.success ? parsed.data : undefined;
    },

    async createChallenge(input: ChallengePersistenceInput) {
      const data = await executeRpc(client, 'create_wallet_auth_challenge', {
        p_challenge_id: input.challengeId,
        p_environment_key: input.environmentKey,
        p_wallet_address: input.walletAddress,
        p_network: input.network,
        p_nonce_hash: input.nonceHash,
        p_message_hash: input.messageHash,
        p_domain: input.domain,
        p_uri: input.uri,
        p_issued_at: input.issuedAt,
        p_expires_at: input.expiresAt,
        p_request_id: input.requestId,
        p_ip_hash: input.ipHash,
        p_user_agent_hash: input.userAgentHash ?? null,
        p_rate_limit: input.rateLimit,
      });
      return statusFrom(data);
    },

    async loadChallenge(challengeId, walletAddress, ipHash, verificationLimit) {
      const data = await executeRpc(client, 'load_wallet_auth_challenge', {
        p_challenge_id: challengeId,
        p_wallet_address: walletAddress,
        p_ip_hash: ipHash,
        p_verification_limit: verificationLimit,
      });
      const status = statusFrom(data);

      if (status !== 'loaded') {
        return status;
      }

      return withoutStatus(challengeSchema.parse(data)) as PersistedChallenge;
    },

    async consumeChallenge(input) {
      const data = await executeRpc(client, 'consume_wallet_auth_challenge', {
        p_challenge_id: input.challengeId,
        p_wallet_address: input.walletAddress,
        p_network: input.network,
        p_nonce_hash: input.nonceHash,
        p_message_hash: input.messageHash,
      });
      const consumed = consumedChallengeSchema.safeParse(data);

      return consumed.success
        ? (withoutStatus(consumed.data) as ConsumedChallengeConfig)
        : statusFrom(data);
    },

    async createSession(input) {
      const data = await executeRpc(client, 'create_wallet_access_session', {
        p_challenge_id: input.challengeId,
        p_wallet_address: input.walletAddress,
        p_network: input.network,
        p_config_id: input.configId,
        p_config_version: input.configVersion,
        p_session_token_hash: input.sessionTokenHash,
        p_observed_balance_raw: input.observedBalanceRaw,
        p_required_balance_raw: input.requiredBalanceRaw,
        p_checked_slot: input.checkedSlot.toString(),
        p_expires_at: input.expiresAt,
        p_request_id: input.requestId,
      });
      return statusFrom(data);
    },

    async getSession(sessionTokenHash) {
      const data = await executeRpc(client, 'get_wallet_access_session', {
        p_session_token_hash: sessionTokenHash,
      });
      const session = sessionSchema.safeParse(data);

      return session.success
        ? (withoutStatus(session.data) as PersistedAccessSession)
        : statusFrom(data);
    },

    async claimSessionRecheck(input) {
      const data = await executeRpc(client, 'claim_wallet_access_recheck', {
        p_session_token_hash: input.sessionTokenHash,
        p_claim_id: input.claimId,
        p_request_id: input.requestId,
        p_minimum_interval_seconds: input.minimumIntervalSeconds,
        p_claim_lease_seconds: input.claimLeaseSeconds,
        p_rate_limit: input.rateLimit,
      });
      return statusFrom(data);
    },

    async updateSessionBalance(input) {
      const data = await executeRpc(client, 'update_wallet_access_session_balance', {
        p_session_token_hash: input.sessionTokenHash,
        p_claim_id: input.claimId,
        p_observed_balance_raw: input.observedBalanceRaw,
        p_checked_slot: input.checkedSlot.toString(),
        p_request_id: input.requestId,
      });
      return statusFrom(data);
    },

    async revokeSession(sessionTokenHash, reason, requestId) {
      return z.boolean().parse(
        await executeRpc(client, 'revoke_wallet_access_session', {
          p_session_token_hash: sessionTokenHash,
          p_reason: reason,
          p_request_id: requestId,
        }),
      );
    },

    async recordEvent(input: WalletAccessEventInput) {
      await executeRpc(client, 'record_wallet_access_event', {
        p_wallet_address: input.walletAddress ?? null,
        p_event: input.event,
        p_result: input.result,
        p_reason_code: input.reasonCode ?? null,
        p_config_id: input.configId ?? null,
        p_config_version: input.configVersion ?? null,
        p_observed_balance_raw: input.observedBalanceRaw ?? null,
        p_required_balance_raw: input.requiredBalanceRaw ?? null,
        p_checked_slot: input.checkedSlot?.toString() ?? null,
        p_challenge_id: input.challengeId ?? null,
        p_session_id: input.sessionId ?? null,
        p_request_id: input.requestId,
        p_metadata: input.metadata ?? {},
      });
    },

    async getAdminConfig(identity, environmentKey, network) {
      const data = await executeRpc(client, 'get_admin_token_gate_config', {
        p_user_id: identity.userId,
        p_auth_session_id: identity.authSessionId,
        p_assurance_level: identity.assuranceLevel,
        p_environment_key: environmentKey,
        p_network: network,
      });
      return runtimeConfigSchema.safeParse(data).data;
    },

    async claimAdminValidation(identity, requestId, rateLimit) {
      return z.boolean().parse(
        await executeRpc(client, 'claim_admin_token_gate_validation_slot', {
          p_user_id: identity.userId,
          p_auth_session_id: identity.authSessionId,
          p_assurance_level: identity.assuranceLevel,
          p_request_id: requestId,
          p_rate_limit: rateLimit,
        }),
      );
    },

    async updateAdminConfig(
      identity: AdminGatewayIdentity,
      environmentKey: string,
      update: AdminTokenGateUpdate,
    ): Promise<RuntimeTokenGateConfig> {
      const data = await executeRpc(client, 'update_admin_token_gate_config', {
        p_user_id: identity.userId,
        p_auth_session_id: identity.authSessionId,
        p_assurance_level: identity.assuranceLevel,
        p_environment_key: environmentKey,
        p_network: update.network,
        p_expected_config_version: update.expectedConfigVersion,
        p_enabled: update.enabled,
        p_mint_address: update.mintAddress,
        p_token_program: update.tokenProgram,
        p_symbol: update.symbol,
        p_decimals: update.decimals,
        p_required_amount_raw: update.requiredAmountRaw,
        p_required_display_amount: update.requiredAmount,
        p_commitment: update.commitment,
        p_session_ttl_seconds: update.sessionTtlSeconds,
        p_recheck_interval_seconds: update.recheckIntervalSeconds,
        p_validated_slot: update.validatedSlot.toString(),
        p_reason: update.reason,
        p_request_id: update.requestId,
      });
      return runtimeConfigSchema.parse(data);
    },
  };
}
