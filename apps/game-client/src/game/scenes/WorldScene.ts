import Phaser from 'phaser';

import { avatarAnimationStateForMovement } from '@starville/avatar';
import {
  STARVILLE_VISUAL_TOKENS,
  closestInteraction,
  computeWorldCameraFrame,
  moveWithCollisions,
  movementDelta,
  movementSpeed,
  PLAYER_FOOT_RADIUS,
  nextFacingDirection,
  projectWorld,
  sanitizeInteractionText,
  resolveWorldVisualSettings,
  type MapExit,
  type MapManifest,
  type IsometricProjection,
  type MovementInput,
  type PlayerStateUpdate,
  type WorldInteraction,
  type WorldVisualSettings,
} from '@starville/game-core';

import type {
  ActivityInteractionTarget,
  GameRuntimeOptions,
  RuntimeWorld,
  WorldChatBubbleMessage,
} from '../contracts';
import type { CooperativeActivityInstanceSnapshot } from '@starville/cooperative-activities';
import { isGameplayInputAllowed } from '../input/focus';
import { createGameplayKeys, type GameplayKeys } from '../input/keyboard';
import { isJogging, readMovementInput } from '../input/movement-key-state';
import { interactionPromptLabel } from '../input/interaction-prompt';
import { IDLE_TOUCH_MOVEMENT, mergeMovementInput } from '../input/touch-movement';
import { renderCollisionDebug, type CollisionDebugOverlay } from '../rendering/collision-debug';
import {
  createAvatarPlayerRenderer,
  type AvatarPlayerRenderer,
} from '../rendering/avatar-player-renderer';
import { RemotePlayerRenderer } from '../rendering/remote-player';
import type { PublicPresence } from '@starville/realtime';
import { SOCIAL_INTERACTION_DISTANCE, socialDistance } from '@starville/realtime';
import { bundledTerrainAssetKeysForManifest, renderTerrain } from '../rendering/terrain';
import {
  renderInteractionMarkerLayer,
  type InteractionMarkerLayer,
} from '../rendering/interaction-markers';
import {
  renderWorldObjectAmbience,
  type WorldObjectAmbienceLayer,
} from '../rendering/world-ambience';
import { queueWorldAssetTextures } from '../rendering/world-asset-textures';
import { renderWorldObjects, type RenderedWorldObject } from '../rendering/world-objects';
import { fallbackResolvedAvatar, type ResolvedAvatarProfile } from '../../app/avatar-client';
import { WorldChatBubbleRenderer, selectVisibleWorldChatBubbles } from '../rendering/chat-bubbles';

const CHECKPOINT_INTERVAL_MS = 5_000;
const STATE_REPORT_INTERVAL_MS = 100;
const FAILED_TRANSITION_COOLDOWN_MS = 750;
const ARRIVAL_REARM_DELAY_MS = 500;

function currentAssetRotations(manifest: MapManifest) {
  return manifest.objects.flatMap((object) =>
    object.rotation === undefined ? [] : [{ assetKey: object.assetId, rotation: object.rotation }],
  );
}

function currentTextureQueue(
  manifest: MapManifest,
  assetResolutionContext: RuntimeWorld['assetResolutionContext'],
) {
  return {
    assetKeys: manifest.assets,
    assetRotations: currentAssetRotations(manifest),
    terrainAssetKeys: bundledTerrainAssetKeysForManifest(manifest),
    ...(assetResolutionContext === undefined ? {} : { assetResolutionContext }),
  } as const;
}

function highContrastPreference(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia?.('(forced-colors: active)').matches === true
  );
}

function insideExit(position: PlayerStateUpdate, exit: MapExit): boolean {
  return (
    position.x >= exit.trigger.x &&
    position.x <= exit.trigger.x + exit.trigger.width &&
    position.y >= exit.trigger.y &&
    position.y <= exit.trigger.y + exit.trigger.height
  );
}

