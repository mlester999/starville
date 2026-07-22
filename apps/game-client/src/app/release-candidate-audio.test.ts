import { describe, expect, it, vi } from 'vitest';

import {
  RELEASE_CANDIDATE_AUDIO_MANIFEST,
  ReleaseCandidateAudioManager,
  validateReleaseCandidateAudioManifest,
  type ReleaseCandidateAudioSettings,
} from './release-candidate-audio';

const SETTINGS: ReleaseCandidateAudioSettings = {
  masterVolume: 0.8,
  musicVolume: 0.45,
  ambienceVolume: 0.6,
  sfxVolume: 0.8,
  muted: false,
  musicMuted: false,
  ambienceMuted: false,
  sfxMuted: false,
};

function harness() {
  const listeners = new Map<string, EventListener>();
  const document = {
    visibilityState: 'visible',
    addEventListener: vi.fn((name: string, listener: EventListener) =>
      listeners.set(name, listener),
    ),
    removeEventListener: vi.fn((name: string) => listeners.delete(name)),
  };
  const engine = {
    resume: vi.fn(async () => undefined),
    suspend: vi.fn(async () => undefined),
    configure: vi.fn(),
    play: vi.fn(),
    dispose: vi.fn(),
  };
  return { document, engine, listeners };
}

describe('release-candidate procedural audio', () => {
  it('records original provenance and restrained development-safe classification for every cue', () => {
    expect(validateReleaseCandidateAudioManifest()).toEqual([]);
    expect(RELEASE_CANDIDATE_AUDIO_MANIFEST).toHaveLength(10);
    expect(
      RELEASE_CANDIDATE_AUDIO_MANIFEST.every(
        (entry) =>
          entry.classification === 'development_safe' &&
          entry.source === 'repository_generated_procedural_web_audio' &&
          entry.license === 'Starville project-owned original; no third-party audio',
      ),
    ).toBe(true);
  });

  it('waits for a gesture, starts one music and ambience loop, and prevents duplicate arming', async () => {
    vi.useFakeTimers();
    const { document, engine } = harness();
    const manager = new ReleaseCandidateAudioManager({
      document: document as unknown as Document,
      createEngine: () => engine,
    });
    manager.setSettings(SETTINGS);
    expect(engine.play).not.toHaveBeenCalled();
    await Promise.all([manager.armFromUserGesture(), manager.armFromUserGesture()]);
    expect(engine.resume).toHaveBeenCalledTimes(1);
    expect(engine.play).toHaveBeenCalledTimes(2);
    manager.setLocation('lantern-square');
    expect(engine.play).toHaveBeenCalledTimes(2);
    manager.dispose();
    vi.useRealTimers();
  });

  it('applies group mutes immediately and restarts only allowed location loops', async () => {
    vi.useFakeTimers();
    const { document, engine } = harness();
    const manager = new ReleaseCandidateAudioManager({
      document: document as unknown as Document,
      createEngine: () => engine,
    });
    await manager.armFromUserGesture();
    engine.play.mockClear();
    manager.setSettings({ ...SETTINGS, musicMuted: true });
    expect(engine.configure).toHaveBeenLastCalledWith({ ...SETTINGS, musicMuted: true });
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(engine.play.mock.calls[0]?.[0].group).toBe('ambient');
    manager.setLocation('personal-home');
    expect(engine.play.mock.calls.at(-1)?.[0].key).toBe('ambient.personal-home');
    manager.dispose();
    vi.useRealTimers();
  });

  it('suspends in hidden tabs, resumes without duplicate loops, and disposes listeners', async () => {
    vi.useFakeTimers();
    const { document, engine, listeners } = harness();
    const statuses: string[] = [];
    const manager = new ReleaseCandidateAudioManager({
      document: document as unknown as Document,
      createEngine: () => engine,
      onStatusChange: (status) => statuses.push(status),
    });
    await manager.armFromUserGesture();
    Reflect.set(document, 'visibilityState', 'hidden');
    listeners.get('visibilitychange')?.(new Event('visibilitychange'));
    expect(engine.suspend).toHaveBeenCalledTimes(1);
    expect(statuses).toContain('suspended');
    Reflect.set(document, 'visibilityState', 'visible');
    listeners.get('visibilitychange')?.(new Event('visibilitychange'));
    await Promise.resolve();
    expect(engine.resume).toHaveBeenCalledTimes(2);
    manager.dispose();
    expect(document.removeEventListener).toHaveBeenCalledTimes(1);
    expect(engine.dispose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('deduplicates rapid UI cues and provides text equivalents for meaningful sounds', async () => {
    const { document, engine } = harness();
    const text: string[] = [];
    let now = 100;
    const manager = new ReleaseCandidateAudioManager({
      document: document as unknown as Document,
      createEngine: () => engine,
      now: () => now,
      onMeaningfulCue: (value) => text.push(value),
    });
    await manager.armFromUserGesture();
    engine.play.mockClear();
    manager.play('sfx.ui-click');
    manager.play('sfx.ui-click');
    expect(engine.play).toHaveBeenCalledTimes(1);
    now += 250;
    manager.play('sfx.reconnect');
    expect(text).toEqual(['Connection restored.']);
    manager.dispose();
  });

  it('fails silent when Web Audio cannot be resumed', async () => {
    const { document, engine } = harness();
    engine.resume.mockRejectedValueOnce(new Error('unavailable'));
    const statuses: string[] = [];
    const manager = new ReleaseCandidateAudioManager({
      document: document as unknown as Document,
      createEngine: () => engine,
      onStatusChange: (status) => statuses.push(status),
    });
    await manager.armFromUserGesture();
    expect(manager.getStatus()).toBe('unavailable');
    expect(statuses).toEqual(['unavailable']);
    expect(engine.play).not.toHaveBeenCalled();
    manager.dispose();
  });
});
