import { randomUUID } from 'node:crypto';

import type { TokenAccessServerConfig } from '@starville/config/server';
import {
  SolanaVerificationError,
  validateSolanaAddress,
  verifySolanaMessageSignature,
} from '@starville/solana';
import {
  createCanonicalWalletMessage,
  decimalAmountToRaw,
  parseCanonicalWalletMessage,
  rawAmountToDecimal,
  type TokenAccessSessionView,
} from '@starville/wallet-access';
import {
  generateAccessSessionToken,
  generateWalletNonce,
  hashAccessSessionToken,
  hashesEqual,
  sha256Hex,
} from '@starville/wallet-access/server';

import type { EnvironmentName } from '@starville/shared-types';

import type { ServiceLogger } from '../contracts.js';
import { PublicApiError } from '../errors.js';
import type {
  AdminGatewayIdentity,
  ConsumedChallengeConfig,
  PersistedAccessSession,
  PersistedChallenge,
  RuntimeTokenGateConfig,
  TokenAccessGateway,
  TokenAccessOperationResult,
  TokenAccessService,
  TokenBalanceVerifier,
  WalletAccessEventInput,
} from './contracts.js';
import { TokenAccessPersistenceError } from './gateway.js';

export interface CreateTokenAccessServiceOptions {
  readonly environment: EnvironmentName;
  readonly config: TokenAccessServerConfig;
  readonly gateway: TokenAccessGateway;
  readonly verifier: TokenBalanceVerifier;
  readonly logger: ServiceLogger;
  readonly clock?: () => Date;
  readonly createId?: () => string;
  readonly createNonce?: () => string;
  readonly createSessionToken?: () => string;
}

function isPersistedChallenge(value: PersistedChallenge | string): value is PersistedChallenge {
  return typeof value !== 'string';
}

function isConsumedConfig(
  value: ConsumedChallengeConfig | string,
): value is ConsumedChallengeConfig {
  return typeof value !== 'string';
}

function isPersistedSession(
  value: PersistedAccessSession | string,
): value is PersistedAccessSession {
  return typeof value !== 'string';
}

function mapPersistenceError(error: unknown): never {
  if (error instanceof TokenAccessPersistenceError && error.code === 'AUTHORIZATION_DENIED') {
    throw new PublicApiError(403, 'ADMIN_ACCESS_DENIED');
  }

  if (error instanceof TokenAccessPersistenceError && error.code === 'CONFIG_VERSION_CONFLICT') {
    throw new PublicApiError(409, 'CONFIG_VERSION_CONFLICT');
  }

  throw new PublicApiError(503, 'PERSISTENCE_UNAVAILABLE');
}

function mapRpcError(error: unknown): never {
  if (error instanceof SolanaVerificationError && error.code === 'INVALID_ADDRESS') {
    throw new PublicApiError(400, 'INVALID_WALLET_ADDRESS');
  }

  throw new PublicApiError(503, 'RPC_UNAVAILABLE');
}

function accessView(
  config: Pick<RuntimeTokenGateConfig, 'network' | 'symbol' | 'requiredAmount'>,
  access: TokenAccessSessionView['access'],
  values: Partial<
    Omit<TokenAccessSessionView, 'access' | 'network' | 'symbol' | 'requiredAmount'>
  > = {},
): TokenAccessSessionView {
  return {
    access,
    network: config.network,
    symbol: config.symbol,
    requiredAmount: config.requiredAmount,
    ...values,
  };
}

function publicConfig(config: RuntimeTokenGateConfig) {
  return {
    enabled: config.enabled,
    availability: config.availability,
    network: config.network,
    symbol: config.symbol,
    mintAddress: config.mintAddress,
    requiredAmount: config.requiredAmount,
    recheckIntervalSeconds: config.recheckIntervalSeconds,
  } as const;
}

