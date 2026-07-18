import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlayerExperienceGameTestFixture } from '@starville/player-experience';

import {
  loadPlayerExperience,
  refreshPlayerDailyObjectives,
  startPlayerOnboarding,
} from './player-experience-client';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('player experience client', () => {
  it('loads the shared strict workspace contract', async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({ success: true, data: createPlayerExperienceGameTestFixture() }),
    );
    const workspace = await loadPlayerExperience('http://localhost:4000');
    expect(workspace.onboarding.steps).toHaveLength(14);
    expect(workspace.daily.objectives).toHaveLength(3);
    expect(workspace.persistence).toBe('game_test');
    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];
    expect(String(url)).toBe(
      'http://localhost:4000/api/v1/token-access/player/experience?after=0&limit=20',
    );
    expect(init?.credentials).toBe('include');
    expect(init?.method).toBe('GET');
  });

  it('sends revisioned onboarding start mutations through the protected player route', async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({ success: true, data: createPlayerExperienceGameTestFixture() }),
    );
    await startPlayerOnboarding('http://localhost:4000', 3);
    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];
    expect(init?.method).toBe('POST');
    expect(String(init?.body)).toContain('"expectedRevision":3');
    expect(String(init?.body)).toContain('player-experience-');
  });

  it('requests only a revision-bound authoritative daily refresh', async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({ success: true, data: createPlayerExperienceGameTestFixture() }),
    );
    await refreshPlayerDailyObjectives('http://localhost:4000', 4);
    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];
    expect(String(url)).toBe(
      'http://localhost:4000/api/v1/token-access/player/experience/daily-refresh',
    );
    expect(String(init?.body)).toContain('"expectedAssignmentRevision":4');
    expect(String(init?.body)).not.toContain('gameDayKey');
    expect(String(init?.body)).not.toContain('objectiveKey');
  });
});
