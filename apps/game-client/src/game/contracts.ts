import type {
  AppearancePreset,
  MapManifest,
  PlayerStateUpdate,
  WorldInteraction,
} from '@starville/game-core';

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
}

export interface ExitTransitionRequest {
  readonly exitId: string;
  readonly mapId: PlayerStateUpdate['mapId'];
  readonly mapVersionId: string;
  readonly destinationLabel: string | null;
}

export interface GameRuntimeCallbacks {
  readonly onReady: () => void;
  readonly onError: (message: string) => void;
  readonly onStateChanged: (state: PlayerStateUpdate) => void;
  readonly onCheckpoint: (state: PlayerStateUpdate) => void;
  readonly onInteractionTarget: (prompt: InteractionPrompt | null) => void;
  readonly onInteractionOpen: (dialogue: InteractionDialogue) => void;
  readonly onSettingsRequested: () => void;
  readonly onExitRequested: (request: ExitTransitionRequest) => void;
  readonly onMapChanged: (world: RuntimeWorld) => void;
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
