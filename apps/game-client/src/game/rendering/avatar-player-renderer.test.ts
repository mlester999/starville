import { beforeEach, describe, expect, it, vi } from 'vitest';

const constructors = vi.hoisted(() => ({
  published: vi.fn(),
  candidate: vi.fn(),
}));

vi.mock('./player', () => ({
  PlayerRenderer: class {
    public readonly kind = 'published_v1';
    public constructor(...args: unknown[]) {
      constructors.published(...args);
    }
  },
}));

vi.mock('./phase12d-player', () => ({
  Phase12DPlayerRenderer: class {
    public readonly kind = 'phase12d_candidate';
    public constructor(...args: unknown[]) {
      constructors.candidate(...args);
    }
  },
}));

import { createAvatarPlayerRenderer } from './avatar-player-renderer';

describe('avatar player renderer selection', () => {
  beforeEach(() => {
    constructors.published.mockClear();
    constructors.candidate.mockClear();
  });

  it('preserves the published V1 renderer when V2 is not explicitly selected', () => {
    const renderer = createAvatarPlayerRenderer(
      'published_v1',
      {} as never,
      {} as never,
      {} as never,
      false,
    );
    expect(renderer).toMatchObject({ kind: 'published_v1' });
    expect(constructors.published).toHaveBeenCalledOnce();
    expect(constructors.candidate).not.toHaveBeenCalled();
  });

  it('uses the canonical Phase 12D rig only for candidate review', () => {
    const renderer = createAvatarPlayerRenderer(
      'phase12d_candidate',
      {} as never,
      {} as never,
      {} as never,
      true,
    );
    expect(renderer).toMatchObject({ kind: 'phase12d_candidate' });
    expect(constructors.candidate).toHaveBeenCalledOnce();
    expect(constructors.published).not.toHaveBeenCalled();
  });
});
