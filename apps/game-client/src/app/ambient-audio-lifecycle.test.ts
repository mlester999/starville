import { describe, expect, it, vi } from 'vitest';

import { AmbientAudioLifecycle, type AmbientAudioTrack } from './ambient-audio-lifecycle';

function track(): AmbientAudioTrack {
  return {
    loop: false,
    volume: 1,
    paused: true,
    play: vi.fn(async function (this: AmbientAudioTrack) {
      Reflect.set(this, 'paused', false);
    }),
    pause: vi.fn(function (this: AmbientAudioTrack) {
      Reflect.set(this, 'paused', true);
    }),
  };
}

describe('ambient audio lifecycle', () => {
  it('stays silent without an approved repository source', () => {
    const createTrack = vi.fn(track);
    const lifecycle = new AmbientAudioLifecycle({ createTrack, sources: {} });
    lifecycle.setLocation('lantern-square');
    lifecycle.armFromUserGesture();
    expect(createTrack).not.toHaveBeenCalled();
    lifecycle.dispose();
  });

  it('arms after a gesture, separates ambience volume, and pauses in background tabs', async () => {
    const listeners = new Map<string, EventListener>();
    const fakeDocument = {
      visibilityState: 'visible',
      addEventListener: vi.fn((name: string, listener: EventListener) =>
        listeners.set(name, listener),
      ),
      removeEventListener: vi.fn((name: string) => listeners.delete(name)),
    };
    const created = track();
    const lifecycle = new AmbientAudioLifecycle({
      createTrack: () => created,
      sources: { 'lantern-square': '/approved/lantern-square.ogg' },
      document: fakeDocument as unknown as Document,
    });
    lifecycle.setSettings({ masterVolume: 0.5, ambienceVolume: 0.4, muted: false });
    lifecycle.setLocation('lantern-square');
    expect(created.play).not.toHaveBeenCalled();
    lifecycle.armFromUserGesture();
    await Promise.resolve();
    expect(created.loop).toBe(true);
    expect(created.volume).toBeCloseTo(0.2);
    expect(created.play).toHaveBeenCalledTimes(1);
    Reflect.set(fakeDocument, 'visibilityState', 'hidden');
    listeners.get('visibilitychange')?.(new Event('visibilitychange'));
    expect(created.pause).toHaveBeenCalledTimes(1);
    lifecycle.dispose();
    expect(fakeDocument.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it('fades between approved locations and retires the old loop', async () => {
    vi.useFakeTimers();
    const first = track();
    const second = track();
    const createTrack = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const lifecycle = new AmbientAudioLifecycle({
      createTrack,
      sources: {
        'lantern-square': '/approved/lantern-square.ogg',
        'private-home': '/approved/private-home.ogg',
      },
      fadeDurationMs: 100,
      fadeStepMs: 20,
      document: {
        visibilityState: 'visible',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as Document,
    });
    lifecycle.setLocation('lantern-square');
    lifecycle.armFromUserGesture();
    await Promise.resolve();
    lifecycle.setLocation('private-home');
    await Promise.resolve();
    expect(second.play).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(120);
    expect(first.pause).toHaveBeenCalledTimes(1);
    expect(second.volume).toBeCloseTo(0.48);
    lifecycle.dispose();
    vi.useRealTimers();
  });
});
