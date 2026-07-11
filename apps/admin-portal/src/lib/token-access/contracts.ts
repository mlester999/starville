import type { TokenAccessAvailability, WalletNetwork } from '@starville/wallet-access';

export interface AdminTokenGateConfig {
  readonly enabled: boolean;
  readonly availability: TokenAccessAvailability;
  readonly network: WalletNetwork;
  readonly mintAddress: string | null;
  readonly tokenProgram: string | null;
  readonly symbol: string;
  readonly decimals: number | null;
  readonly requiredAmountRaw: string | null;
  readonly requiredAmount: string;
  readonly commitment: 'confirmed' | 'finalized';
  readonly sessionTtlSeconds: number;
  readonly recheckIntervalSeconds: number;
  readonly configVersion: number;
  readonly lastValidatedAt: string | null;
  readonly lastValidatedSlot: string | null;
}

export interface AdminMintValidation {
  readonly network: WalletNetwork;
  readonly mintAddress: string;
  readonly tokenProgram: string;
  readonly decimals: number;
  readonly slot: string;
  readonly commitment: 'confirmed' | 'finalized';
}

export interface TokenGateActionState {
  readonly outcome: 'idle' | 'success' | 'error';
  readonly message?: string;
  readonly validation?: AdminMintValidation;
}

export interface AdminTokenGateUpdate {
  readonly enabled: boolean;
  readonly network: WalletNetwork;
  readonly mintAddress: string;
  readonly symbol: string;
  readonly requiredAmount: string;
  readonly commitment: 'confirmed' | 'finalized';
  readonly sessionTtlSeconds: number;
  readonly recheckIntervalSeconds: number;
  readonly expectedConfigVersion: number;
  readonly reason: string;
}
