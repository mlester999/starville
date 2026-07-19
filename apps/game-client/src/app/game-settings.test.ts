import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_GAME_SETTINGS,
  GAME_SETTINGS_STORAGE_KEY,
  loadGameSettings,
  saveGameSettings,
} from './game-settings';

describe('local game settings', () => {
  it('defaults to a compact, balanced visual experience', () => {
    expect(DEFAULT_GAME_SETTINGS).toEqual(
      expect.objectContaining({
        version: 4,
        ambienceVolume: 0.6,
        sfxVolume: 0.8,
        visualQuality: 'balanced',
        ambientEffects: true,
        shadows: true,
        waterAnimation: true,
        chatBubbles: true,
        worldLabels: true,
        hudDensity: 'compact',
      }),
    );
  });

  it('migrates version three settings with separate safe audio defaults', () => {
    const versionThree = {
      ...DEFAULT_GAME_SETTINGS,
      version: 3,
      masterVolume: 0.45,
    };
    Reflect.deleteProperty(versionThree, 'ambienceVolume');
    Reflect.deleteProperty(versionThree, 'sfxVolume');
    expect(
      loadGameSettings({
        getItem: (key) =>
          key === 'starville.game-settings.v3' ? JSON.stringify(versionThree) : null,
      }),
    ).toEqual({
      ...DEFAULT_GAME_SETTINGS,
      masterVolume: 0.45,
    });
  });

  it('migrates bounded legacy audio preferences into the current safe defaults', () => {
    const getItem = (key: string) =>
      key === 'starville.game-settings.v1' ? '{"masterVolume":0.45,"muted":true}' : null;
    expect(loadGameSettings({ getItem })).toEqual({
      ...DEFAULT_GAME_SETTINGS,
      masterVolume: 0.45,
      muted: true,
    });
  });

  it('migrates version two labels, density, gameplay, and accessibility preferences', () => {
    const versionTwo = {
      version: 2,
      masterVolume: 0.55,
      muted: false,
      showInteractionHints: false,
      showNearbyPlayerNames: false,
      showLocationBanner: false,
      confirmBeforeLeavingActivities: false,
      compactHud: false,
      chatTimestamps: false,
      autoOpenPartyNotifications: false,
      reducedMotion: true,
      uiScale: 1.2,
      largerChatText: true,
      increasedTextContrast: true,
      simplifiedHud: false,
    };
    const getItem = (key: string) =>
      key === 'starville.game-settings.v2' ? JSON.stringify(versionTwo) : null;
    expect(loadGameSettings({ getItem })).toEqual({
      ...DEFAULT_GAME_SETTINGS,
      masterVolume: 0.55,
      showInteractionHints: false,
      worldLabels: false,
      showLocationBanner: false,
      confirmBeforeLeavingActivities: false,
      hudDensity: 'comfortable',
      chatTimestamps: false,
      autoOpenPartyNotifications: false,
      reducedMotion: true,
      uiScale: 1.2,
      largerChatText: true,
      increasedTextContrast: true,
    });
  });

  it('keeps a compact density when either version two compact preference was active', () => {
    const base = {
      version: 2,
      masterVolume: 0.8,
      muted: false,
      showInteractionHints: true,
      showNearbyPlayerNames: true,
      showLocationBanner: true,
      confirmBeforeLeavingActivities: true,
      compactHud: false,
      chatTimestamps: true,
      autoOpenPartyNotifications: true,
      reducedMotion: false,
      uiScale: 1,
      largerChatText: false,
      increasedTextContrast: false,
      simplifiedHud: true,
    };
    expect(
      loadGameSettings({
        getItem: (key) => (key === 'starville.game-settings.v2' ? JSON.stringify(base) : null),
      }).hudDensity,
    ).toBe('compact');
  });

  it('rejects malformed or incomplete current preferences and still checks older versions', () => {
    const getItem = (key: string) => {
      if (key === GAME_SETTINGS_STORAGE_KEY) return 'not-json';
      if (key === 'starville.game-settings.v1') return '{"masterVolume":0.35,"muted":true}';
      return null;
    };
    expect(loadGameSettings({ getItem })).toEqual({
      ...DEFAULT_GAME_SETTINGS,
      masterVolume: 0.35,
      muted: true,
    });
    expect(
      loadGameSettings({
        getItem: (key) => (key === GAME_SETTINGS_STORAGE_KEY ? '{"version":4,"uiScale":4}' : null),
      }),
    ).toEqual(DEFAULT_GAME_SETTINGS);
  });

  it('persists one versioned preference object without gameplay authority', () => {
    const setItem = vi.fn();
    const settings = {
      ...DEFAULT_GAME_SETTINGS,
      masterVolume: 0.7,
      hudDensity: 'comfortable' as const,
    };
    saveGameSettings({ setItem }, settings);
    expect(setItem).toHaveBeenCalledWith(GAME_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  });
});
