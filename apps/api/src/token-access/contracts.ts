import type { AdminAuthorizationContext } from '@starville/admin-auth';
import type {
  TokenAccessPublicConfig,
  TokenAccessSessionView,
  WalletNetwork,
} from '@starville/wallet-access';

export interface RuntimeTokenGateConfig {
  readonly id: string;
  readonly environmentKey: string;
  readonly network: WalletNetwork;
  readonly mintAddress: string | null;
  readonly tokenProgram: 'spl-token' | 'spl-token-2022' | null;
  readonly symbol: string;
  readonly decimals: number | null;
  readonly requiredAmountRaw: string | null;
  readonly requiredAmount: string;
  readonly enabled: boolean;
  readonly availability: 'available' | 'disabled' | 'unconfigured';
  readonly commitment: 'confirmed' | 'finalized';
  readonly sessionTtlSeconds: number;
  readonly recheckIntervalSeconds: number;
  readonly configVersion: number;
  readonly lastValidatedAt: string | null;
  readonly lastValidatedSlot: string | null;
}

export interface PersistedChallenge {
  readonly challengeId: string;
  readonly walletAddress: string;
  readonly network: WalletNetwork;
  readonly configId: string;
  readonly configVersion: number;
  readonly nonceHash: string;
  readonly messageHash: string;
  readonly domain: string;
  readonly uri: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

export interface ConsumedChallengeConfig {
  readonly challengeId: string;
  readonly walletAddress: string;
  readonly network: WalletNetwork;
  readonly configId: string;
  readonly configVersion: number;
  readonly mintAddress: string;
  readonly tokenProgram: 'spl-token' | 'spl-token-2022';
  readonly symbol: string;
  readonly decimals: number;
  readonly requiredAmountRaw: string;
  readonly requiredAmount: string;
  readonly commitment: 'confirmed' | 'finalized';
  readonly sessionTtlSeconds: number;
  readonly recheckIntervalSeconds: number;
}

export interface PersistedAccessSession extends ConsumedChallengeConfig {
  readonly sessionId: string;
  readonly observedAmountRaw: string;
  readonly checkedSlot: string;
  readonly lastBalanceCheckAt: string;
  readonly recheckDue: boolean;
  readonly expiresAt: string;
}

export type PersistenceStatus =
  | 'active'
  | 'challenge_invalid'
  | 'claim_invalid'
  | 'claimed'
  | 'configuration_changed'
  | 'configuration_unavailable'
  | 'created'
  | 'expired'
  | 'insufficient_balance'
  | 'loaded'
  | 'none'
  | 'not_found'
  | 'rate_limited'
  | 'rejected'
  | 'revoked'
  | 'stale_slot'
  | 'used';

export interface ChallengePersistenceInput {
  readonly challengeId: string;
  readonly environmentKey: string;
  readonly walletAddress: string;
  readonly network: WalletNetwork;
  readonly nonceHash: string;
  readonly messageHash: string;
  readonly domain: string;
  readonly uri: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly requestId: string;
  readonly ipHash: string;
  readonly userAgentHash?: string;
  readonly rateLimit: number;
}

export interface AccessSessionPersistenceInput {
  readonly challengeId: string;
  readonly walletAddress: string;
  readonly network: WalletNetwork;
  readonly configId: string;
  readonly configVersion: number;
  readonly sessionTokenHash: string;
  readonly observedBalanceRaw: string;
  readonly requiredBalanceRaw: string;
  readonly checkedSlot: bigint;
  readonly expiresAt: string;
  readonly requestId: string;
}

export interface WalletAccessEventInput {
  readonly walletAddress?: string;
  readonly event:
    | 'wallet.signature.verified'
    | 'wallet.signature.denied'
    | 'wallet.access.insufficient'
    | 'wallet.network.mismatch'
    | 'wallet.rpc.unavailable';
  readonly result: 'success' | 'denied' | 'error';
  readonly reasonCode?: string;
  readonly configId?: string;
  readonly configVersion?: number;
  readonly observedBalanceRaw?: string;
  readonly requiredBalanceRaw?: string;
  readonly checkedSlot?: bigint;
  readonly challengeId?: string;
  readonly sessionId?: string;
  readonly requestId: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface AdminTokenGateUpdate {
  readonly expectedConfigVersion: number;
  readonly enabled: boolean;
  readonly network: WalletNetwork;
  readonly mintAddress: string;
  readonly tokenProgram: 'spl-token' | 'spl-token-2022';
  readonly symbol: string;
  readonly decimals: number;
  readonly requiredAmountRaw: string;
  readonly requiredAmount: string;
  readonly commitment: 'confirmed' | 'finalized';
  readonly sessionTtlSeconds: number;
  readonly recheckIntervalSeconds: number;
  readonly validatedSlot: bigint;
  readonly reason: string;
  readonly requestId: string;
}

export interface TokenAccessGateway {
  getRuntimeConfig(
    environmentKey: string,
    network: WalletNetwork,
  ): Promise<RuntimeTokenGateConfig | undefined>;
  createChallenge(input: ChallengePersistenceInput): Promise<PersistenceStatus>;
  loadChallenge(
    challengeId: string,
    walletAddress: string,
    ipHash: string,
    verificationLimit: number,
  ): Promise<PersistedChallenge | PersistenceStatus>;
  consumeChallenge(input: {
    readonly challengeId: string;
    readonly walletAddress: string;
    readonly network: WalletNetwork;
    readonly nonceHash: string;
    readonly messageHash: string;
  }): Promise<ConsumedChallengeConfig | PersistenceStatus>;
  createSession(input: AccessSessionPersistenceInput): Promise<PersistenceStatus>;
  getSession(sessionTokenHash: string): Promise<PersistedAccessSession | PersistenceStatus>;
  claimSessionRecheck(input: {
    readonly sessionTokenHash: string;
    readonly claimId: string;
    readonly requestId: string;
    readonly minimumIntervalSeconds: number;
    readonly claimLeaseSeconds: number;
    readonly rateLimit: number;
  }): Promise<PersistenceStatus>;
  updateSessionBalance(input: {
    readonly sessionTokenHash: string;
    readonly claimId: string;
    readonly observedBalanceRaw: string;
    readonly checkedSlot: bigint;
    readonly requestId: string;
  }): Promise<PersistenceStatus>;
  revokeSession(sessionTokenHash: string, reason: string, requestId: string): Promise<boolean>;
  recordEvent(input: WalletAccessEventInput): Promise<void>;
  getAdminConfig(
    identity: AdminGatewayIdentity,
    environmentKey: string,
    network: WalletNetwork,
  ): Promise<RuntimeTokenGateConfig | undefined>;
  claimAdminValidation(
    identity: AdminGatewayIdentity,
    requestId: string,
    rateLimit: number,
  ): Promise<boolean>;
  updateAdminConfig(
    identity: AdminGatewayIdentity,
    environmentKey: string,
    update: AdminTokenGateUpdate,
  ): Promise<RuntimeTokenGateConfig>;
}

export interface AdminGatewayIdentity {
  readonly userId: string;
  readonly authSessionId: string;
  readonly assuranceLevel: 'aal1' | 'aal2';
}

export interface TokenBalanceVerifier {
  validateMint(
    mintAddress: string,
    commitment: 'confirmed' | 'finalized',
  ): Promise<{
    readonly mintAddress: string;
    readonly tokenProgram: 'spl-token' | 'spl-token-2022';
    readonly decimals: number;
    readonly slot: number;
  }>;
  refreshMint?(
    mintAddress: string,
    commitment: 'confirmed' | 'finalized',
  ): Promise<{
    readonly mintAddress: string;
    readonly tokenProgram: 'spl-token' | 'spl-token-2022';
    readonly decimals: number;
    readonly slot: number;
  }>;
  verifyBalance(
    walletAddress: string,
    mintAddress: string,
    commitment: 'confirmed' | 'finalized',
  ): Promise<{
    readonly mintAddress: string;
    readonly tokenProgram: 'spl-token' | 'spl-token-2022';
    readonly decimals: number;
    readonly slot: number;
    readonly rawAmount: bigint;
  }>;
}

export interface TokenAccessOperationResult {
  readonly view: TokenAccessSessionView;
  readonly sessionToken?: string;
  readonly clearCookie?: boolean;
}

export interface TokenAccessService {
  getPublicConfig(): Promise<TokenAccessPublicConfig>;
  createChallenge(input: {
    readonly walletAddress: string;
    readonly network: WalletNetwork;
    readonly requestId: string;
    readonly ipHash: string;
    readonly userAgentHash?: string;
  }): Promise<{
    readonly challengeId: string;
    readonly message: string;
    readonly expiresAt: string;
  }>;
  verify(input: {
    readonly challengeId: string;
    readonly walletAddress: string;
    readonly network: WalletNetwork;
    readonly message: string;
    readonly signature: string;
    readonly requestId: string;
    readonly ipHash: string;
  }): Promise<TokenAccessOperationResult>;
  getCurrentSession(
    rawToken: string | undefined,
    requestId: string,
  ): Promise<TokenAccessOperationResult>;
  recheck(rawToken: string | undefined, requestId: string): Promise<TokenAccessOperationResult>;
  revoke(rawToken: string | undefined, requestId: string, reason?: string): Promise<boolean>;
  getAdminConfig(identity: AdminGatewayIdentity): Promise<RuntimeTokenGateConfig>;
  validateAdminMint(
    identity: AdminGatewayIdentity,
    mintAddress: string,
    commitment: 'confirmed' | 'finalized',
    requestId: string,
  ): Promise<{
    readonly network: WalletNetwork;
    readonly mintAddress: string;
    readonly tokenProgram: 'spl-token' | 'spl-token-2022';
    readonly decimals: number;
    readonly slot: string;
    readonly commitment: 'confirmed' | 'finalized';
  }>;
  updateAdminConfig(
    identity: AdminGatewayIdentity,
    input: {
      readonly expectedConfigVersion: number;
      readonly enabled: boolean;
      readonly network: WalletNetwork;
      readonly mintAddress: string;
      readonly symbol: string;
      readonly requiredAmount: string;
      readonly commitment: 'confirmed' | 'finalized';
      readonly sessionTtlSeconds: number;
      readonly recheckIntervalSeconds: number;
      readonly reason: string;
    },
    requestId: string,
  ): Promise<RuntimeTokenGateConfig>;
}

export interface AuthorizedAdminTokenGateContext {
  readonly identity: AdminGatewayIdentity;
  readonly authorization: AdminAuthorizationContext;
}
