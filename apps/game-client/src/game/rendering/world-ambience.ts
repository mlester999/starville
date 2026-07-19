import type Phaser from 'phaser';

import {
  depthForFootPosition,
  projectWorld,
  type MapManifest,
  type WorldVisualQuality,
} from '@starville/game-core';

import type { RenderedWorldObject } from './world-objects';

export const MAXIMUM_OBJECT_AMBIENT_ANIMATIONS = 16;

export interface WorldObjectAmbienceOptions {
  readonly enabled?: boolean;
  readonly reducedMotion?: boolean;
  readonly quality?: WorldVisualQuality;
  readonly highContrast?: boolean;
}

export interface WorldObjectAmbienceAnimationPlan {
  readonly objectId: string;
  readonly effect: 'foliage_sway' | 'lantern_flicker' | 'hearth_glow' | 'workbench_idle';
  readonly durationMs: number;
  readonly delayMs: number;
}

export interface WorldObjectAmbienceMetrics {
  readonly glowNodeCount: number;
  readonly activeAnimationCount: number;
  readonly animationPlans: readonly WorldObjectAmbienceAnimationPlan[];
}

export interface WorldObjectAmbienceLayer {
  readonly metrics: WorldObjectAmbienceMetrics;
  destroy(): void;
}

interface AmbientCandidate {
  readonly object: MapManifest['objects'][number];
  readonly rendered: RenderedWorldObject;
  readonly priority: number;
  readonly effect: WorldObjectAmbienceAnimationPlan['effect'];
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function ambientEffectForObject(
  object: MapManifest['objects'][number],
): Pick<AmbientCandidate, 'effect' | 'priority'> | undefined {
  if (object.kind === 'lamp') return { effect: 'lantern_flicker', priority: 0 };
  if (object.kind === 'cooking_station') return { effect: 'hearth_glow', priority: 1 };
  if (object.kind === 'crafting_station') return { effect: 'workbench_idle', priority: 2 };
  if (object.kind === 'tree') return { effect: 'foliage_sway', priority: 3 };
  if (object.kind === 'bush') return { effect: 'foliage_sway', priority: 4 };
  if (object.kind === 'flowers') return { effect: 'foliage_sway', priority: 5 };
  return undefined;
}

function animationPlan(candidate: AmbientCandidate): WorldObjectAmbienceAnimationPlan {
  const seed = stableHash(`${candidate.object.id}:${candidate.effect}`);
  const durationBase =
    candidate.effect === 'foliage_sway'
      ? 3_200
      : candidate.effect === 'lantern_flicker'
        ? 1_900
        : 2_400;
  return {
    objectId: candidate.object.id,
    effect: candidate.effect,
    durationMs: durationBase + (seed % 7) * 110,
    delayMs: seed % 1_200,
  };
}

function drawGlow(
  scene: Phaser.Scene,
  manifest: MapManifest,
  object: MapManifest['objects'][number],
  effect: Exclude<WorldObjectAmbienceAnimationPlan['effect'], 'foliage_sway'>,
  highContrast: boolean,
): Phaser.GameObjects.Graphics {
  const screen = projectWorld(object, {
    tileWidth: manifest.tileWidth,
    tileHeight: manifest.tileHeight,
    originX: manifest.projectionOrigin.x,
    originY: manifest.projectionOrigin.y,
  });
  const glow = scene.add.graphics();
  const color = highContrast ? 0xfff4b0 : effect === 'workbench_idle' ? 0xb9e4c7 : 0xffc96b;
  const alpha = highContrast ? 0.3 : effect === 'lantern_flicker' ? 0.18 : 0.14;
  const width = effect === 'lantern_flicker' ? 54 : effect === 'hearth_glow' ? 72 : 58;
  const height = effect === 'lantern_flicker' ? 36 : effect === 'hearth_glow' ? 30 : 22;
  const offsetY = effect === 'lantern_flicker' ? -61 : effect === 'hearth_glow' ? -28 : -20;
  glow.fillStyle(color, alpha).fillEllipse(0, offsetY, width, height);
  if (highContrast) glow.lineStyle(2, 0xffffff, 0.72).strokeEllipse(0, offsetY, width, height);
  glow
    .setPosition(screen.x, screen.y)
    .setDepth(depthForFootPosition(object.x, object.y, `${object.id}:ambient`) - 1);
  return glow;
}

/**
 * Adds bounded presentation-only life to already-rendered world objects. It
 * never creates collision, interaction, persistence, or authoritative state.
 */
export function renderWorldObjectAmbience(
  scene: Phaser.Scene,
  manifest: MapManifest,
  renderedObjects: readonly RenderedWorldObject[],
  options: WorldObjectAmbienceOptions = {},
): WorldObjectAmbienceLayer {
  const enabled = options.enabled !== false && options.quality !== 'low';
  if (!enabled) {
    return {
      metrics: { glowNodeCount: 0, activeAnimationCount: 0, animationPlans: [] },
      destroy: () => undefined,
    };
  }

  const renderedById = new Map(renderedObjects.map((rendered) => [rendered.id, rendered]));
  const candidates = manifest.objects
    .flatMap((object): AmbientCandidate[] => {
      const rendered = renderedById.get(object.id);
      const ambience = ambientEffectForObject(object);
      return rendered === undefined || ambience === undefined
        ? []
        : [{ object, rendered, ...ambience }];
    })
    .sort(
      (left, right) =>
        left.priority - right.priority || left.object.id.localeCompare(right.object.id),
    );
  const animatedCandidates = options.reducedMotion
    ? []
    : candidates.slice(0, MAXIMUM_OBJECT_AMBIENT_ANIMATIONS);
  const animationPlans = animatedCandidates.map(animationPlan);
  const ownedNodes: Phaser.GameObjects.Graphics[] = [];
  const animatedTargets: Phaser.GameObjects.GameObject[] = [];

  for (const candidate of candidates) {
    if (candidate.effect === 'foliage_sway') continue;
    ownedNodes.push(
      drawGlow(scene, manifest, candidate.object, candidate.effect, options.highContrast === true),
    );
  }

  for (const [index, candidate] of animatedCandidates.entries()) {
    const plan = animationPlans[index]!;
    if (candidate.effect === 'foliage_sway') {
      const amplitude =
        candidate.object.kind === 'tree' ? 0.42 : candidate.object.kind === 'bush' ? 0.3 : 0.5;
      candidate.rendered.container.setAngle(-amplitude);
      scene.tweens?.add({
        targets: candidate.rendered.container,
        angle: { from: -amplitude, to: amplitude },
        duration: plan.durationMs,
        delay: plan.delayMs,
        ease: 'Sine.InOut',
        yoyo: true,
        repeat: -1,
      });
      animatedTargets.push(candidate.rendered.container);
      continue;
    }

    const glowIndex = candidates
      .filter(({ effect }) => effect !== 'foliage_sway')
      .findIndex(({ object }) => object.id === candidate.object.id);
    const glow = ownedNodes[glowIndex];
    if (glow === undefined) continue;
    scene.tweens?.add({
      targets: glow,
      alpha: { from: 0.7, to: 1 },
      duration: plan.durationMs,
      delay: plan.delayMs,
      ease: 'Sine.InOut',
      yoyo: true,
      repeat: -1,
    });
    animatedTargets.push(glow);
  }

  let destroyed = false;
  return {
    metrics: {
      glowNodeCount: ownedNodes.length,
      activeAnimationCount: animationPlans.length,
      animationPlans: Object.freeze(animationPlans),
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      for (const target of animatedTargets) {
        scene.tweens?.killTweensOf(target);
        if (!ownedNodes.includes(target as Phaser.GameObjects.Graphics)) {
          (target as Phaser.GameObjects.Container).setAngle(0);
        }
      }
      for (const node of ownedNodes) node.destroy();
    },
  };
}
