import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_GAME_SETTINGS, loadGameSettings, saveGameSettings } from './game-settings';

describe('local game settings', () => {
  it('loads only bounded non-sensitive audio preferences', () => {
    expect(loadGameSettings({ getItem: () => '{"masterVolume":0.45,"muted":true}' })).toEqual({
      masterVolume: 0.45,
      muted: true,
    });
    expect(loadGameSettings({ getItem: () => '{"masterVolume":4,"muted":false}' })).toEqual(
      DEFAULT_GAME_SETTINGS,
    );
    expect(loadGameSettings({ getItem: () => 'not-json' })).toEqual(DEFAULT_GAME_SETTINGS);
  });

  it('persists only the typed audio preference object', () => {
    const setItem = vi.fn();
    saveGameSettings({ setItem }, { masterVolume: 0.7, muted: false });
    expect(setItem).toHaveBeenCalledWith(
      'starville.game-settings.v1',
      '{"masterVolume":0.7,"muted":false}',
    );
  });
});
