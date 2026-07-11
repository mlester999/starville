import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { describe, expect, it, vi } from 'vitest';

import type { TokenAccessServerConfig } from '@starville/config/server';
import { hashAccessSessionToken } from '@starville/wallet-access/server';

import type { LogContext, ServiceLogger } from '../contracts.js';
import { PublicApiError } from '../errors.js';
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
import { createTokenAccessService } from './service.js';

const now = new Date('2026-07-10T12:00:00.000Z');
const config: TokenAccessServerConfig = {
  network: 'solana:devnet',
  rpcUrl: 'https://rpc.example.test/private',
  landingUrl: 'http://localhost:3000',
  gateEnabled: true,
  mintAddress: 'So11111111111111111111111111111111111111112',
  symbol: 'STAR',
  requiredAmount: '1000',
  challengeTtlSeconds: 300,
  sessionTtlSeconds: 900,
  recheckIntervalSeconds: 300,
  cookieSecret: 'independent-cookie-secret-at-least-32-characters',
  commitment: 'confirmed',
  rpcTimeoutMs: 5_000,
  rpcMaximumAttempts: 2,
  rateLimits: {
    challengesPerMinute: 5,
    verificationsPerFiveMinutes: 10,
    rechecksPerMinute: 4,
    adminValidationsPerMinute: 5,
  },
};

const runtime: RuntimeTokenGateConfig = {
  id: '11111111-1111-4111-8111-111111111111',
  environmentKey: 'test',
  network: 'solana:devnet',
  mintAddress: config.mintAddress,
  tokenProgram: 'spl-token',
  symbol: 'STAR',
  decimals: 6,
  requiredAmountRaw: '1000000000',
  requiredAmount: '1000',
  enabled: true,
  availability: 'available',
  commitment: 'confirmed',
  sessionTtlSeconds: 900,
  recheckIntervalSeconds: 300,
  configVersion: 1,
  lastValidatedAt: now.toISOString(),
  lastValidatedSlot: '100',
};

class SilentLogger implements ServiceLogger {
  child(_bindings: LogContext): ServiceLogger {
    return this;
  }
  trace(_message: string): void {}
  debug(_message: string): void {}
  info(_message: string): void {}
  warn(_message: string): void {}
  error(_message: string): void {}
  fatal(_message: string): void {}
}

class MemoryGateway implements TokenAccessGateway {
  challenge?: PersistedChallenge;
  consumed = false;
  consumedCommitment: 'confirmed' | 'finalized' = 'confirmed';
  sessionInput?: { readonly sessionTokenHash: string };
  session?: PersistedAccessSession;
  adminUpdate?: AdminTokenGateUpdate;
  claimStatus: PersistenceStatus = 'claimed';
  updateStatus: PersistenceStatus = 'active';
  loadInput?: {
    readonly challengeId: string;
    readonly walletAddress: string;
    readonly ipHash: string;
    readonly verificationLimit: number;
  };
  claimInput?: {
    readonly sessionTokenHash: string;
    readonly claimId: string;
    readonly requestId: string;
    readonly minimumIntervalSeconds: number;
    readonly claimLeaseSeconds: number;
    readonly rateLimit: number;
  };
  events: WalletAccessEventInput[] = [];

  async getRuntimeConfig(): Promise<RuntimeTokenGateConfig> {
    return runtime;
  }

  async createChallenge(input: ChallengePersistenceInput): Promise<PersistenceStatus> {
    this.challenge = {
      challengeId: input.challengeId,
      walletAddress: input.walletAddress,
      network: input.network,
      configId: runtime.id,
      configVersion: runtime.configVersion,
      nonceHash: input.nonceHash,
      messageHash: input.messageHash,
      domain: input.domain,
      uri: input.uri,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
    };
    return 'created';
  }

  async loadChallenge(
    challengeId: string,
    walletAddress: string,
    ipHash: string,
    verificationLimit: number,
  ): Promise<PersistedChallenge | PersistenceStatus> {
    this.loadInput = { challengeId, walletAddress, ipHash, verificationLimit };
    if (this.consumed) return 'used';
    return this.challenge ?? 'not_found';
  }

