export const GAME_SETTINGS_VERSION = 2 as const;

export type GameUiScale = 0.9 | 1 | 1.1 | 1.2;

export interface GameSettings {
  readonly version: typeof GAME_SETTINGS_VERSION;
  readonly masterVolume: number;
  readonly muted: boolean;
  readonly showInteractionHints: boolean;
  readonly showNearbyPlayerNames: boolean;
  readonly showLocationBanner: boolean;
  readonly confirmBeforeLeavingActivities: boolean;
  readonly compactHud: boolean;
  readonly chatTimestamps: boolean;
  readonly autoOpenPartyNotifications: boolean;
  readonly reducedMotion: boolean;
  readonly uiScale: GameUiScale;
  readonly largerChatText: boolean;
  readonly increasedTextContrast: boolean;
  readonly simplifiedHud: boolean;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  version: GAME_SETTINGS_VERSION,
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
  simplifiedHud: false,
};

export const GAME_SETTINGS_STORAGE_KEY = 'starville.game-settings.v2';
const LEGACY_STORAGE_KEY = 'starville.game-settings.v1';
const UI_SCALES: readonly GameUiScale[] = [0.9, 1, 1.1, 1.2];

function validVolume(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function validBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function validUiScale(value: unknown): value is GameUiScale {
  return typeof value === 'number' && UI_SCALES.includes(value as GameUiScale);
}

function parseVersionTwo(value: unknown): GameSettings | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const read = (key: keyof GameSettings) => Reflect.get(value, key);
  if (
    read('version') !== GAME_SETTINGS_VERSION ||
    !validVolume(read('masterVolume')) ||
    !validBoolean(read('muted')) ||
    !validBoolean(read('showInteractionHints')) ||
    !validBoolean(read('showNearbyPlayerNames')) ||
    !validBoolean(read('showLocationBanner')) ||
    !validBoolean(read('confirmBeforeLeavingActivities')) ||
    !validBoolean(read('compactHud')) ||
    !validBoolean(read('chatTimestamps')) ||
    !validBoolean(read('autoOpenPartyNotifications')) ||
    !validBoolean(read('reducedMotion')) ||
    !validUiScale(read('uiScale')) ||
    !validBoolean(read('largerChatText')) ||
    !validBoolean(read('increasedTextContrast')) ||
    !validBoolean(read('simplifiedHud'))
  ) {
    return undefined;
  }
  return {
    version: GAME_SETTINGS_VERSION,
    masterVolume: read('masterVolume') as number,
    muted: read('muted') as boolean,
    showInteractionHints: read('showInteractionHints') as boolean,
    showNearbyPlayerNames: read('showNearbyPlayerNames') as boolean,
    showLocationBanner: read('showLocationBanner') as boolean,
    confirmBeforeLeavingActivities: read('confirmBeforeLeavingActivities') as boolean,
    compactHud: read('compactHud') as boolean,
    chatTimestamps: read('chatTimestamps') as boolean,
    autoOpenPartyNotifications: read('autoOpenPartyNotifications') as boolean,
    reducedMotion: read('reducedMotion') as boolean,
    uiScale: read('uiScale') as GameUiScale,
    largerChatText: read('largerChatText') as boolean,
    increasedTextContrast: read('increasedTextContrast') as boolean,
    simplifiedHud: read('simplifiedHud') as boolean,
  };
}

function parseLegacy(value: unknown): GameSettings | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const masterVolume = Reflect.get(value, 'masterVolume');
  const muted = Reflect.get(value, 'muted');
  if (!validVolume(masterVolume) || !validBoolean(muted)) return undefined;
  return { ...DEFAULT_GAME_SETTINGS, masterVolume, muted };
}

export function loadGameSettings(storage: Pick<Storage, 'getItem'>): GameSettings {
  try {
    const current = parseVersionTwo(
      JSON.parse(storage.getItem(GAME_SETTINGS_STORAGE_KEY) ?? 'null'),
    );
    if (current !== undefined) return current;
    const legacy = parseLegacy(JSON.parse(storage.getItem(LEGACY_STORAGE_KEY) ?? 'null'));
    if (legacy !== undefined) return legacy;
  } catch {
    // Malformed local preferences never prevent the game from starting.
  }
  return { ...DEFAULT_GAME_SETTINGS };
}

export function saveGameSettings(storage: Pick<Storage, 'setItem'>, settings: GameSettings): void {
  storage.setItem(GAME_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
