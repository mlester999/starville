import Phaser from 'phaser';

import {
  closestInteraction,
  moveWithCollisions,
  movementDelta,
  movementSpeed,
  PLAYER_FOOT_RADIUS,
  nextFacingDirection,
  projectWorld,
  sanitizeInteractionText,
  type MapExit,
  type MapManifest,
  type IsometricProjection,
  type PlayerStateUpdate,
  type WorldInteraction,
} from '@starville/game-core';

import type { GameRuntimeOptions, RuntimeWorld } from '../contracts';
import { interactionDialogue } from '../contracts';
import { isGameplayInputAllowed } from '../input/focus';
import { createGameplayKeys, type GameplayKeys } from '../input/keyboard';
import { isJogging, readMovementInput } from '../input/movement-key-state';
import { renderCollisionDebug, type CollisionDebugOverlay } from '../rendering/collision-debug';
import { PlayerRenderer } from '../rendering/player';
import { renderTerrain } from '../rendering/terrain';
import { renderWorldObjects, type RenderedWorldObject } from '../rendering/world-objects';

const CHECKPOINT_INTERVAL_MS = 5_000;
const STATE_REPORT_INTERVAL_MS = 200;
const FAILED_TRANSITION_COOLDOWN_MS = 750;
const ARRIVAL_REARM_DELAY_MS = 500;

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
  private player: PlayerRenderer | undefined;
  private keys: GameplayKeys | undefined;
  private currentInteraction: WorldInteraction | undefined;
  private inputBlocked = false;
  private transitionPending = false;
  private exitArmed = false;
  private rearmAfter = 0;
  private checkpointElapsed = 0;
  private lastStateReportAt = 0;
  private dirty = false;
  private terrain: Phaser.GameObjects.Graphics | undefined;
  private worldObjects: readonly RenderedWorldObject[] = [];
  private interactionMarkers: Phaser.GameObjects.Graphics[] = [];
  private collisionDebug: CollisionDebugOverlay | undefined;

  public constructor(private readonly options: GameRuntimeOptions) {
    super({ key: 'starville-world' });
    this.world = options.initialWorld;
    this.manifest = options.initialWorld.manifest;
    this.projection = this.projectionFor(this.manifest);
    this.state = { ...options.initialState };
    this.lastOutsideExitState = { ...options.initialState };
  }

  public create(): void {
    try {
      this.cameras.main.setBackgroundColor('#17382b');
      this.renderMap();

      this.player = new PlayerRenderer(
        this,
        this.options.appearancePreset,
        this.projection,
        this.options.reducedMotion,
      );
      this.updatePlayer(false, 0, false);
      this.configureCamera();

      if (this.input.keyboard !== null) this.keys = createGameplayKeys(this.input.keyboard);
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
    if (player === undefined || keys === undefined) return;

    const mayUseKeyboard = isGameplayInputAllowed(
      this.inputBlocked || this.transitionPending,
      document.activeElement,
    );
    if (mayUseKeyboard && Phaser.Input.Keyboard.JustDown(keys.settings)) {
      this.options.callbacks.onSettingsRequested();
      return;
    }
    if (mayUseKeyboard && Phaser.Input.Keyboard.JustDown(keys.interact)) this.interact();

    const input = mayUseKeyboard
      ? readMovementInput(keys)
      : { up: false, down: false, left: false, right: false };
    const jogging = mayUseKeyboard && isJogging(keys);
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

    if (moving || facingDirection !== this.state.facingDirection) {
      this.state = { ...this.state, x: next.x, y: next.y, facingDirection };
      this.dirty = true;
      this.refreshInteractionTarget();
      if (time - this.lastStateReportAt >= STATE_REPORT_INTERVAL_MS) {
        this.lastStateReportAt = time;
        this.options.callbacks.onStateChanged(this.getState());
      }
    }

    this.updatePlayer(moving, time, jogging);
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
  }

  public interact(): void {
    if (this.inputBlocked || this.transitionPending || this.currentInteraction === undefined)
      return;
    this.inputBlocked = true;
    this.options.callbacks.onInteractionOpen(
      interactionDialogue({
        ...this.currentInteraction,
        title: sanitizeInteractionText(this.currentInteraction.title),
        content: sanitizeInteractionText(this.currentInteraction.content),
      }),
    );
  }

  public getState(): PlayerStateUpdate {
    return { ...this.state };
  }

  public loadWorld(world: RuntimeWorld, state: PlayerStateUpdate): void {
    if (state.mapId !== world.manifest.id) {
      throw new Error('Destination state does not match the published map.');
    }

    this.clearMap();
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
    this.currentInteraction = undefined;

    this.renderMap();
    this.player?.setProjection(this.projection);
    this.updatePlayer(false, this.time.now, false);
    this.configureCamera();
    this.refreshInteractionTarget();
    this.options.callbacks.onMapChanged(world);
  }

  public cancelTransition(): void {
    if (!this.transitionPending) return;
    this.state = { ...this.lastOutsideExitState };
    this.transitionPending = false;
    this.exitArmed = false;
    this.rearmAfter = this.time.now + FAILED_TRANSITION_COOLDOWN_MS;
    this.dirty = false;
    this.updatePlayer(false, this.time.now, false);
    this.refreshInteractionTarget();
    this.options.callbacks.onStateChanged(this.getState());
  }

  private projectionFor(manifest: MapManifest): IsometricProjection {
    return {
      tileWidth: manifest.tileWidth,
      tileHeight: manifest.tileHeight,
      originX: manifest.projectionOrigin.x,
      originY: manifest.projectionOrigin.y,
    };
  }

  private renderMap(): void {
    this.terrain = renderTerrain(this, this.manifest);
    this.worldObjects = renderWorldObjects(this, this.manifest);
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
    this.terrain?.destroy();
    this.terrain = undefined;
    for (const object of this.worldObjects) object.container.destroy(true);
    this.worldObjects = [];
    for (const marker of this.interactionMarkers) marker.destroy();
    this.interactionMarkers = [];
    this.collisionDebug?.destroy();
    this.collisionDebug = undefined;
  }

  private configureCamera(): void {
    const bounds = this.manifest.cameraBounds;
    this.cameras.main.setBounds(
      bounds.minX,
      bounds.minY,
      bounds.maxX - bounds.minX,
      bounds.maxY - bounds.minY,
    );
    if (this.player !== undefined) {
      this.cameras.main.startFollow(
        this.player.container,
        true,
        this.options.reducedMotion ? 1 : 0.13,
        this.options.reducedMotion ? 1 : 0.13,
      );
      this.cameras.main.setDeadzone(70, 46);
    }
  }

  private updatePlayer(moving: boolean, time: number, jogging: boolean): void {
    this.player?.update(
      { x: this.state.x, y: this.state.y },
      this.state.facingDirection,
      moving,
      time,
      jogging,
    );
    this.collisionDebug?.updatePlayer(this.state);
  }

  private checkExit(time: number): void {
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
    const next = closestInteraction(
      { x: this.state.x, y: this.state.y },
      this.manifest.interactions,
    );
    if (next?.id === this.currentInteraction?.id) return;
    this.currentInteraction = next;
    this.options.callbacks.onInteractionTarget(
      next === undefined ? null : { id: next.id, label: 'Read landmark' },
    );
  }

  private renderInteractionMarkers(): void {
    this.interactionMarkers = this.manifest.interactions.map((interaction) => {
      const screen = projectWorld(interaction, this.projection);
      const marker = this.add.graphics();
      marker.fillStyle(0xf1d375, 0.16).fillCircle(0, -21, 18);
      marker.fillStyle(0xf1d375, 0.9).fillCircle(0, -21, 4);
      marker.setPosition(screen.x, screen.y);
      marker.setDepth(999_999_500);
      if (!this.options.reducedMotion) {
        this.tweens.add({
          targets: marker,
          alpha: { from: 0.55, to: 1 },
          duration: 1_350,
          ease: 'Sine.InOut',
          yoyo: true,
          repeat: -1,
        });
      }
      return marker;
    });
  }
}