  async consumeChallenge(): Promise<ConsumedChallengeConfig | PersistenceStatus> {
    if (this.consumed || this.challenge === undefined) return 'rejected';
    this.consumed = true;
    return {
      challengeId: this.challenge.challengeId,
      walletAddress: this.challenge.walletAddress,
      network: this.challenge.network,
      configId: runtime.id,
      configVersion: 1,
      mintAddress: runtime.mintAddress!,
      tokenProgram: 'spl-token',
      symbol: 'STAR',
      decimals: 6,
      requiredAmountRaw: '1000000000',
      requiredAmount: '1000',
      commitment: this.consumedCommitment,
      sessionTtlSeconds: 900,
      recheckIntervalSeconds: 300,
    };
  }

  async createSession(input: { readonly sessionTokenHash: string }): Promise<PersistenceStatus> {
    this.sessionInput = input;
    return 'created';
  }

  async getSession(): Promise<PersistedAccessSession | PersistenceStatus> {
    return this.session ?? 'none';
  }
  async claimSessionRecheck(
    input: NonNullable<MemoryGateway['claimInput']>,
  ): Promise<PersistenceStatus> {
    this.claimInput = input;
    return this.claimStatus;
  }
  async updateSessionBalance(): Promise<PersistenceStatus> {
    return this.updateStatus;
  }
  async revokeSession(): Promise<boolean> {
    return true;
  }
  async recordEvent(input: WalletAccessEventInput): Promise<void> {
    this.events.push(input);
  }
  async getAdminConfig(): Promise<RuntimeTokenGateConfig> {
    return runtime;
  }
  async claimAdminValidation(): Promise<boolean> {
    return true;
  }
  async updateAdminConfig(
    _identity: AdminGatewayIdentity,
    _environmentKey: string,
    update: AdminTokenGateUpdate,
  ): Promise<RuntimeTokenGateConfig> {
    this.adminUpdate = update;
    return runtime;
  }
}

function fixture(rawAmount = 1_000_000_000n) {
  const keypair = nacl.sign.keyPair();
  const walletAddress = new PublicKey(keypair.publicKey).toBase58();
  const gateway = new MemoryGateway();
  const verifier = {
    validateMint: vi.fn(async () => ({
      mintAddress: config.mintAddress,
      tokenProgram: 'spl-token' as const,
      decimals: 6,
      slot: 100,
    })),
    verifyBalance: vi.fn(async () => ({
      walletAddress,
      mintAddress: config.mintAddress,
      tokenProgram: 'spl-token' as const,
      decimals: 6,
      slot: 101,
      rawAmount,
    })),
  };
  const service = createTokenAccessService({
    environment: 'test',
    config,
    gateway,
    verifier,
    logger: new SilentLogger(),
    clock: () => now,
    createId: () => '22222222-2222-4222-8222-222222222222',
    createNonce: () => '0123456789abcdef0123456789abcdef',
    createSessionToken: () => 'a'.repeat(43),
  });
  return { service, gateway, verifier, keypair, walletAddress };
}

async function signedChallenge(rawAmount = 1_000_000_000n) {
  const value = fixture(rawAmount);
  const challenge = await value.service.createChallenge({
    walletAddress: value.walletAddress,
    network: 'solana:devnet',
    requestId: 'request-1',
    ipHash: 'b'.repeat(64),
  });
  const signature = nacl.sign.detached(
    new TextEncoder().encode(challenge.message),
    value.keypair.secretKey,
  );
  return { ...value, challenge, signature: Buffer.from(signature).toString('base64') };
}

function persistedSession(
  walletAddress: string,
  commitment: 'confirmed' | 'finalized' = 'confirmed',
): PersistedAccessSession {
  return {
    challengeId: '11111111-1111-4111-8111-111111111111',
    sessionId: '33333333-3333-4333-8333-333333333333',
    walletAddress,
    network: 'solana:devnet',
    configId: runtime.id,
    configVersion: runtime.configVersion,
    mintAddress: runtime.mintAddress!,
    tokenProgram: 'spl-token',
    symbol: 'STAR',
    decimals: 6,
    requiredAmountRaw: '1000000000',
    requiredAmount: '1000',
    commitment,
    sessionTtlSeconds: 900,
    recheckIntervalSeconds: 300,
    observedAmountRaw: '1000000000',
    checkedSlot: '100',
    lastBalanceCheckAt: '2026-07-10T11:55:00.000Z',
    recheckDue: true,
    expiresAt: '2026-07-10T12:15:00.000Z',
  };
}

