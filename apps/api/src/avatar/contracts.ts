import type {
  AvatarProfile,
  AvatarSelection,
  AvatarStarterCatalog,
  ResolvedPublicAvatar,
} from '@starville/avatar';

export interface AvatarPlayerContext {
  readonly walletAddress: string;
  readonly accessSessionTokenHash: string;
  readonly requestId: string;
}

export interface AvatarGateway {
  getCatalog(context: AvatarPlayerContext): Promise<unknown>;
  getProfile(context: AvatarPlayerContext): Promise<unknown>;
  preview(context: AvatarPlayerContext, selection: unknown): Promise<unknown>;
  create(
    context: AvatarPlayerContext,
    expectedRevision: number,
    selection: unknown,
  ): Promise<unknown>;
  update(
    context: AvatarPlayerContext,
    expectedRevision: number,
    selection: unknown,
  ): Promise<unknown>;
  resolvePublic(appearanceId: string, requestId: string): Promise<unknown>;
}

export interface AvatarService {
  getCatalog(context: AvatarPlayerContext): Promise<AvatarStarterCatalog>;
  getProfile(context: AvatarPlayerContext): Promise<ResolvedPublicAvatar | null>;
  preview(context: AvatarPlayerContext, input: unknown): Promise<AvatarSelection>;
  create(context: AvatarPlayerContext, input: unknown): Promise<AvatarProfile>;
  update(context: AvatarPlayerContext, input: unknown): Promise<AvatarProfile>;
  resolvePublic(appearanceId: unknown, requestId: string): Promise<ResolvedPublicAvatar>;
}
