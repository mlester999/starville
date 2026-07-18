import type {
  AppearancePreset,
  MapManifest,
  PlayerStateUpdate,
  WorldInteraction,
} from '@starville/game-core';
import type { WorldAssetDelivery } from '@starville/asset-management';
import type { PublicPresence } from '@starville/realtime';
import type {
  CooperativeActivityInstanceSnapshot,
  CooperativeActivityObject,
} from '@starville/cooperative-activities';
import type { ResolvedAvatarProfile } from '../app/avatar-client';

export interface InteractionPrompt {
  readonly id: string;
  readonly label: string;
}

export interface InteractionDialogue {
  readonly id: string;
  readonly title: string;
  readonly content: string;
}

export interface RuntimeWorld {
  readonly manifest: MapManifest;
  readonly versionId: string;
  readonly checksum: string;
  readonly assetDeliveries: readonly WorldAssetDelivery[];
}

export interface ExitTransitionRequest {
  readonly exitId: string;
  readonly mapId: PlayerStateUpdate['mapId'];
  readonly mapVersionId: string;
  readonly destinationLabel: string | null;
}

/**
 * Sanitized, non-fatal runtime signal for an immutable uploaded or bundled
 * texture that could not be loaded. `versionId` is either an uploaded version
 * UUID or `bundled-manifest:<semver>`. Delivery URLs, checksums, loader
 * internals, and network errors are intentionally excluded from this boundary.
 */
export interface WorldAssetFallbackEvent {
  readonly code: 'WORLD_ASSET_LOAD_FAILED';
  readonly assetKey: string;
  readonly versionId: string;
}

export const WORLD_ASSET_FALLBACK_EVENT_NAME = 'starville:world-asset-fallback';

export type LocalMovementPhase = 'moving' | 'stopped';

export interface GameRuntimeCallbacks {
  readonly onReady: () => void;
  readonly onError: (message: string) => void;
  readonly onStateChanged: (state: PlayerStateUpdate, phase: LocalMovementPhase) => void;
  readonly onCheckpoint: (state: PlayerStateUpdate) => void;
  readonly onInteractionTarget: (prompt: InteractionPrompt | null) => void;
  readonly onInteractionOpen: (interaction: WorldInteraction) => void;
  readonly onSettingsRequested: () => void;
  readonly onExitRequested: (request: ExitTransitionRequest) => void;
  readonly onMapChanged: (world: RuntimeWorld) => void;
  readonly onWorldAssetFallback: (event: WorldAssetFallbackEvent) => void;
  readonly onRemotePlayerSelected: (presenceId: string | null) => void;
  readonly onActivityInteraction: (interaction: {
    readonly instanceId: string;
    readonly expectedRevision: number;
    readonly objectiveKey: string;
    readonly objectKey: string;
  }) => void;
}

export interface MasterAudioSettings {
  readonly masterVolume: number;
  readonly muted: boolean;
}

export interface GameRuntimeOptions {
  readonly initialState: PlayerStateUpdate;
  readonly initialWorld: RuntimeWorld;
  readonly appearancePreset: AppearancePreset;
  readonly avatarProfile?: ResolvedAvatarProfile;
  readonly reducedMotion: boolean;
  readonly collisionDebug: boolean;
  readonly audioSettings: MasterAudioSettings;
  readonly callbacks: GameRuntimeCallbacks;
}

export interface GameRuntimeHandle {
  setInputBlocked(blocked: boolean): void;
  setAudioSettings(settings: MasterAudioSettings): void;
  setRemotePresences(presences: readonly PublicPresence[]): void;
  setLocalAvatarProfile(profile: ResolvedAvatarProfile): void;
  setRemoteAvatarProfiles(profiles: Readonly<Record<string, ResolvedAvatarProfile>>): void;
  setRemotePlayerNamesVisible(visible: boolean): void;
  setSelectedRemotePresence(presenceId: string | null): void;
  setActivityInstance(instance: CooperativeActivityInstanceSnapshot | null): void;
  interact(): void;
  getState(): PlayerStateUpdate;
  loadWorld(world: RuntimeWorld, state: PlayerStateUpdate): void;
  cancelTransition(): void;
  destroy(): void;
}

export interface ActivityInteractionTarget extends CooperativeActivityObject {
  readonly instanceId: string;
  readonly expectedRevision: number;
  readonly objectiveKey: string;
}

export function interactionDialogue(interaction: WorldInteraction): InteractionDialogue {
  return {
    id: interaction.id,
    title: interaction.title,
    content: interaction.content,
  };
}
