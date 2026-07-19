import type Phaser from 'phaser';

import {
  resolveWorldAssetDelivery,
  type AssetResolutionContext,
  type ResolvedAsset,
  type WorldAssetDelivery,
} from '@starville/asset-management';
import {
  depthForFootPosition,
  projectWorld,
  type MapManifest,
  type WorldInteraction,
} from '@starville/game-core';

import { resolvedWorldAssetTextureKey } from './world-asset-textures';

export type InteractionMarkerRole = 'target' | 'unavailable' | 'quest' | 'onboarding' | 'landmark';

export const INTERACTION_MARKER_ASSET_KEYS = [
  'ui.interaction',
  'ui.warning',
  'ui.quest.active',
  'ui.objective.active',
] as const;

export interface InteractionMarkerState {
  readonly targetedInteractionId?: string | null;
  readonly unavailableInteractionIds?: ReadonlySet<string>;
  readonly questRelevantInteractionIds?: ReadonlySet<string>;
  readonly onboardingRelevantInteractionIds?: ReadonlySet<string>;
  readonly reducedMotion?: boolean;
  readonly highContrast?: boolean;
}

export interface InteractionMarkerPresentation {
  readonly role: InteractionMarkerRole;
  readonly assetKey: 'ui.interaction' | 'ui.warning' | 'ui.quest.active' | 'ui.objective.active';
  readonly color: number;
  readonly ringAlpha: number;
  readonly iconAlpha: number;
  readonly ringWidth: number;
  readonly iconSize: number;
  readonly animated: boolean;
}

export interface InteractionMarkerMediaResolution {
  readonly source: 'exact_delivery' | 'bundled_v1_fallback' | 'procedural';
  readonly asset?: ResolvedAsset;
}

export interface InteractionMarkerMetrics {
  readonly markerCount: number;
  readonly animatedMarkerCount: number;
  readonly exactMediaCount: number;
  readonly v1FallbackCount: number;
  readonly proceduralCount: number;
}

export interface InteractionMarkerLayer {
  readonly metrics: InteractionMarkerMetrics;
  setState(state: InteractionMarkerState): void;
  destroy(): void;
}

function semanticOnboardingInteraction(interaction: WorldInteraction): boolean {
  return interaction.type === 'starter_npc' || interaction.id.includes('guide');
}

export function resolveInteractionMarkerPresentation(
  interaction: WorldInteraction,
  state: InteractionMarkerState = {},
): InteractionMarkerPresentation {
  const role: InteractionMarkerRole =
    state.targetedInteractionId === interaction.id
      ? 'target'
      : state.unavailableInteractionIds?.has(interaction.id) === true
        ? 'unavailable'
        : state.questRelevantInteractionIds?.has(interaction.id) === true
          ? 'quest'
          : state.onboardingRelevantInteractionIds?.has(interaction.id) === true ||
              semanticOnboardingInteraction(interaction)
            ? 'onboarding'
            : 'landmark';
  const highContrast = state.highContrast === true;
  const animated = state.reducedMotion !== true && ['target', 'quest', 'onboarding'].includes(role);

  if (role === 'unavailable') {
    return {
      role,
      assetKey: 'ui.warning',
      color: highContrast ? 0xffffff : 0xc9786f,
      ringAlpha: highContrast ? 0.78 : 0.38,
      iconAlpha: 0.9,
      ringWidth: highContrast ? 4 : 2,
      iconSize: 22,
      animated: false,
    };
  }
  if (role === 'quest') {
    return {
      role,
      assetKey: 'ui.quest.active',
      color: highContrast ? 0xffff00 : 0xcdb7ed,
      ringAlpha: highContrast ? 0.84 : 0.46,
      iconAlpha: 1,
      ringWidth: highContrast ? 4 : 2,
      iconSize: 25,
      animated,
    };
  }
  if (role === 'onboarding') {
    return {
      role,
      assetKey: 'ui.objective.active',
      color: highContrast ? 0x00ffff : 0x9fd6ad,
      ringAlpha: highContrast ? 0.82 : 0.4,
      iconAlpha: 0.96,
      ringWidth: highContrast ? 4 : 2,
      iconSize: 24,
      animated,
    };
  }
  if (role === 'target') {
    return {
      role,
      assetKey: 'ui.interaction',
      color: highContrast ? 0xffff00 : 0xf1d375,
      ringAlpha: highContrast ? 0.9 : 0.58,
      iconAlpha: 1,
      ringWidth: highContrast ? 4 : 3,
      iconSize: 28,
      animated,
    };
  }
  return {
    role,
    assetKey: 'ui.interaction',
    color: highContrast ? 0xffffff : 0x9ebaa8,
    ringAlpha: highContrast ? 0.56 : 0.2,
    iconAlpha: highContrast ? 0.82 : 0.48,
    ringWidth: highContrast ? 3 : 1.5,
    iconSize: 18,
    animated: false,
  };
}