export function createTokenAccessService({
  environment,
  config,
  gateway,
  verifier,
  logger,
  clock = () => new Date(),
  createId = randomUUID,
  createNonce = generateWalletNonce,
  createSessionToken = generateAccessSessionToken,
}: CreateTokenAccessServiceOptions): TokenAccessService {
  const environmentKey = environment;
  const landingUri = new URL(config.landingUrl).origin;
  const domain = new URL(landingUri).host;

  async function runtimeConfig(): Promise<RuntimeTokenGateConfig> {
    try {
      const current = await gateway.getRuntimeConfig(environmentKey, config.network);

      if (current === undefined) {
        throw new PublicApiError(503, 'TOKEN_GATE_UNAVAILABLE');
      }

      return config.gateEnabled
        ? current
        : { ...current, enabled: false, availability: 'disabled' as const };
    } catch (error) {
      if (error instanceof PublicApiError) {
        throw error;
      }
      return mapPersistenceError(error);
    }
  }

  async function recordEvent(event: WalletAccessEventInput): Promise<void> {
    try {
      await gateway.recordEvent(event);
    } catch (error) {
      logger.child({ requestId: event.requestId }).warn('wallet.access.audit_failed', { error });
    }
  }

  function assertAvailable(current: RuntimeTokenGateConfig): void {
    if (
      current.availability !== 'available' ||
      !current.enabled ||
      current.mintAddress === null ||
      current.tokenProgram === null ||
      current.decimals === null ||
      current.requiredAmountRaw === null
    ) {
      throw new PublicApiError(503, 'TOKEN_GATE_UNAVAILABLE');
    }
  }

  function sessionView(session: PersistedAccessSession): TokenAccessSessionView {
    const recheckAfter = new Date(
      Date.parse(session.lastBalanceCheckAt) + session.recheckIntervalSeconds * 1_000,
    ).toISOString();

    return accessView(session, 'granted', {
      walletAddress: session.walletAddress,
      observedAmount: rawAmountToDecimal(session.observedAmountRaw, session.decimals),
      expiresAt: session.expiresAt,
      recheckAfter,
    });
  }

  async function loadSession(rawToken: string | undefined): Promise<{
    readonly hash?: string;
    readonly value: PersistedAccessSession | string;
  }> {
    if (rawToken === undefined || !/^[A-Za-z0-9_-]{43}$/u.test(rawToken)) {
      return { value: 'none' };
    }

    const hash = hashAccessSessionToken(rawToken, config.cookieSecret);

    try {
      return { hash, value: await gateway.getSession(hash) };
    } catch (error) {
      return mapPersistenceError(error);
    }
  }

  async function performRecheck(
    sessionTokenHash: string,
    session: PersistedAccessSession,
    requestId: string,
    rateLimitBehavior: 'return_session' | 'throw',
  ): Promise<TokenAccessOperationResult> {
    const minimumIntervalSeconds = Math.max(1, Math.ceil(60 / config.rateLimits.rechecksPerMinute));
    const claimLeaseSeconds = Math.ceil(
      (config.rpcTimeoutMs * config.rpcMaximumAttempts * 3) / 1_000 + 5,
    );
    const claimId = createId();
    let claimStatus;

    try {
      claimStatus = await gateway.claimSessionRecheck({
        sessionTokenHash,
        claimId,
        requestId,
        minimumIntervalSeconds,
        claimLeaseSeconds,
        rateLimit: config.rateLimits.rechecksPerMinute,
      });
    } catch (error) {
      return mapPersistenceError(error);
    }

    if (claimStatus === 'rate_limited') {
      if (rateLimitBehavior === 'return_session') {
        return { view: sessionView(session) };
      }
      throw new PublicApiError(429, 'RATE_LIMITED');
    }

    if (claimStatus !== 'claimed') {
      return { view: accessView(session, 'revoked'), clearCookie: true };
    }

    let balance;

    try {
      balance = await verifier.verifyBalance(
        session.walletAddress,
        session.mintAddress,
        session.commitment,
      );
    } catch (error) {
      await gateway
        .revokeSession(sessionTokenHash, 'administrative', requestId)
        .catch(() => undefined);
      await recordEvent({
        walletAddress: session.walletAddress,
        event: 'wallet.rpc.unavailable',
        result: 'error',
        reasonCode: 'RPC_UNAVAILABLE',
        configId: session.configId,
        configVersion: session.configVersion,
        sessionId: session.sessionId,
        requestId,
      });
      return mapRpcError(error);
    }

    if (
      balance.mintAddress !== session.mintAddress ||
      balance.tokenProgram !== session.tokenProgram ||
      balance.decimals !== session.decimals
    ) {
      await gateway
        .revokeSession(sessionTokenHash, 'administrative', requestId)
        .catch(() => undefined);
      throw new PublicApiError(503, 'TOKEN_GATE_UNAVAILABLE');
    }

    let status;

    try {
      status = await gateway.updateSessionBalance({
        sessionTokenHash,
        claimId,
        observedBalanceRaw: balance.rawAmount.toString(),
        checkedSlot: BigInt(balance.slot),
        requestId,
      });
    } catch (error) {
      return mapPersistenceError(error);
    }

    if (status === 'stale_slot') {
      await recordEvent({
        walletAddress: session.walletAddress,
        event: 'wallet.rpc.unavailable',
        result: 'error',
        reasonCode: 'STALE_BALANCE_SLOT',
        configId: session.configId,
        configVersion: session.configVersion,
        sessionId: session.sessionId,
        requestId,
      });
      throw new PublicApiError(503, 'RPC_UNAVAILABLE');
    }

    if (status === 'insufficient_balance') {
      return {
        view: accessView(session, 'insufficient_balance', {
          walletAddress: session.walletAddress,
          observedAmount: rawAmountToDecimal(balance.rawAmount, session.decimals),
        }),
        clearCookie: true,
      };
    }

    if (status !== 'active') {
      return { view: accessView(session, 'revoked'), clearCookie: true };
    }

    const checkedAt = clock();
    return {
      view: accessView(session, 'granted', {
        walletAddress: session.walletAddress,
        observedAmount: rawAmountToDecimal(balance.rawAmount, session.decimals),
        expiresAt: session.expiresAt,
        recheckAfter: new Date(
          checkedAt.getTime() + session.recheckIntervalSeconds * 1_000,
        ).toISOString(),
      }),
    };
  }

  return {
    async getPublicConfig() {
      return publicConfig(await runtimeConfig());
    },

    async createChallenge(input) {
      const current = await runtimeConfig();
      assertAvailable(current);

      if (input.network !== config.network) {
        throw new PublicApiError(400, 'NETWORK_MISMATCH');
      }

      try {
        validateSolanaAddress(input.walletAddress);
      } catch (error) {
        return mapRpcError(error);
      }

      const challengeId = createId();
      const nonce = createNonce();
      const issuedAt = clock();
      const expiresAt = new Date(issuedAt.getTime() + config.challengeTtlSeconds * 1_000);
      const message = createCanonicalWalletMessage({
        domain,
        uri: landingUri,
        walletAddress: input.walletAddress,
        network: input.network,
        nonce,
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        challengeId,
      });

      let status;
      try {
        status = await gateway.createChallenge({
          challengeId,
          environmentKey,
          walletAddress: input.walletAddress,
          network: input.network,
          nonceHash: sha256Hex(nonce),
          messageHash: sha256Hex(message),
          domain,
          uri: landingUri,
          issuedAt: issuedAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          requestId: input.requestId,
          ipHash: input.ipHash,
          ...(input.userAgentHash === undefined ? {} : { userAgentHash: input.userAgentHash }),
          rateLimit: config.rateLimits.challengesPerMinute,
        });
      } catch (error) {
        return mapPersistenceError(error);
      }

      if (status === 'rate_limited') {
        throw new PublicApiError(429, 'RATE_LIMITED');
      }
      if (status !== 'created') {
        throw new PublicApiError(503, 'TOKEN_GATE_UNAVAILABLE');
      }

      return { challengeId, message, expiresAt: expiresAt.toISOString() };
    },

    async verify(input) {
      let challenge;
      try {
        challenge = await gateway.loadChallenge(
          input.challengeId,
          input.walletAddress,
          input.ipHash,
          config.rateLimits.verificationsPerFiveMinutes,
        );
      } catch (error) {
        return mapPersistenceError(error);
      }

      if (challenge === 'rate_limited') {
        throw new PublicApiError(429, 'RATE_LIMITED');
      }
      if (challenge === 'expired') {
        throw new PublicApiError(409, 'CHALLENGE_EXPIRED');
      }
      if (!isPersistedChallenge(challenge)) {
        throw new PublicApiError(409, 'CHALLENGE_INVALID');
      }

      let parsed;
      try {
        parsed = parseCanonicalWalletMessage(input.message);
      } catch {
        throw new PublicApiError(422, 'CHALLENGE_INVALID');
      }

      const exactFieldsMatch =
        parsed.challengeId === challenge.challengeId &&
        parsed.walletAddress === challenge.walletAddress &&
        parsed.walletAddress === input.walletAddress &&
        parsed.network === challenge.network &&
        parsed.network === input.network &&
        parsed.domain === challenge.domain &&
        parsed.uri === challenge.uri &&
        Date.parse(parsed.issuedAt) === Date.parse(challenge.issuedAt) &&
        Date.parse(parsed.expiresAt) === Date.parse(challenge.expiresAt) &&
        hashesEqual(sha256Hex(parsed.nonce), challenge.nonceHash) &&
        hashesEqual(sha256Hex(input.message), challenge.messageHash);

      if (!exactFieldsMatch) {
        await recordEvent({
          walletAddress: input.walletAddress,
          event: 'wallet.signature.denied',
          result: 'denied',
          reasonCode: 'CHALLENGE_MISMATCH',
          configId: challenge.configId,
          configVersion: challenge.configVersion,
          challengeId: challenge.challengeId,
          requestId: input.requestId,
        });
        throw new PublicApiError(422, 'CHALLENGE_INVALID');
      }

      if (
        !verifySolanaMessageSignature({
          walletAddress: input.walletAddress,
          message: input.message,
          signatureBase64: input.signature,
        })
      ) {
        await recordEvent({
          walletAddress: input.walletAddress,
          event: 'wallet.signature.denied',
          result: 'denied',
          reasonCode: 'SIGNATURE_INVALID',
          configId: challenge.configId,
          configVersion: challenge.configVersion,
          challengeId: challenge.challengeId,
          requestId: input.requestId,
        });
        throw new PublicApiError(422, 'SIGNATURE_INVALID');
      }

      await recordEvent({
        walletAddress: input.walletAddress,
        event: 'wallet.signature.verified',
        result: 'success',
        configId: challenge.configId,
        configVersion: challenge.configVersion,
        challengeId: challenge.challengeId,
        requestId: input.requestId,
      });

      let consumed;
      try {
        consumed = await gateway.consumeChallenge({
          challengeId: challenge.challengeId,
          walletAddress: input.walletAddress,
          network: input.network,
          nonceHash: challenge.nonceHash,
          messageHash: challenge.messageHash,
        });
      } catch (error) {
        return mapPersistenceError(error);
      }

      if (!isConsumedConfig(consumed)) {
        throw new PublicApiError(409, 'CHALLENGE_INVALID');
      }

      let balance;
      try {
        balance = await verifier.verifyBalance(
          input.walletAddress,
          consumed.mintAddress,
          consumed.commitment,
        );
      } catch (error) {
        await recordEvent({
          walletAddress: input.walletAddress,
          event: 'wallet.rpc.unavailable',
          result: 'error',
          reasonCode: 'RPC_UNAVAILABLE',
          configId: consumed.configId,
          configVersion: consumed.configVersion,
          challengeId: consumed.challengeId,
          requestId: input.requestId,
        });
        return mapRpcError(error);
      }

      if (
        balance.mintAddress !== consumed.mintAddress ||
        balance.tokenProgram !== consumed.tokenProgram ||
        balance.decimals !== consumed.decimals
      ) {
        throw new PublicApiError(503, 'TOKEN_GATE_UNAVAILABLE');
      }

      const requiredRaw = BigInt(consumed.requiredAmountRaw);

      if (balance.rawAmount < requiredRaw) {
        await recordEvent({
          walletAddress: input.walletAddress,
          event: 'wallet.access.insufficient',
          result: 'denied',
          reasonCode: 'INSUFFICIENT_BALANCE',
          configId: consumed.configId,
          configVersion: consumed.configVersion,
          observedBalanceRaw: balance.rawAmount.toString(),
          requiredBalanceRaw: consumed.requiredAmountRaw,
          checkedSlot: BigInt(balance.slot),
          challengeId: consumed.challengeId,
          requestId: input.requestId,
        });

        return {
          view: accessView(consumed, 'insufficient_balance', {
            walletAddress: input.walletAddress,
            observedAmount: rawAmountToDecimal(balance.rawAmount, consumed.decimals),
          }),
          clearCookie: true,
        };
      }

      const rawSessionToken = createSessionToken();
      const sessionTokenHash = hashAccessSessionToken(rawSessionToken, config.cookieSecret);
      const expiresAt = new Date(clock().getTime() + consumed.sessionTtlSeconds * 1_000);
      let sessionStatus;

      try {
        sessionStatus = await gateway.createSession({
          challengeId: consumed.challengeId,
          walletAddress: consumed.walletAddress,
          network: consumed.network,
          configId: consumed.configId,
          configVersion: consumed.configVersion,
          sessionTokenHash,
          observedBalanceRaw: balance.rawAmount.toString(),
          requiredBalanceRaw: consumed.requiredAmountRaw,
          checkedSlot: BigInt(balance.slot),
          expiresAt: expiresAt.toISOString(),
          requestId: input.requestId,
        });
      } catch (error) {
        return mapPersistenceError(error);
      }

      if (sessionStatus !== 'created') {
        throw new PublicApiError(409, 'CONFIG_VERSION_CONFLICT');
      }

      return {
        sessionToken: rawSessionToken,
        view: accessView(consumed, 'granted', {
          walletAddress: input.walletAddress,
          observedAmount: rawAmountToDecimal(balance.rawAmount, consumed.decimals),
          expiresAt: expiresAt.toISOString(),
          recheckAfter: new Date(
            clock().getTime() + consumed.recheckIntervalSeconds * 1_000,
          ).toISOString(),
        }),
      };
    },

    async getCurrentSession(rawToken, requestId) {
      const current = await runtimeConfig();

      if (!current.enabled) {
        if (rawToken !== undefined && /^[A-Za-z0-9_-]{43}$/u.test(rawToken)) {
          await gateway
            .revokeSession(
              hashAccessSessionToken(rawToken, config.cookieSecret),
              'administrative',
              requestId,
            )
            .catch(() => undefined);
        }

        return {
          view: accessView(current, 'configuration_changed'),
          ...(rawToken === undefined ? {} : { clearCookie: true }),
        };
      }

      const loaded = await loadSession(rawToken);

      if (!isPersistedSession(loaded.value)) {
        const state = ['expired', 'revoked', 'configuration_changed'].includes(loaded.value)
          ? (loaded.value as 'expired' | 'revoked' | 'configuration_changed')
          : 'none';
        return {
          view: accessView(current, state),
          ...(rawToken === undefined ? {} : { clearCookie: true }),
        };
      }

      if (loaded.hash !== undefined && loaded.value.recheckDue) {
        return performRecheck(loaded.hash, loaded.value, requestId, 'return_session');
      }

      return { view: sessionView(loaded.value) };
    },

    async recheck(rawToken, requestId) {
      const current = await runtimeConfig();

      if (!current.enabled) {
        throw new PublicApiError(503, 'TOKEN_GATE_UNAVAILABLE');
      }

      const loaded = await loadSession(rawToken);

      if (!isPersistedSession(loaded.value) || loaded.hash === undefined) {
        throw new PublicApiError(401, 'TOKEN_ACCESS_REQUIRED');
      }

      return performRecheck(loaded.hash, loaded.value, requestId, 'throw');
    },

    async revoke(rawToken, requestId, reason = 'disconnect') {
      if (rawToken === undefined || !/^[A-Za-z0-9_-]{43}$/u.test(rawToken)) {
        return false;
      }

      try {
        return await gateway.revokeSession(
          hashAccessSessionToken(rawToken, config.cookieSecret),
          reason,
          requestId,
        );
      } catch (error) {
        return mapPersistenceError(error);
      }
    },

    async getAdminConfig(identity: AdminGatewayIdentity) {
      try {
        const current = await gateway.getAdminConfig(identity, environmentKey, config.network);
        if (current === undefined) {
          throw new PublicApiError(503, 'TOKEN_GATE_UNAVAILABLE');
        }
        return current;
      } catch (error) {
        if (error instanceof PublicApiError) {
          throw error;
        }
        return mapPersistenceError(error);
      }
    },

    async validateAdminMint(identity, mintAddress, commitment, requestId) {
      let claimed;
      try {
        claimed = await gateway.claimAdminValidation(
          identity,
          requestId,
          config.rateLimits.adminValidationsPerMinute,
        );
      } catch (error) {
        return mapPersistenceError(error);
      }

      if (!claimed) {
        throw new PublicApiError(429, 'RATE_LIMITED');
      }

      try {
        const mint = await verifier.validateMint(mintAddress, commitment);
        return {
          network: config.network,
          mintAddress: mint.mintAddress,
          tokenProgram: mint.tokenProgram,
          decimals: mint.decimals,
          slot: String(mint.slot),
          commitment,
        };
      } catch (error) {
        return mapRpcError(error);
      }
    },

    async updateAdminConfig(identity, input, requestId) {
      if (input.network !== config.network) {
        throw new PublicApiError(400, 'NETWORK_MISMATCH');
      }

      const mint = await this.validateAdminMint(
        identity,
        input.mintAddress,
        input.commitment,
        requestId,
      );
      let requiredAmountRaw;

      try {
        requiredAmountRaw = decimalAmountToRaw(input.requiredAmount, mint.decimals).toString();
      } catch {
        throw new PublicApiError(422, 'INVALID_REQUEST');
      }

      try {
        return await gateway.updateAdminConfig(identity, environmentKey, {
          expectedConfigVersion: input.expectedConfigVersion,
          enabled: input.enabled,
          network: input.network,
          mintAddress: mint.mintAddress,
          tokenProgram: mint.tokenProgram,
          symbol: input.symbol,
          decimals: mint.decimals,
          requiredAmountRaw,
          requiredAmount: input.requiredAmount,
          commitment: input.commitment,
          sessionTtlSeconds: input.sessionTtlSeconds,
          recheckIntervalSeconds: input.recheckIntervalSeconds,
          validatedSlot: BigInt(mint.slot),
          reason: input.reason,
          requestId,
        });
      } catch (error) {
        return mapPersistenceError(error);
      }
    },
  };
}
