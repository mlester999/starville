import { describe, expect, it, vi } from 'vitest';

import { getPhase12ELanternSquareCandidate } from '@starville/game-content';

import { MAXIMUM_OBJECT_AMBIENT_ANIMATIONS, renderWorldObjectAmbience } from './world-ambience';

function chainableGameObject() {
  const target = {};
  return new Proxy(target, {
    get(value, property, receiver) {
      if (Reflect.has(value, property)) return Reflect.get(value, property, receiver);
      const method = vi.fn(() => receiver);
      Reflect.set(value, property, method);
      return method;
    },
  });
}

function fixture() {
  const manifest = getPhase12ELanternSquareCandidate().manifest;
  const containers = new Map(manifest.objects.map((object) => [object.id, chainableGameObject()]));
  const rendered = manifest.objects.map((object) => ({
    id: object.id,
    container: containers.get(object.id)!,
  }));
  const glowNodes: object[] = [];
  const scene = {
    add: {
      graphics: vi.fn(() => {
        const node = chainableGameObject();
        glowNodes.push(node);
        return node;
      }),
    },
    tweens: {
      add: vi.fn(),
      killTweensOf: vi.fn(),
    },
  };
  return { manifest, containers, rendered, glowNodes, scene };
}

describe('world object ambience', () => {
  it('adds bounded deterministic ambience without changing authoritative collision', () => {
    const first = fixture();
    const collisionBefore = JSON.stringify(first.manifest.collisions);
    const layer = renderWorldObjectAmbience(
      first.scene as never,
      first.manifest,
      first.rendered as never,
      { quality: 'high' },
    );

    expect(layer.metrics.activeAnimationCount).toBeLessThanOrEqual(
      MAXIMUM_OBJECT_AMBIENT_ANIMATIONS,
    );
    expect(layer.metrics.glowNodeCount).toBeGreaterThan(0);
    expect(layer.metrics.animationPlans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ effect: 'lantern_flicker' }),
        expect.objectContaining({ effect: 'foliage_sway' }),
        expect.objectContaining({ effect: 'hearth_glow' }),
        expect.objectContaining({ effect: 'workbench_idle' }),
      ]),
    );
    expect(JSON.stringify(first.manifest.collisions)).toBe(collisionBefore);
    expect(first.scene.tweens.add).toHaveBeenCalledTimes(layer.metrics.activeAnimationCount);

    const second = fixture();
    const secondLayer = renderWorldObjectAmbience(
      second.scene as never,
      second.manifest,
      second.rendered as never,
      { quality: 'high' },
    );
    expect(secondLayer.metrics.animationPlans).toEqual(layer.metrics.animationPlans);
  });

  it('keeps static landmark glow but disables continuous motion for Reduced Motion', () => {
    const { manifest, rendered, scene, glowNodes } = fixture();
    const layer = renderWorldObjectAmbience(scene as never, manifest, rendered as never, {
      quality: 'balanced',
      reducedMotion: true,
      highContrast: true,
    });

    expect(layer.metrics.activeAnimationCount).toBe(0);
    expect(layer.metrics.glowNodeCount).toBeGreaterThan(0);
    expect(glowNodes).toHaveLength(layer.metrics.glowNodeCount);
    expect(scene.tweens.add).not.toHaveBeenCalled();
    expect(
      glowNodes.some((node) => Reflect.get(node, 'strokeEllipse')?.mock.calls.length > 0),
    ).toBe(true);
  });

  it('sways a split foliage base and foreground as one visual without tearing', () => {
    const { manifest, rendered, scene, containers } = fixture();
    const tree = manifest.objects.find(({ kind }) => kind === 'tree')!;
    const foreground = chainableGameObject();
    const renderedWithForeground = rendered.map((object) =>
      object.id === tree.id ? { ...object, foreground } : object,
    );

    const layer = renderWorldObjectAmbience(
      scene as never,
      manifest,
      renderedWithForeground as never,
      { quality: 'high' },
    );
    const base = containers.get(tree.id)!;
    const swayTween = scene.tweens.add.mock.calls
      .map(([config]) => config as { targets?: unknown })
      .find(
        ({ targets }) =>
          Array.isArray(targets) && targets.includes(base) && targets.includes(foreground),
      );

    expect(swayTween?.targets).toEqual([base, foreground]);
    expect(Reflect.get(base, 'setAngle')).toHaveBeenCalledWith(-0.42);
    expect(Reflect.get(foreground, 'setAngle')).toHaveBeenCalledWith(-0.42);

    layer.destroy();
    expect(scene.tweens.killTweensOf).toHaveBeenCalledWith([base, foreground]);
    expect(Reflect.get(base, 'setAngle')).toHaveBeenLastCalledWith(0);
    expect(Reflect.get(foreground, 'setAngle')).toHaveBeenLastCalledWith(0);
  });

  it('creates no ambient nodes in low quality or when ambience is disabled', () => {
    for (const options of [{ quality: 'low' as const }, { enabled: false }]) {
      const { manifest, rendered, scene } = fixture();
      const layer = renderWorldObjectAmbience(scene as never, manifest, rendered as never, options);
      expect(layer.metrics).toEqual({
        glowNodeCount: 0,
        activeAnimationCount: 0,
        animationPlans: [],
      });
      expect(scene.add.graphics).not.toHaveBeenCalled();
      expect(scene.tweens.add).not.toHaveBeenCalled();
    }
  });

  it('kills owned tweens, restores foliage bases, and destroys glow nodes exactly once', () => {
    const { manifest, rendered, scene, glowNodes, containers } = fixture();
    const layer = renderWorldObjectAmbience(scene as never, manifest, rendered as never, {
      quality: 'balanced',
    });

    layer.destroy();
    layer.destroy();

    expect(scene.tweens.killTweensOf).toHaveBeenCalledTimes(layer.metrics.activeAnimationCount);
    for (const glow of glowNodes) expect(Reflect.get(glow, 'destroy')).toHaveBeenCalledTimes(1);
    const swayingIds = layer.metrics.animationPlans
      .filter(({ effect }) => effect === 'foliage_sway')
      .map(({ objectId }) => objectId);
    for (const id of swayingIds) {
      expect(Reflect.get(containers.get(id)!, 'setAngle')).toHaveBeenLastCalledWith(0);
    }
  });
});