/**
 * Diagnostic/runtime helper for marker media only. An exact pinned delivery is
 * preferred; if its texture is unavailable, the helper checks the immutable V1
 * bundled default before using a procedural shape. It never changes world pins.
 */
export function resolveInteractionMarkerMedia(input: {
  readonly scene: Pick<Phaser.Scene, 'textures'>;
  readonly assetKey: InteractionMarkerPresentation['assetKey'];
  readonly context: AssetResolutionContext;
  readonly delivery?: WorldAssetDelivery;
}): InteractionMarkerMediaResolution {
  const selected = resolveWorldAssetDelivery({
    assetKey: input.assetKey,
    context: input.context,
    ...(input.delivery === undefined ? {} : { delivery: input.delivery }),
  });
  if (input.scene.textures.exists(resolvedWorldAssetTextureKey(selected))) {
    return {
      source: input.delivery === undefined ? 'bundled_v1_fallback' : 'exact_delivery',
      asset: selected,
    };
  }

  const v1 = resolveWorldAssetDelivery({ assetKey: input.assetKey, context: input.context });
  if (input.scene.textures.exists(resolvedWorldAssetTextureKey(v1))) {
    return { source: 'bundled_v1_fallback', asset: v1 };
  }
  return { source: 'procedural' };
}

function drawProceduralIcon(
  graphics: Phaser.GameObjects.Graphics,
  presentation: InteractionMarkerPresentation,
): void {
  const radius = presentation.iconSize / 2;
  graphics.lineStyle(presentation.ringWidth, presentation.color, presentation.iconAlpha);
  if (presentation.role === 'quest') {
    graphics.strokePoints(
      [
        { x: 0, y: -radius },
        { x: radius, y: 0 },
        { x: 0, y: radius },
        { x: -radius, y: 0 },
      ],
      true,
    );
    return;
  }
  graphics.strokeCircle(0, 0, radius);
  if (presentation.role === 'unavailable') {
    graphics.lineBetween(-radius * 0.45, -radius * 0.45, radius * 0.45, radius * 0.45);
    graphics.lineBetween(radius * 0.45, -radius * 0.45, -radius * 0.45, radius * 0.45);
  } else {
    graphics.fillStyle(presentation.color, presentation.iconAlpha).fillCircle(0, 0, 3);
  }
}

function stateSignature(state: InteractionMarkerState): string {
  const stableSet = (value: ReadonlySet<string> | undefined) =>
    value === undefined ? '' : [...value].sort().join(',');
  return [
    state.targetedInteractionId ?? '',
    stableSet(state.unavailableInteractionIds),
    stableSet(state.questRelevantInteractionIds),
    stableSet(state.onboardingRelevantInteractionIds),
    state.reducedMotion === true ? 'reduced' : 'motion',
    state.highContrast === true ? 'contrast' : 'standard',
  ].join('|');
}

