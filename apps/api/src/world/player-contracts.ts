import type { MapId, MapManifest, PlayerStateUpdate } from '@starville/game-core';
import type {
  AssetCollisionProfile,
  AssetRotation,
  BundledManifestVersion,
  WorldAssetDelivery,
  WorldAssetMaterialClass,
} from '@starville/asset-management';

export interface PinnedWorldAssetMaterial {
  readonly assetKey: string;
  readonly versionId: string;
  readonly checksumSha256: string;
  /** Missing only on legacy hosted v1/uploaded payloads. */
  readonly materialClass?: WorldAssetMaterialClass | undefined;
  readonly bundledManifestVersion: BundledManifestVersion | null;
  readonly mediaType: 'image/webp' | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly renderWidth: number | null;
  readonly renderHeight: number | null;
  readonly scale: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly footAnchorX: number;
  readonly footAnchorY: number;
  readonly depthAnchorX: number;
  readonly depthAnchorY: number;
  readonly collisionProfile: AssetCollisionProfile;
  readonly supportedRotations: readonly AssetRotation[];
  readonly defaultRotation: AssetRotation;
  readonly developmentMarker: boolean;
  readonly delivery: Readonly<{ bucket: 'game-assets'; objectPath: string }> | null;
  readonly fallback: 'repository_procedural' | 'repository_authored' | null;
}

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
  readonly assetDeliveries: readonly WorldAssetDelivery[];
}

export interface PublishedManifestView {
  readonly map: PublishedWorldMap;
  readonly version: PublishedWorldVersion;
  readonly manifest: MapManifest;
  readonly assetDeliveries: readonly WorldAssetDelivery[];
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

export type PinnedPublishedManifestView = Omit<PublishedManifestView, 'assetDeliveries'> & {
  readonly assetDeliveries: readonly PinnedWorldAssetMaterial[];
};
export type PinnedPublishedWorldView = Omit<PublishedWorldView, 'assetDeliveries'> & {
  readonly assetDeliveries: readonly PinnedWorldAssetMaterial[];
};
export type PinnedWorldTransitionView = Omit<WorldTransitionView, 'assetDeliveries'> & {
  readonly assetDeliveries: readonly PinnedWorldAssetMaterial[];
};

export interface PlayerWorldGateway {
  loadCurrent(
    walletAddress: string,
    requestId: string,
    rateLimit: number,
  ): Promise<PinnedPublishedWorldView | PlayerWorldFailure>;
  loadPublishedManifest(
    walletAddress: string,
    mapId: MapId,
    requestId: string,
    rateLimit: number,
  ): Promise<PinnedPublishedManifestView | PlayerWorldFailure>;
  transition(
    walletAddress: string,
    input: {
      readonly exitId: string;
      readonly expectedGameStateVersion: number;
      readonly expectedMapVersionId: string;
    },
    requestId: string,
    rateLimit: number,
  ): Promise<PinnedWorldTransitionView | PlayerWorldFailure>;
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