describe('server-controlled wallet authentication', () => {
  it('creates a short-lived canonical message with no transaction authority', async () => {
    const { challenge, gateway, walletAddress } = await signedChallenge();

    expect(challenge.message).toContain(walletAddress);
    expect(challenge.message).toContain('URI: http://localhost:3000');
    expect(challenge.message).toContain('Network: solana:devnet');
    expect(challenge.message).toContain('does not authorize a blockchain transaction');
    expect(challenge.expiresAt).toBe('2026-07-10T12:05:00.000Z');
    expect(gateway.challenge?.nonceHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(gateway.challenge?.messageHash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('accepts a generated Ed25519 signature and stores only the HMAC session hash', async () => {
    const value = await signedChallenge();
    const result = await value.service.verify({
      challengeId: value.challenge.challengeId,
      walletAddress: value.walletAddress,
      network: 'solana:devnet',
      message: value.challenge.message,
      signature: value.signature,
      requestId: 'request-2',
      ipHash: 'c'.repeat(64),
    });

    expect(result.view).toMatchObject({ access: 'granted', observedAmount: '1000' });
    expect(result.sessionToken).toBe('a'.repeat(43));
    expect(value.gateway.sessionInput?.sessionTokenHash).toBe(
      hashAccessSessionToken('a'.repeat(43), config.cookieSecret),
    );
    expect(Object.values(value.gateway.sessionInput ?? {})).not.toContain('a'.repeat(43));
    expect(value.gateway.loadInput).toMatchObject({
      walletAddress: value.walletAddress,
      ipHash: 'c'.repeat(64),
      verificationLimit: 10,
    });
  });

  it('uses the commitment captured with the challenge for initial balance verification', async () => {
    const value = await signedChallenge();
    value.gateway.consumedCommitment = 'finalized';

    await value.service.verify({
      challengeId: value.challenge.challengeId,
      walletAddress: value.walletAddress,
      network: 'solana:devnet',
      message: value.challenge.message,
      signature: value.signature,
      requestId: 'request-finalized',
      ipHash: 'c'.repeat(64),
    });

    expect(value.verifier.verifyBalance).toHaveBeenCalledWith(
      value.walletAddress,
      config.mintAddress,
      'finalized',
    );
  });

  it('denies one raw unit below the requirement without creating a session', async () => {
    const value = await signedChallenge(999_999_999n);
    const result = await value.service.verify({
      challengeId: value.challenge.challengeId,
      walletAddress: value.walletAddress,
      network: 'solana:devnet',
      message: value.challenge.message,
      signature: value.signature,
      requestId: 'request-3',
      ipHash: 'c'.repeat(64),
    });

    expect(result.view).toMatchObject({
      access: 'insufficient_balance',
      observedAmount: '999.999999',
    });
    expect(value.gateway.sessionInput).toBeUndefined();
  });

  it('rejects modified signatures and replayed challenges', async () => {
    const value = await signedChallenge();
    await expect(
      value.service.verify({
        challengeId: value.challenge.challengeId,
        walletAddress: value.walletAddress,
        network: 'solana:devnet',
        message: value.challenge.message,
        signature: Buffer.alloc(64).toString('base64'),
        requestId: 'request-4',
        ipHash: 'c'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'SIGNATURE_INVALID' });

    await value.service.verify({
      challengeId: value.challenge.challengeId,
      walletAddress: value.walletAddress,
      network: 'solana:devnet',
      message: value.challenge.message,
      signature: value.signature,
      requestId: 'request-5',
      ipHash: 'c'.repeat(64),
    });
    await expect(
      value.service.verify({
        challengeId: value.challenge.challengeId,
        walletAddress: value.walletAddress,
        network: 'solana:devnet',
        message: value.challenge.message,
        signature: value.signature,
        requestId: 'request-6',
        ipHash: 'c'.repeat(64),
      }),
    ).rejects.toBeInstanceOf(PublicApiError);
  });

  it('consumes a valid challenge before an RPC failure so retry cannot reuse it', async () => {
    const value = await signedChallenge();
    value.verifier.verifyBalance.mockRejectedValueOnce(new Error('provider credential detail'));

    await expect(
      value.service.verify({
        challengeId: value.challenge.challengeId,
        walletAddress: value.walletAddress,
        network: 'solana:devnet',
        message: value.challenge.message,
        signature: value.signature,
        requestId: 'request-7',
        ipHash: 'c'.repeat(64),
      }),
    ).rejects.toMatchObject({ code: 'RPC_UNAVAILABLE' });
    expect(value.gateway.consumed).toBe(true);
  });

  it('claims an explicit session recheck before performing RPC work', async () => {
    const value = fixture();
    value.gateway.session = persistedSession(value.walletAddress, 'finalized');

    const result = await value.service.recheck('a'.repeat(43), 'recheck-request');

    expect(value.gateway.claimInput).toMatchObject({
      claimId: '22222222-2222-4222-8222-222222222222',
      minimumIntervalSeconds: 15,
      claimLeaseSeconds: 35,
      rateLimit: 4,
      requestId: 'recheck-request',
    });
    expect(value.verifier.verifyBalance).toHaveBeenCalledWith(
      value.walletAddress,
      config.mintAddress,
      'finalized',
    );
    expect(result.view).toMatchObject({ access: 'granted', observedAmount: '1000' });
  });

  it('does not amplify RPC work when an explicit recheck claim is rate limited', async () => {
    const value = fixture();
    value.gateway.session = persistedSession(value.walletAddress);
    value.gateway.claimStatus = 'rate_limited';

    await expect(value.service.recheck('a'.repeat(43), 'recheck-request')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    expect(value.verifier.verifyBalance).not.toHaveBeenCalled();
  });

  it('lets a concurrent automatic session read reuse its last trusted snapshot without another RPC', async () => {
    const value = fixture();
    value.gateway.session = persistedSession(value.walletAddress);
    value.gateway.claimStatus = 'rate_limited';

    const result = await value.service.getCurrentSession('a'.repeat(43), 'session-request');

    expect(result.view).toMatchObject({ access: 'granted', observedAmount: '1000' });
    expect(value.verifier.verifyBalance).not.toHaveBeenCalled();
  });

  it('fails closed when the trusted database rejects a regressed balance slot', async () => {
    const value = fixture();
    value.gateway.session = persistedSession(value.walletAddress);
    value.gateway.updateStatus = 'stale_slot';

    await expect(value.service.recheck('a'.repeat(43), 'recheck-request')).rejects.toMatchObject({
      code: 'RPC_UNAVAILABLE',
    });
    expect(value.gateway.events).toContainEqual(
      expect.objectContaining({ reasonCode: 'STALE_BALANCE_SLOT', result: 'error' }),
    );
  });

  it('uses the administrator-selected commitment for standalone mint validation', async () => {
    const value = fixture();
    const identity: AdminGatewayIdentity = {
      userId: '44444444-4444-4444-8444-444444444444',
      authSessionId: '55555555-5555-4555-8555-555555555555',
      assuranceLevel: 'aal1',
    };

    const validation = await value.service.validateAdminMint(
      identity,
      config.mintAddress,
      'finalized',
      'admin-validation',
    );

    expect(value.verifier.validateMint).toHaveBeenCalledWith(config.mintAddress, 'finalized');
    expect(validation.commitment).toBe('finalized');
  });

  it('validates an administrator update at the commitment that will be persisted', async () => {
    const value = fixture();
    const identity: AdminGatewayIdentity = {
      userId: '44444444-4444-4444-8444-444444444444',
      authSessionId: '55555555-5555-4555-8555-555555555555',
      assuranceLevel: 'aal1',
    };

    await value.service.updateAdminConfig(
      identity,
      {
        expectedConfigVersion: 1,
        enabled: true,
        network: 'solana:devnet',
        mintAddress: config.mintAddress,
        symbol: 'STAR',
        requiredAmount: '1000',
        commitment: 'finalized',
        sessionTtlSeconds: 900,
        recheckIntervalSeconds: 300,
        reason: 'Use finalized observations for access checks.',
      },
      'admin-update',
    );

    expect(value.verifier.validateMint).toHaveBeenCalledWith(config.mintAddress, 'finalized');
    expect(value.gateway.adminUpdate).toMatchObject({
      commitment: 'finalized',
      requestId: 'admin-update',
    });
  });
});