export function renderInteractionMarkerLayer(
  scene: Phaser.Scene,
  manifest: MapManifest,
  deliveries: readonly WorldAssetDelivery[] = [],
  options: Readonly<{
    assetResolutionContext?: AssetResolutionContext;
    state?: InteractionMarkerState;
  }> = {},
): InteractionMarkerLayer {
  const deliveriesByKey = new Map(deliveries.map((delivery) => [delivery.assetKey, delivery]));
  const context = options.assetResolutionContext ?? 'published_world';
  const projection = {
    tileWidth: manifest.tileWidth,
    tileHeight: manifest.tileHeight,
    originX: manifest.projectionOrigin.x,
    originY: manifest.projectionOrigin.y,
  };
  let currentState = options.state ?? {};
  let signature = '';
  let nodes: Phaser.GameObjects.GameObject[] = [];
  let animatedTargets: Phaser.GameObjects.GameObject[] = [];
  let metrics: InteractionMarkerMetrics = {
    markerCount: 0,
    animatedMarkerCount: 0,
    exactMediaCount: 0,
    v1FallbackCount: 0,
    proceduralCount: 0,
  };
  let destroyed = false;

  const clear = (): void => {
    for (const target of animatedTargets) scene.tweens?.killTweensOf(target);
    for (const node of nodes) node.destroy();
    nodes = [];
    animatedTargets = [];
  };

  const render = (): void => {
    clear();
    let animatedMarkerCount = 0;
    let exactMediaCount = 0;
    let v1FallbackCount = 0;
    let proceduralCount = 0;
    for (const interaction of manifest.interactions) {
      const presentation = resolveInteractionMarkerPresentation(interaction, currentState);
      const screen = projectWorld(interaction, projection);
      const baseDepth = depthForFootPosition(
        interaction.x,
        interaction.y,
        `interaction:${interaction.id}`,
      );
      const ring = scene.add.graphics();
      ring
        .fillStyle(presentation.color, presentation.ringAlpha * 0.18)
        .fillEllipse(
          0,
          0,
          presentation.role === 'target' ? 38 : 30,
          presentation.role === 'target' ? 19 : 15,
        )
        .lineStyle(presentation.ringWidth, presentation.color, presentation.ringAlpha)
        .strokeEllipse(
          0,
          0,
          presentation.role === 'target' ? 38 : 30,
          presentation.role === 'target' ? 19 : 15,
        )
        .setPosition(screen.x, screen.y)
        .setDepth(baseDepth - 4);
      nodes.push(ring);

      const media = resolveInteractionMarkerMedia({
        scene,
        assetKey: presentation.assetKey,
        context,
        ...(deliveriesByKey.get(presentation.assetKey) === undefined
          ? {}
          : { delivery: deliveriesByKey.get(presentation.assetKey)! }),
      });
      let icon: Phaser.GameObjects.GameObject;
      if (media.asset !== undefined) {
        const image = scene.add.image(
          screen.x,
          screen.y - 31,
          resolvedWorldAssetTextureKey(media.asset),
        );
        image
          .setOrigin(0.5, 0.5)
          .setDisplaySize(presentation.iconSize, presentation.iconSize)
          .setAlpha(presentation.iconAlpha)
          .setDepth(baseDepth + 420);
        icon = image;
        if (media.source === 'exact_delivery') exactMediaCount += 1;
        else v1FallbackCount += 1;
      } else {
        const graphics = scene.add.graphics();
        drawProceduralIcon(graphics, presentation);
        graphics
          .setPosition(screen.x, screen.y - 31)
          .setAlpha(presentation.iconAlpha)
          .setDepth(baseDepth + 420);
        icon = graphics;
        proceduralCount += 1;
      }
      nodes.push(icon);

      if (presentation.animated) {
        animatedMarkerCount += 1;
        scene.tweens?.add({
          targets: icon,
          alpha: { from: Math.max(0.62, presentation.iconAlpha - 0.2), to: presentation.iconAlpha },
          duration: 1_450,
          ease: 'Sine.InOut',
          yoyo: true,
          repeat: -1,
        });
        animatedTargets.push(icon);
      }
    }
    metrics = {
      markerCount: manifest.interactions.length,
      animatedMarkerCount,
      exactMediaCount,
      v1FallbackCount,
      proceduralCount,
    };
  };

  signature = stateSignature(currentState);
  render();

  return {
    get metrics() {
      return metrics;
    },
    setState(state: InteractionMarkerState): void {
      if (destroyed) return;
      const nextSignature = stateSignature(state);
      if (nextSignature === signature) return;
      currentState = state;
      signature = nextSignature;
      render();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      clear();
    },
  };
}
