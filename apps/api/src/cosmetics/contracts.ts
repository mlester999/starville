import type { CosmeticWardrobe } from '@starville/cosmetics';

import type { AdminDatabaseIdentity } from '../contracts.js';

export interface CosmeticPlayerContext {
  readonly walletAddress: string;
  readonly accessSessionTokenHash: string;
  readonly requestId: string;
}

export interface CosmeticGateway {
  wardrobe(context: CosmeticPlayerContext): Promise<unknown>;
  saveLoadout(context: CosmeticPlayerContext, input: SaveLoadoutInput): Promise<unknown>;
  renameLoadout(
    context: CosmeticPlayerContext,
    loadoutId: string,
    input: RenameLoadoutInput,
  ): Promise<unknown>;
  deleteLoadout(
    context: CosmeticPlayerContext,
    loadoutId: string,
    input: RevisionedMutationInput,
  ): Promise<unknown>;
  applyLoadout(
    context: CosmeticPlayerContext,
    loadoutId: string,
    input: ApplyLoadoutInput,
  ): Promise<unknown>;
  updateEmoteWheel(context: CosmeticPlayerContext, input: EmoteWheelInput): Promise<unknown>;
  activateEmote(context: CosmeticPlayerContext, emoteKey: string): Promise<unknown>;
  claimCollection(context: CosmeticPlayerContext, collectionKey: string): Promise<unknown>;
}

export interface SaveLoadoutInput {
  readonly slot: number;
  readonly name: string;
  readonly selection: unknown;
  readonly expectedRevision: number;
  readonly requestId: string;
}

export interface RenameLoadoutInput {
  readonly name: string;
  readonly expectedRevision: number;
  readonly requestId: string;
}

export interface RevisionedMutationInput {
  readonly expectedRevision: number;
  readonly requestId: string;
}

export interface ApplyLoadoutInput {
  readonly expectedLoadoutRevision: number;
  readonly expectedAvatarRevision: number;
  readonly requestId: string;
}

export interface EmoteWheelInput {
  readonly emoteKeys: readonly string[];
  readonly expectedRevision: number;
  readonly requestId: string;
}

export interface CosmeticService {
  wardrobe(context: CosmeticPlayerContext): Promise<CosmeticWardrobe>;
  mutate(operation: () => Promise<unknown>): Promise<Record<string, unknown>>;
}

export interface AdminCosmeticGateway {
  overview(identity: AdminDatabaseIdentity): Promise<unknown>;
  audit(identity: AdminDatabaseIdentity, page: number, pageSize: number): Promise<unknown>;
  settings(identity: AdminDatabaseIdentity): Promise<unknown>;
  shop(identity: AdminDatabaseIdentity): Promise<unknown>;
  grant(
    identity: AdminDatabaseIdentity,
    playerProfileId: string,
    cosmeticKey: string,
    reasonCategory: string,
    explanation: string,
    expectedState: 'not_owned' | 'revoked',
    requestId: string,
  ): Promise<unknown>;
  revoke(
    identity: AdminDatabaseIdentity,
    playerProfileId: string,
    cosmeticKey: string,
    reasonCategory: string,
    explanation: string,
    expectedState: 'owned',
    requestId: string,
  ): Promise<unknown>;
}
