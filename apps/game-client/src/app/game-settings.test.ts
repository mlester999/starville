import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_GAME_SETTINGS,
  GAME_SETTINGS_STORAGE_KEY,
  loadGameSettings,
  saveGameSettings,
} from './game-settings';

describe('local game settings', () => {
  it('migrates bounded legacy audio preferences into the current safe defaults', () => {
    const getItem = (key: string) =>
      key === 'starville.game-settings.v1' ? '{"masterVolume":0.45,"muted":true}' : null;
    expect(loadGameSettings({ getItem })).toEqual({
      ...DEFAULT_GAME_SETTINGS,
      masterVolume: 0.45,
      muted: true,
    });
  });

  it('rejects malformed, unbounded, and incomplete current preferences', () => {
    expect(loadGameSettings({ getItem: () => '{"version":2,"uiScale":4}' })).toEqual(
      DEFAULT_GAME_SETTINGS,
    );
    expect(loadGameSettings({ getItem: () => 'not-json' })).toEqual(DEFAULT_GAME_SETTINGS);
  });

  it('persists one versioned preference object without gameplay authority', () => {
    const setItem = vi.fn();
    const settings = { ...DEFAULT_GAME_SETTINGS, masterVolume: 0.7, compactHud: true };
    saveGameSettings({ setItem }, settings);
    expect(setItem).toHaveBeenCalledWith(GAME_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  });
});
