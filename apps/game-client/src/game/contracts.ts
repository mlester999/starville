import type {
  AppearancePreset,
  MapId,
  MapManifest,
  MovementInput,
  PlayerStateUpdate,
  WorldVisualSettings,
  WorldInteraction,
} from '@starville/game-core';
import type { AssetResolutionContext, WorldAssetDelivery } from '@starville/asset-management';
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
  /** Defaults to published_world; protected renderer fixtures opt into game_test explicitly. */
  readonly assetResolutionContext?: AssetResolutionContext;
}

export type AvatarRendererMode = 'published_v1' | 'phase12d_candidate' | 'production_slice_v3';

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
  /** Opaque client diagnostic; delivery URLs and storage paths must never be included. */
  readonly requestId?: string;
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
  readonly musicVolume?: number;
  readonly ambienceVolume?: number;
  readonly sfxVolume?: number;
  readonly muted: boolean;
  readonly musicMuted?: boolean;
  readonly ambienceMuted?: boolean;
  readonly sfxMuted?: boolean;
}

/**
 * Minimal renderer-only projection of an already sanitized chat message.
 * `local` is explicit so system messages with a null sender cannot be mistaken
 * for the local player.
 */
export interface WorldChatBubbleMessage {
  readonly id: string;
  readonly worldId: MapId;
  readonly senderPresenceId: string | null;
  readonly text: string;
  readonly sentAt: string;
  readonly local?: boolean;
}

/** Optional deterministic wall clock for renderer-only visual fixtures and tests. */
export interface GameRuntimeClock {
  readonly now: () => number;
}

export interface GameRuntimeDiagnostics {
  readonly location: string;
  readonly mapVersion: number;
  readonly position: PlayerStateUpdate;
  readonly input: MovementInput;
  readonly worldVelocity: Readonly<{ x: number; y: number }>;
  readonly jogging: boolean;
  readonly animation: Readonly<{
    state: string;
    direction: string;
    frame: number;
    frameInState: number;
    elapsedMs: number;
    distanceTiles: number;
  }> | null;
  readonly camera: Readonly<{
    worldView: Readonly<{ x: number; y: number; width: number; height: number }>;
    bounds: MapManifest['cameraBounds'];
  }>;
  readonly culling: Readonly<{
    activeTerrainChunks: number;
    totalTerrainChunks: number;
    visibleTerrainNodes: number;
    totalTerrainNodes: number;
    visibleTerrainAuxiliaryNodes: number;
    totalTerrainAuxiliaryNodes: number;
    visibleObjects: number;
    totalObjects: number;
  }>;
  readonly collision: Readonly<{
    nearbyShapes: number;
    totalShapes: number;
    playerFootRadius: number;
  }>;
  readonly transitionPending: boolean;
}

export interface GameRuntimeOptions {
  readonly initialState: PlayerStateUpdate;
  readonly initialWorld: RuntimeWorld;
  readonly appearancePreset: AppearancePreset;
  readonly avatarProfile?: ResolvedAvatarProfile;
  /** Defaults to the unchanged published V1 renderer. */
  readonly avatarRendererMode?: AvatarRendererMode;
  /** Local review-only camera override; production callers leave this unset. */
  readonly cameraZoomOverride?: number;
  readonly reducedMotion: boolean;
  readonly visualSettings?: Partial<WorldVisualSettings>;
  readonly clock?: GameRuntimeClock;
  readonly collisionDebug: boolean;
  readonly audioSettings: MasterAudioSettings;
  readonly callbacks: GameRuntimeCallbacks;
}

export interface GameRuntimeHandle {
  setInputBlocked(blocked: boolean): void;
  setTouchMovementInput(input: MovementInput): void;
  setTouchJogging(jogging: boolean): void;
  setCollisionDebug(enabled: boolean): void;
  setAudioSettings(settings: MasterAudioSettings): void;
  setRemotePresences(presences: readonly PublicPresence[]): void;
  setLocalAvatarProfile(profile: ResolvedAvatarProfile): void;
  setRemoteAvatarProfiles(profiles: Readonly<Record<string, ResolvedAvatarProfile>>): void;
  setRemotePlayerNamesVisible(visible: boolean): void;
  setVisualSettings(settings: Partial<WorldVisualSettings>): void;
  setChatBubbleMessages(messages: readonly WorldChatBubbleMessage[]): void;
  setReducedMotion(reducedMotion: boolean): void;
  setSelectedRemotePresence(presenceId: string | null): void;
  setActivityInstance(instance: CooperativeActivityInstanceSnapshot | null): void;
  interact(): void;
  getState(): PlayerStateUpdate;
  getDiagnostics(): GameRuntimeDiagnostics;
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
