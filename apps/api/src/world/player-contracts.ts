import type { MapId, MapManifest, PlayerStateUpdate } from '@starville/game-core';

export interface PublishedWorldMap {
  readonly id: string;
  readonly slug: MapId;
  readonly displayName: string;
  readonly description: string;
}

export interface PublishedWorldVersion {
  readonly id: string;
  readonly versionNumber: number;
  readonly checksum: string;
  readonly publishedAt: string;
}

export interface PublishedWorldPlayerState extends PlayerStateUpdate {
  readonly mapVersionId: string;
  readonly gameStateVersion: number;
  readonly updatedAt: string;
  readonly lastTransitionAt?: string | null;
}

export interface PublishedWorldView {
  readonly map: PublishedWorldMap;
  readonly version: PublishedWorldVersion;
  readonly manifest: MapManifest;
  readonly playerState: PublishedWorldPlayerState;
}

export interface PublishedManifestView {
  readonly map: PublishedWorldMap;
  readonly version: PublishedWorldVersion;
  readonly manifest: MapManifest;
}

export interface WorldTransitionView extends PublishedWorldView {
  readonly transition: {
    readonly exitId: string;
    readonly fromMapId: MapId | null;
    readonly toMapId: MapId;
    readonly destinationSpawnId: string;
    readonly completedAt: string;
  };
}

export type PlayerWorldFailure =
  | 'not_found'
  | 'suspended'
  | 'rename_required'
  | 'rate_limited'
  | 'world_unavailable'
  | 'map_not_found'
  | 'version_conflict'
  | 'invalid_exit'
  | 'destination_unavailable';

export interface PlayerWorldGateway {
  loadCurrent(
    walletAddress: string,
    requestId: string,
    rateLimit: number,
  ): Promise<PublishedWorldView | PlayerWorldFailure>;
  loadPublishedManifest(
    walletAddress: string,
    mapId: MapId,
    requestId: string,
    rateLimit: number,
  ): Promise<PublishedManifestView | PlayerWorldFailure>;
  transition(
    walletAddress: string,
    input: {
      readonly exitId: string;
      readonly expectedGameStateVersion: number;
      readonly expectedMapVersionId: string;
    },
    requestId: string,
    rateLimit: number,
  ): Promise<WorldTransitionView | PlayerWorldFailure>;
}

export interface PlayerWorldService {
  loadCurrent(walletAddress: string, requestId: string): Promise<PublishedWorldView>;
  loadPublishedManifest(
    walletAddress: string,
    mapId: unknown,
    requestId: string,
  ): Promise<PublishedManifestView>;
  transition(walletAddress: string, body: unknown, requestId: string): Promise<WorldTransitionView>;
}
