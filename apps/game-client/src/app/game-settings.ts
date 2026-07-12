export interface GameSettings {
  readonly masterVolume: number;
  readonly muted: boolean;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  masterVolume: 0.8,
  muted: false,
};

const STORAGE_KEY = 'starville.game-settings.v1';

function validVolume(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function loadGameSettings(storage: Pick<Storage, 'getItem'>): GameSettings {
  try {
    const value: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null');
    if (
      typeof value === 'object' &&
      value !== null &&
      validVolume(Reflect.get(value, 'masterVolume')) &&
      typeof Reflect.get(value, 'muted') === 'boolean'
    ) {
      return {
        masterVolume: Reflect.get(value, 'masterVolume') as number,
        muted: Reflect.get(value, 'muted') as boolean,
      };
    }
  } catch {
    // Invalid local preferences are safely replaced by defaults.
  }
  return DEFAULT_GAME_SETTINGS;
}

export function saveGameSettings(storage: Pick<Storage, 'setItem'>, settings: GameSettings): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