export class WorldScene extends Phaser.Scene {
  private world: RuntimeWorld;
  private manifest: MapManifest;
  private projection: IsometricProjection;
  private state: PlayerStateUpdate;
  private lastOutsideExitState: PlayerStateUpdate;
  private player: AvatarPlayerRenderer | undefined;
  private localChatBubble: WorldChatBubbleRenderer | undefined;
  private keys: GameplayKeys | undefined;
  private currentInteraction: WorldInteraction | undefined;
  private inputBlocked = false;
  private touchMovementInput: MovementInput = IDLE_TOUCH_MOVEMENT;
  private transitionPending = false;
  private exitArmed = false;
  private rearmAfter = 0;
  private checkpointElapsed = 0;
  private lastStateReportAt = 0;
  private wasMoving = false;
  private dirty = false;
  private terrain: Phaser.GameObjects.Container | undefined;
  private worldObjects: readonly RenderedWorldObject[] = [];
  private interactionMarkers: InteractionMarkerLayer | undefined;
  private objectAmbience: WorldObjectAmbienceLayer | undefined;
  private collisionDebug: CollisionDebugOverlay | undefined;
  private readonly remotePlayers = new Map<string, RemotePlayerRenderer>();
  private remoteAvatarProfiles: Readonly<Record<string, ResolvedAvatarProfile>> = {};
  private remotePlayerNamesVisible = true;
  private selectedRemotePresenceId: string | null = null;
  private visualSettings: WorldVisualSettings;
  private reducedMotion: boolean;
  private chatBubbleMessages: readonly WorldChatBubbleMessage[] = [];
  private activityInstance: CooperativeActivityInstanceSnapshot | null = null;
  private currentActivityObject: ActivityInteractionTarget | undefined;
  private normalWorldState: PlayerStateUpdate | undefined;
  private mapLoadGeneration = 0;
  private activityMarkers: Array<{
    readonly marker: Phaser.GameObjects.Graphics;
    readonly label: Phaser.GameObjects.Text;
  }> = [];

  public constructor(private readonly options: GameRuntimeOptions) {
    super({ key: 'starville-world' });
    this.world = options.initialWorld;
    this.manifest = options.initialWorld.manifest;
    this.projection = this.projectionFor(this.manifest);
    this.visualSettings = resolveWorldVisualSettings(options.visualSettings);
    this.reducedMotion = options.reducedMotion;
    this.state = { ...options.initialState };
    this.lastOutsideExitState = { ...options.initialState };
  }

  public preload(): void {
    queueWorldAssetTextures(
      this,
      this.world.assetDeliveries,
      (event) => this.options.callbacks.onWorldAssetFallback(event),
      currentTextureQueue(this.manifest, this.world.assetResolutionContext),
    );
  }

