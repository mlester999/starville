import { describe, expect, it, vi } from 'vitest';

import { fallbackResolvedAvatar } from '../../app/avatar-client';
import { PlayerRenderer } from './player';
import { stablePresenceDepthTie } from './avatar-style';

class FakeGraphics {
  public readonly commands: unknown[][] = [];
  public clear() {
    this.commands.push(['clear']);
    return this;
  }
  public fillStyle(...values: unknown[]) {
    this.commands.push(['fillStyle', ...values]);
    return this;
  }
  public lineStyle(...values: unknown[]) {
    this.commands.push(['lineStyle', ...values]);
    return this;
  }
  public lineBetween(...values: unknown[]) {
    this.commands.push(['lineBetween', ...values]);
    return this;
  }
  public fillEllipse(...values: unknown[]) {
    this.commands.push(['fillEllipse', ...values]);
    return this;
  }
  public fillRoundedRect(...values: unknown[]) {
    this.commands.push(['fillRoundedRect', ...values]);
    return this;
  }
  public fillTriangle(...values: unknown[]) {
    this.commands.push(['fillTriangle', ...values]);
    return this;
  }
  public fillCircle(...values: unknown[]) {
    this.commands.push(['fillCircle', ...values]);
    return this;
  }
  public strokeCircle(...values: unknown[]) {
    this.commands.push(['strokeCircle', ...values]);
    return this;
  }
  public beginPath() {
    return this;
  }
  public arc(...values: unknown[]) {
    this.commands.push(['arc', ...values]);
    return this;
  }
  public strokePath() {
    return this;
  }
}

class FakeContainer {
  public x = 0;
  public y = 0;
  public depth = 0;
  public readonly children: readonly FakeGraphics[];
  public destroyed = false;
  public constructor(children: readonly FakeGraphics[]) {
    this.children = children;
  }
  public setSize() {
    return this;
  }
  public setPosition(x: number, y: number) {
    this.x = x;
    this.y = y;
    return this;
  }
  public setDepth(depth: number) {
    this.depth = depth;
    return this;
  }
  public setScale() {
    return this;
  }
  public destroy() {
    this.destroyed = true;
  }
}

function fixture() {
  const graphics: FakeGraphics[] = [];
  let container: FakeContainer | undefined;
  const scene = {
    add: {
      graphics: vi.fn(() => {
        const value = new FakeGraphics();
        graphics.push(value);
        return value;
      }),
      container: vi.fn((_x: number, _y: number, children: readonly FakeGraphics[]) => {
        container = new FakeContainer(children);
        return container;
      }),
    },
  };
  const renderer = new PlayerRenderer(
    scene as never,
    fallbackResolvedAvatar('moss'),
    { tileWidth: 96, tileHeight: 48, originX: 0, originY: 0 },
    false,
    0.031,
  );
  return {
    renderer,
    graphics,
    get container() {
      return container!;
    },
  };
}

describe('modular fallback avatar renderer', () => {
  it('owns separate ordered layers and visibly alternates walking and jogging legs', () => {
    const view = fixture();
    expect(view.graphics).toHaveLength(7);
    expect(view.container.children).toEqual(view.graphics);

    view.renderer.update({ x: 5, y: 4 }, 'southeast', true, 100, false);
    const walkLegs = view.graphics[2]!.commands.filter((command) => command[0] === 'lineBetween');
    view.renderer.update({ x: 5.2, y: 4.2 }, 'southeast', true, 150, true);
    const jogLegs = view.graphics[2]!.commands.filter((command) => command[0] === 'lineBetween');
    expect(walkLegs).toHaveLength(2);
    expect(jogLegs.slice(-2)).not.toEqual(walkLegs);
  });

  it('updates appearance in place without resetting position, container, or depth tie', () => {
    const view = fixture();
    view.renderer.update({ x: 9, y: 8 }, 'west', false, 0);
    const container = view.container;
    const before = { x: container.x, y: container.y, depth: container.depth };
    const replacement = {
      ...fallbackResolvedAvatar('river', '22222222-2222-4222-8222-222222222222'),
      revision: 4,
    };
    view.renderer.setAppearance(replacement);
    expect(view.renderer.getAppearanceReference()).toEqual({
      appearanceId: replacement.appearanceId,
      revision: 4,
    });
    expect(view.container).toBe(container);
    expect({ x: container.x, y: container.y, depth: container.depth }).toEqual(before);
  });

  it('uses a deterministic, bounded depth tie per presence', () => {
    const left = stablePresenceDepthTie('10000000-0000-4000-8000-000000000001');
    const repeated = stablePresenceDepthTie('10000000-0000-4000-8000-000000000001');
    const right = stablePresenceDepthTie('10000000-0000-4000-8000-000000000002');
    expect(left).toBe(repeated);
    expect(left).not.toBe(right);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(left).toBeLessThan(0.1);
  });
});
