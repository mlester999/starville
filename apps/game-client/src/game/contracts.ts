import type {
  AppearancePreset,
  MapManifest,
  PlayerStateUpdate,
  WorldInteraction,
} from '@starville/game-core';
import type { WorldAssetDelivery } from '@starville/asset-management';

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
 * Sanitized, non-fatal runtime signal for an immutable production texture that
 * could not be loaded. Delivery URLs, checksums, loader internals, and network
 * errors are intentionally excluded from this browser-observable boundary.
 */
export interface WorldAssetFallbackEvent {
  readonly code: 'WORLD_ASSET_LOAD_FAILED';
  readonly assetKey: string;
  readonly versionId: string;
}

export const WORLD_ASSET_FALLBACK_EVENT_NAME = 'starville:world-asset-fallback';

export interface GameRuntimeCallbacks {
  readonly onReady: () => void;
  readonly onError: (message: string) => void;
  readonly onStateChanged: (state: PlayerStateUpdate) => void;
  readonly onCheckpoint: (state: PlayerStateUpdate) => void;
  readonly onInteractionTarget: (prompt: InteractionPrompt | null) => void;
  readonly onInteractionOpen: (interaction: WorldInteraction) => void;
  readonly onSettingsRequested: () => void;
  readonly onExitRequested: (request: ExitTransitionRequest) => void;
  readonly onMapChanged: (world: RuntimeWorld) => void;
  readonly onWorldAssetFallback: (event: WorldAssetFallbackEvent) => void;
}

export interface MasterAudioSettings {
  readonly masterVolume: number;
  readonly muted: boolean;
}

export interface GameRuntimeOptions {
  readonly initialState: PlayerStateUpdate;
  readonly initialWorld: RuntimeWorld;
  readonly appearancePreset: AppearancePreset;
  readonly reducedMotion: boolean;
  readonly collisionDebug: boolean;
  readonly audioSettings: MasterAudioSettings;
  readonly callbacks: GameRuntimeCallbacks;
}

export interface GameRuntimeHandle {
  setInputBlocked(blocked: boolean): void;
  setAudioSettings(settings: MasterAudioSettings): void;
  interact(): void;
  getState(): PlayerStateUpdate;
  loadWorld(world: RuntimeWorld, state: PlayerStateUpdate): void;
  cancelTransition(): void;
  destroy(): void;
}

export function interactionDialogue(interaction: WorldInteraction): InteractionDialogue {
  return {
    id: interaction.id,
    title: interaction.title,
    content: interaction.content,
  };
}