  public create(): void {
    try {
      this.cameras.main.setBackgroundColor('#456f55');
      this.renderMap();

      this.player = createAvatarPlayerRenderer(
        this.options.avatarRendererMode ?? 'published_v1',
        this,
        this.options.avatarProfile ?? fallbackResolvedAvatar(this.options.appearancePreset),
        this.projection,
        this.reducedMotion,
      );
      this.player.setShadowsEnabled(this.visualSettings.shadows);
      this.localChatBubble = new WorldChatBubbleRenderer(this, this.projection);
      this.localChatBubble.setEnabled(this.visualSettings.chatBubbles);
      this.updatePlayer(false, 0, false);
      this.configureCamera();
      this.scale.on('resize', this.handleResize, this);

      if (this.input.keyboard !== null) this.keys = createGameplayKeys(this.input.keyboard);
      this.events.on(Phaser.Scenes.Events.PAUSE, this.reportStoppedMovement, this);
      this.events.on(Phaser.Scenes.Events.SLEEP, this.reportStoppedMovement, this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
      this.refreshInteractionTarget();
      this.options.callbacks.onMapChanged(this.world);
      this.options.callbacks.onReady();
    } catch {
      this.options.callbacks.onError(`${this.manifest.name} could not be prepared safely.`);
    }
  }

  public override update(time: number, delta: number): void {
    const player = this.player;
    const keys = this.keys;
    if (player === undefined) return;

    const mayUseKeyboard =
      keys !== undefined &&
      isGameplayInputAllowed(this.inputBlocked || this.transitionPending, document.activeElement);
    if (mayUseKeyboard && keys !== undefined && Phaser.Input.Keyboard.JustDown(keys.settings)) {
      this.options.callbacks.onSettingsRequested();
      return;
    }
    if (mayUseKeyboard && keys !== undefined && Phaser.Input.Keyboard.JustDown(keys.interact)) {
      this.interact();
    }

    const keyboardInput =
      mayUseKeyboard && keys !== undefined
        ? readMovementInput(keys)
        : { up: false, down: false, left: false, right: false };
    const input = mergeMovementInput(
      keyboardInput,
      this.inputBlocked || this.transitionPending ? IDLE_TOUCH_MOVEMENT : this.touchMovementInput,
    );
    const jogging = mayUseKeyboard && keys !== undefined && isJogging(keys);
    const movement = movementDelta(input, movementSpeed(jogging), delta / 1_000);
    const next = moveWithCollisions(
      { x: this.state.x, y: this.state.y },
      movement,
      PLAYER_FOOT_RADIUS,
      this.manifest.safeSaveBounds,
      this.manifest.collisions,
    );
    const moving = next.x !== this.state.x || next.y !== this.state.y;
    const facingDirection = nextFacingDirection(input, this.state.facingDirection);
    const movementStarted = moving && !this.wasMoving;
    const facingChanged = facingDirection !== this.state.facingDirection;

    if (moving || facingChanged) {
      this.state = { ...this.state, x: next.x, y: next.y, facingDirection };
      this.dirty = true;
      this.refreshInteractionTarget();
      if (movementStarted || time - this.lastStateReportAt >= STATE_REPORT_INTERVAL_MS) {
        this.lastStateReportAt = time;
        this.options.callbacks.onStateChanged(this.getState(), moving ? 'moving' : 'stopped');
      }
      this.validateRemoteSelection();
    }

    if (!moving && this.wasMoving) this.reportStoppedMovement();
    this.wasMoving = moving;

    this.updatePlayer(moving, time, jogging);
    const interpolationNow = performance.now();
    const wallNow = this.wallClockNow();
    for (const remote of this.remotePlayers.values()) {
      remote.update(interpolationNow, this.state, wallNow);
    }
    this.localChatBubble?.update(this.state, this.state, wallNow);
    this.checkExit(time);

    if (this.dirty && !this.transitionPending) {
      this.checkpointElapsed += Math.min(Math.max(delta, 0), 100);
      if (this.checkpointElapsed >= CHECKPOINT_INTERVAL_MS) {
        this.checkpointElapsed = 0;
        this.dirty = false;
        this.options.callbacks.onCheckpoint(this.getState());
      }
    }
  }

  public setInputBlocked(blocked: boolean): void {
    this.inputBlocked = blocked;
    if (blocked) this.touchMovementInput = IDLE_TOUCH_MOVEMENT;
  }

  public setTouchMovementInput(input: MovementInput): void {
    this.touchMovementInput = this.inputBlocked
      ? IDLE_TOUCH_MOVEMENT
      : {
          up: input.up === true,
          down: input.down === true,
          left: input.left === true,
          right: input.right === true,
        };
  }

  public setRemotePresences(presences: readonly PublicPresence[]): void {
    const visiblePresences = presences.filter((presence) => presence.worldId === this.manifest.id);
    const currentIds = new Set(visiblePresences.map((presence) => presence.presenceId));
    for (const [presenceId, remote] of this.remotePlayers) {
      if (!currentIds.has(presenceId)) {
        remote.destroy();
        this.remotePlayers.delete(presenceId);
        if (this.selectedRemotePresenceId === presenceId) this.selectRemotePlayer(null);
      }
    }
    const receivedAt = performance.now();
    for (const presence of visiblePresences) {
      const current = this.remotePlayers.get(presence.presenceId);
      if (current === undefined) {
        this.remotePlayers.set(
          presence.presenceId,
          new RemotePlayerRenderer(
            this,
            presence,
            this.projection,
            this.reducedMotion,
            (presenceId) => this.selectRemotePlayer(presenceId),
            this.visualSettings,
            this.options.avatarRendererMode ?? 'published_v1',
          ),
        );
      } else {
        current.push(presence, receivedAt);
      }
      const resolved = this.remoteAvatarProfiles[presence.presenceId];
      this.remotePlayers
        .get(presence.presenceId)
        ?.setAppearance(resolved ?? fallbackResolvedAvatar(presence.appearancePreset));
      this.remotePlayers
        .get(presence.presenceId)
        ?.setSelected(presence.presenceId === this.selectedRemotePresenceId);
      this.remotePlayers
        .get(presence.presenceId)
        ?.setNameplateVisible(this.remotePlayerNamesVisible);
    }
    this.refreshChatBubbles();
  }

  public setLocalAvatarProfile(profile: ResolvedAvatarProfile): void {
    this.player?.setAppearance(profile);
    this.updatePlayer(false, this.time.now, false);
  }

  public setRemoteAvatarProfiles(profiles: Readonly<Record<string, ResolvedAvatarProfile>>): void {
    this.remoteAvatarProfiles = profiles;
    for (const [presenceId, renderer] of this.remotePlayers) {
      const profile = profiles[presenceId];
      if (profile !== undefined) renderer.setAppearance(profile);
    }
  }

  public setRemotePlayerNamesVisible(visible: boolean): void {
    this.remotePlayerNamesVisible = visible;
    for (const remote of this.remotePlayers.values()) remote.setNameplateVisible(visible);
  }

  public setVisualSettings(settings: Partial<WorldVisualSettings>): void {
    const next = resolveWorldVisualSettings(settings);
    const rendererChanged =
      next.quality !== this.visualSettings.quality ||
      next.shadows !== this.visualSettings.shadows ||
      next.ambientEffects !== this.visualSettings.ambientEffects ||
      next.animatedWater !== this.visualSettings.animatedWater;
    const labelsChanged =
      next.remoteLabels !== this.visualSettings.remoteLabels ||
      next.chatBubbles !== this.visualSettings.chatBubbles;
    if (!rendererChanged && !labelsChanged) return;
    this.visualSettings = next;
    this.player?.setShadowsEnabled(this.visualSettings.shadows);
    this.localChatBubble?.setEnabled(this.visualSettings.chatBubbles);
    for (const remote of this.remotePlayers.values()) remote.setVisualSettings(this.visualSettings);
    if (rendererChanged && this.terrain !== undefined) {
      this.clearMap();
      this.renderMap();
      this.renderActivityMarkers();
      this.refreshInteractionTarget();
    }
    this.configureCamera();
    this.refreshChatBubbles();
  }

  public setChatBubbleMessages(messages: readonly WorldChatBubbleMessage[]): void {
    this.chatBubbleMessages = messages.slice(-50);
    this.refreshChatBubbles();
  }

  public setReducedMotion(reducedMotion: boolean): void {
    if (this.reducedMotion === reducedMotion) return;
    this.reducedMotion = reducedMotion;
    this.player?.setReducedMotion(reducedMotion);
    for (const remote of this.remotePlayers.values()) remote.setReducedMotion(reducedMotion);
    if (this.terrain !== undefined) {
      this.clearMap();
      this.renderMap();
      this.renderActivityMarkers();
      this.refreshInteractionTarget();
    }
    this.configureCamera();
  }

  public setSelectedRemotePresence(presenceId: string | null): void {
    this.selectRemotePlayer(presenceId);
  }

  public setActivityInstance(instance: CooperativeActivityInstanceSnapshot | null): void {
    const entered = this.activityInstance === null && instance !== null;
    const left = this.activityInstance !== null && instance === null;
    if (entered) {
      this.normalWorldState = { ...this.state };
      this.state = { ...this.state, x: instance.spawn.x, y: instance.spawn.y };
      this.dirty = false;
      this.checkpointElapsed = 0;
      this.selectRemotePlayer(null);
      this.updatePlayer(false, this.time.now, false);
      this.wasMoving = false;
      this.options.callbacks.onStateChanged(this.getState(), 'stopped');
    }
    this.activityInstance = instance;
    if (left && this.normalWorldState !== undefined) {
      this.state = this.normalWorldState;
      this.normalWorldState = undefined;
      this.dirty = false;
      this.checkpointElapsed = 0;
      this.updatePlayer(false, this.time.now, false);
      this.wasMoving = false;
      this.options.callbacks.onStateChanged(this.getState(), 'stopped');
    }
    this.renderActivityMarkers();
    this.refreshInteractionTarget();
  }

  public interact(): void {
    if (this.inputBlocked || this.transitionPending) return;
    if (this.currentActivityObject !== undefined) {
      this.options.callbacks.onActivityInteraction({
        instanceId: this.currentActivityObject.instanceId,
        expectedRevision: this.currentActivityObject.expectedRevision,
        objectiveKey: this.currentActivityObject.objectiveKey,
        objectKey: this.currentActivityObject.key,
      });
      return;
    }
    if (this.currentInteraction === undefined) return;
    this.inputBlocked = true;
    this.options.callbacks.onInteractionOpen({
      ...this.currentInteraction,
      title: sanitizeInteractionText(this.currentInteraction.title),
      content: sanitizeInteractionText(this.currentInteraction.content),
    });
  }

  public getState(): PlayerStateUpdate {
    return { ...this.state };
  }

  public loadWorld(world: RuntimeWorld, state: PlayerStateUpdate): void {
    if (state.mapId !== world.manifest.id) {
      throw new Error('Destination state does not match the published map.');
    }

    const loadGeneration = ++this.mapLoadGeneration;
    const queuedTextures = queueWorldAssetTextures(
      this,
      world.assetDeliveries,
      (event) => this.options.callbacks.onWorldAssetFallback(event),
      currentTextureQueue(world.manifest, world.assetResolutionContext),
    );
    const commit = (): void => {
      if (loadGeneration !== this.mapLoadGeneration) return;
      this.commitWorld(world, state);
    };

    if (queuedTextures === 0) {
      commit();
      return;
    }

    /*
     * Keep the complete source map visible until all queued destination
     * materials have either loaded or failed. The destination is then rendered
     * once from the final texture set, avoiding procedural-to-WebP flicker.
     */
    this.transitionPending = true;
    this.reportStoppedMovement();
    this.load.once(Phaser.Loader.Events.COMPLETE, commit);
    if (!this.load.isLoading()) this.load.start();
  }

  private commitWorld(world: RuntimeWorld, state: PlayerStateUpdate): void {
    this.clearMap();
    for (const remote of this.remotePlayers.values()) remote.destroy();
    this.remotePlayers.clear();
    this.selectRemotePlayer(null);
    this.world = world;
    this.manifest = world.manifest;
    this.projection = this.projectionFor(this.manifest);
    this.state = { ...state };
    this.lastOutsideExitState = { ...state };
    this.transitionPending = false;
    this.exitArmed = false;
    this.rearmAfter = this.time.now + ARRIVAL_REARM_DELAY_MS;
    this.checkpointElapsed = 0;
    this.dirty = false;
    this.wasMoving = false;
    this.currentInteraction = undefined;

    this.renderMap();
    this.player?.setProjection(this.projection);
    this.localChatBubble?.setProjection(this.projection);
    this.updatePlayer(false, this.time.now, false);
    this.configureCamera();
    this.refreshChatBubbles();
    this.refreshInteractionTarget();
    this.options.callbacks.onMapChanged(world);
  }

  public cancelTransition(): void {
    if (!this.transitionPending) return;
    this.mapLoadGeneration += 1;
    this.state = { ...this.lastOutsideExitState };
    this.transitionPending = false;
    this.exitArmed = false;
    this.rearmAfter = this.time.now + FAILED_TRANSITION_COOLDOWN_MS;
    this.dirty = false;
    this.wasMoving = false;
    this.updatePlayer(false, this.time.now, false);
    this.refreshInteractionTarget();
    this.options.callbacks.onStateChanged(this.getState(), 'stopped');
  }

  private reportStoppedMovement(): void {
    if (!this.wasMoving) return;
    this.wasMoving = false;
    this.updatePlayer(false, this.time.now, false);
    this.options.callbacks.onStateChanged(this.getState(), 'stopped');
  }

  private projectionFor(manifest: MapManifest): IsometricProjection {
    return {
      tileWidth: manifest.tileWidth,
      tileHeight: manifest.tileHeight,
      originX: manifest.projectionOrigin.x,
      originY: manifest.projectionOrigin.y,
    };
  }

  private selectRemotePlayer(presenceId: string | null): void {
    const remote = presenceId === null ? undefined : this.remotePlayers.get(presenceId);
    const permitted =
      remote !== undefined &&
      socialDistance(this.state, remote.getPresence()) <= SOCIAL_INTERACTION_DISTANCE;
    const next = permitted ? presenceId : null;
    if (next === this.selectedRemotePresenceId) return;
    this.selectedRemotePresenceId = next;
    for (const [id, renderer] of this.remotePlayers) renderer.setSelected(id === next);
    this.options.callbacks.onRemotePlayerSelected(next);
  }

  private validateRemoteSelection(): void {
    if (this.selectedRemotePresenceId === null) return;
    this.selectRemotePlayer(this.selectedRemotePresenceId);
  }

  private renderMap(): void {
    this.terrain = renderTerrain(this, this.manifest, {
      apronTiles: STARVILLE_VISUAL_TOKENS.camera.maximumApronTiles,
      reducedMotion: this.reducedMotion,
      quality: this.visualSettings.quality,
      animatedWater: this.visualSettings.animatedWater,
      ambientEffects: this.visualSettings.ambientEffects,
      assetDeliveries: this.world.assetDeliveries,
      ...(this.world.assetResolutionContext === undefined
        ? {}
        : { assetResolutionContext: this.world.assetResolutionContext }),
    });
    this.worldObjects = renderWorldObjects(this, this.manifest, this.world.assetDeliveries, {
      shadows: this.visualSettings.shadows,
      quality: this.visualSettings.quality,
      ...(this.world.assetResolutionContext === undefined
        ? {}
        : { assetResolutionContext: this.world.assetResolutionContext }),
    });
    this.objectAmbience = renderWorldObjectAmbience(this, this.manifest, this.worldObjects, {
      enabled: this.visualSettings.ambientEffects,
      reducedMotion: this.reducedMotion,
      quality: this.visualSettings.quality,
      highContrast: highContrastPreference(),
    });
    if (this.options.collisionDebug) {
      this.collisionDebug = renderCollisionDebug(
        this,
        this.manifest.collisions,
        this.projection,
        PLAYER_FOOT_RADIUS,
      );
    }
    this.renderInteractionMarkers();
  }

  private clearMap(): void {
    if (this.terrain !== undefined) {
      this.tweens?.killTweensOf(this.terrain.getAll());
      this.terrain.destroy();
    }
    this.terrain = undefined;
    this.objectAmbience?.destroy();
    this.objectAmbience = undefined;
    for (const object of this.worldObjects) {
      object.container.destroy(true);
      object.shadow?.destroy();
    }
    this.worldObjects = [];
    this.interactionMarkers?.destroy();
    this.interactionMarkers = undefined;
    this.collisionDebug?.destroy();
    this.collisionDebug = undefined;
    this.clearActivityMarkers();
  }

  private configureCamera(): void {
    const camera = this.cameras?.main;
    if (camera === undefined) return;
    const frame = computeWorldCameraFrame({
      manifest: this.manifest,
      viewportWidth: camera.width,
      viewportHeight: camera.height,
      reducedMotion: this.reducedMotion,
    });
    const bounds = frame.bounds;
    camera.setZoom(frame.zoom);
    camera.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
    if (this.player !== undefined) {
      camera.startFollow(
        this.player.container,
        true,
        this.reducedMotion ? 1 : 0.13,
        this.reducedMotion ? 1 : 0.13,
      );
      camera.setDeadzone(frame.deadzone.width, frame.deadzone.height);
    }
  }

  private handleResize(): void {
    this.configureCamera();
  }

  private handleShutdown(): void {
    this.reportStoppedMovement();
    this.mapLoadGeneration += 1;
    this.transitionPending = false;
    this.scale.off('resize', this.handleResize, this);
    this.events.off(Phaser.Scenes.Events.PAUSE, this.reportStoppedMovement, this);
    this.events.off(Phaser.Scenes.Events.SLEEP, this.reportStoppedMovement, this);
    for (const remote of this.remotePlayers.values()) remote.destroy();
    this.remotePlayers.clear();
    this.remoteAvatarProfiles = {};
    this.selectedRemotePresenceId = null;
    this.player?.destroy();
    this.player = undefined;
    this.localChatBubble?.destroy();
    this.localChatBubble = undefined;
    this.clearMap();
    this.keys = undefined;
    this.currentInteraction = undefined;
    this.chatBubbleMessages = [];
    this.activityInstance = null;
    this.currentActivityObject = undefined;
    this.normalWorldState = undefined;
  }

  private refreshChatBubbles(): void {
    const visiblePresenceIds = new Set(this.remotePlayers.keys());
    const selected = selectVisibleWorldChatBubbles({
      messages: this.chatBubbleMessages,
      worldId: this.manifest.id,
      visiblePresenceIds,
      now: this.wallClockNow(),
      quality: this.visualSettings.quality,
    });
    const bySpeaker = new Map(selected.map((message) => [message.speakerKey, message]));
    this.localChatBubble?.setMessage(bySpeaker.get('local'));
    for (const [presenceId, remote] of this.remotePlayers) {
      remote.setChatBubble(bySpeaker.get(presenceId));
    }
  }

  private wallClockNow(): number {
    return this.options.clock?.now() ?? Date.now();
  }

  private updatePlayer(moving: boolean, time: number, jogging: boolean): void {
    this.player?.update(
      { x: this.state.x, y: this.state.y },
      this.state.facingDirection,
      avatarAnimationStateForMovement(moving, jogging),
      time,
    );
    this.collisionDebug?.updatePlayer(this.state);
  }

  private checkExit(time: number): void {
    if (this.activityInstance !== null) return;
    const activeExit = this.manifest.exits.find(
      (exit) => exit.enabled && insideExit(this.state, exit),
    );

    if (activeExit === undefined) {
      this.lastOutsideExitState = { ...this.state };
      if (!this.transitionPending && time >= this.rearmAfter) this.exitArmed = true;
      return;
    }

    if (!this.exitArmed || this.transitionPending || time < this.rearmAfter) return;
    this.transitionPending = true;
    this.exitArmed = false;
    this.options.callbacks.onExitRequested({
      exitId: activeExit.id,
      mapId: this.manifest.id,
      mapVersionId: this.world.versionId,
      destinationLabel: activeExit.transitionLabel,
    });
  }

  private refreshInteractionTarget(): void {
    const instance = this.activityInstance;
    if (
      instance !== null &&
      instance.status === 'active' &&
      instance.currentObjectiveKey !== null
    ) {
      const candidates = instance.objects
        .filter(
          (object) =>
            object.active &&
            Math.hypot(this.state.x - object.x, this.state.y - object.y) <= object.interactionRange,
        )
        .sort(
          (left, right) =>
            Math.hypot(this.state.x - left.x, this.state.y - left.y) -
            Math.hypot(this.state.x - right.x, this.state.y - right.y),
        );
      const object = candidates[0];
      const next =
        object === undefined
          ? undefined
          : {
              ...object,
              instanceId: instance.instanceId,
              expectedRevision: instance.revision,
              objectiveKey: instance.currentObjectiveKey,
            };
      if (
        next?.key === this.currentActivityObject?.key &&
        next?.expectedRevision === this.currentActivityObject?.expectedRevision &&
        this.currentInteraction === undefined
      ) {
        return;
      }
      this.currentActivityObject = next;
      this.currentInteraction = undefined;
      this.interactionMarkers?.setState({
        targetedInteractionId: null,
        reducedMotion: this.reducedMotion,
        highContrast: highContrastPreference(),
      });
      this.options.callbacks.onInteractionTarget(
        next === undefined ? null : { id: next.key, label: next.label },
      );
      return;
    }
    this.currentActivityObject = undefined;
    const next = closestInteraction(
      { x: this.state.x, y: this.state.y },
      this.manifest.interactions,
    );
    if (next?.id === this.currentInteraction?.id) return;
    this.currentInteraction = next;
    this.interactionMarkers?.setState({
      targetedInteractionId: next?.id ?? null,
      reducedMotion: this.reducedMotion,
      highContrast: highContrastPreference(),
    });
    this.options.callbacks.onInteractionTarget(
      next === undefined
        ? null
        : {
            id: next.id,
            label: interactionPromptLabel(next),
          },
    );
  }

  private clearActivityMarkers(): void {
    for (const entry of this.activityMarkers) {
      entry.marker.destroy();
      entry.label.destroy();
    }
    this.activityMarkers = [];
  }

  private renderActivityMarkers(): void {
    this.clearActivityMarkers();
    const instance = this.activityInstance;
    if (instance === null) return;
    this.activityMarkers = instance.objects.map((object) => {
      const screen = projectWorld(object, this.projection);
      const marker = this.add.graphics();
      const color = object.active ? 0xf1d375 : 0x6f8577;
      marker.fillStyle(color, object.active ? 0.32 : 0.12).fillCircle(0, -15, 15);
      marker.lineStyle(2, color, object.active ? 0.95 : 0.35).strokeCircle(0, -15, 11);
      marker.setPosition(screen.x, screen.y).setDepth(screen.y + 999_999_000);
      const label = this.add
        .text(screen.x, screen.y - 39, object.label, {
          color: object.active ? '#fff5cf' : '#aebcb4',
          fontFamily: 'Arial, sans-serif',
          fontSize: '11px',
          backgroundColor: '#10251fe6',
          padding: { x: 5, y: 3 },
        })
        .setOrigin(0.5, 1)
        .setDepth(screen.y + 999_999_001)
        .setVisible(object.active);
      return { marker, label };
    });
  }

  private renderInteractionMarkers(): void {
    this.interactionMarkers = renderInteractionMarkerLayer(
      this,
      this.manifest,
      this.world.assetDeliveries,
      {
        ...(this.world.assetResolutionContext === undefined
          ? {}
          : { assetResolutionContext: this.world.assetResolutionContext }),
        state: {
          targetedInteractionId: this.currentInteraction?.id ?? null,
          reducedMotion: this.reducedMotion,
          highContrast: highContrastPreference(),
        },
      },
    );
  }
}
