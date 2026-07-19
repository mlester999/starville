export const GAME_SETTINGS_VERSION = 4 as const;

export type GameUiScale = 0.9 | 1 | 1.1 | 1.2;
export type GameVisualQuality = 'low' | 'balanced' | 'high';
export type GameHudDensity = 'compact' | 'comfortable';

export interface GameSettings {
  readonly version: typeof GAME_SETTINGS_VERSION;
  readonly masterVolume: number;
  readonly ambienceVolume: number;
  readonly sfxVolume: number;
  readonly muted: boolean;
  readonly visualQuality: GameVisualQuality;
  readonly ambientEffects: boolean;
  readonly shadows: boolean;
  readonly waterAnimation: boolean;
  readonly chatBubbles: boolean;
  readonly worldLabels: boolean;
  readonly hudDensity: GameHudDensity;
  readonly showInteractionHints: boolean;
  readonly showLocationBanner: boolean;
  readonly confirmBeforeLeavingActivities: boolean;
  readonly chatTimestamps: boolean;
  readonly autoOpenPartyNotifications: boolean;
  readonly reducedMotion: boolean;
  readonly uiScale: GameUiScale;
  readonly largerChatText: boolean;
  readonly increasedTextContrast: boolean;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  version: GAME_SETTINGS_VERSION,
  masterVolume: 0.8,
  ambienceVolume: 0.6,
  sfxVolume: 0.8,
  muted: false,
  visualQuality: 'balanced',
  ambientEffects: true,
  shadows: true,
  waterAnimation: true,
  chatBubbles: true,
  worldLabels: true,
  hudDensity: 'compact',
  showInteractionHints: true,
  showLocationBanner: true,
  confirmBeforeLeavingActivities: true,
  chatTimestamps: true,
  autoOpenPartyNotifications: true,
  reducedMotion: false,
  uiScale: 1,
  largerChatText: false,
  increasedTextContrast: false,
};

export const GAME_SETTINGS_STORAGE_KEY = 'starville.game-settings.v4';
const VERSION_THREE_STORAGE_KEY = 'starville.game-settings.v3';
const VERSION_TWO_STORAGE_KEY = 'starville.game-settings.v2';
const LEGACY_STORAGE_KEY = 'starville.game-settings.v1';
const UI_SCALES: readonly GameUiScale[] = [0.9, 1, 1.1, 1.2];
const VISUAL_QUALITIES: readonly GameVisualQuality[] = ['low', 'balanced', 'high'];
const HUD_DENSITIES: readonly GameHudDensity[] = ['compact', 'comfortable'];

function validVolume(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function validBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function validUiScale(value: unknown): value is GameUiScale {
  return typeof value === 'number' && UI_SCALES.includes(value as GameUiScale);
}

function validVisualQuality(value: unknown): value is GameVisualQuality {
  return typeof value === 'string' && VISUAL_QUALITIES.includes(value as GameVisualQuality);
}

function validHudDensity(value: unknown): value is GameHudDensity {
  return typeof value === 'string' && HUD_DENSITIES.includes(value as GameHudDensity);
}

function parseStoredJson(value: string | null): unknown {
  if (value === null) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function parseVersionFour(value: unknown): GameSettings | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const read = (key: keyof GameSettings) => Reflect.get(value, key);
  if (
    read('version') !== GAME_SETTINGS_VERSION ||
    !validVolume(read('masterVolume')) ||
    !validVolume(read('ambienceVolume')) ||
    !validVolume(read('sfxVolume')) ||
    !validBoolean(read('muted')) ||
    !validVisualQuality(read('visualQuality')) ||
    !validBoolean(read('ambientEffects')) ||
    !validBoolean(read('shadows')) ||
    !validBoolean(read('waterAnimation')) ||
    !validBoolean(read('chatBubbles')) ||
    !validBoolean(read('worldLabels')) ||
    !validHudDensity(read('hudDensity')) ||
    !validBoolean(read('showInteractionHints')) ||
    !validBoolean(read('showLocationBanner')) ||
    !validBoolean(read('confirmBeforeLeavingActivities')) ||
    !validBoolean(read('chatTimestamps')) ||
    !validBoolean(read('autoOpenPartyNotifications')) ||
    !validBoolean(read('reducedMotion')) ||
    !validUiScale(read('uiScale')) ||
    !validBoolean(read('largerChatText')) ||
    !validBoolean(read('increasedTextContrast'))
  ) {
    return undefined;
  }
  return {
    version: GAME_SETTINGS_VERSION,
    masterVolume: read('masterVolume') as number,
    ambienceVolume: read('ambienceVolume') as number,
    sfxVolume: read('sfxVolume') as number,
    muted: read('muted') as boolean,
    visualQuality: read('visualQuality') as GameVisualQuality,
    ambientEffects: read('ambientEffects') as boolean,
    shadows: read('shadows') as boolean,
    waterAnimation: read('waterAnimation') as boolean,
    chatBubbles: read('chatBubbles') as boolean,
    worldLabels: read('worldLabels') as boolean,
    hudDensity: read('hudDensity') as GameHudDensity,
    showInteractionHints: read('showInteractionHints') as boolean,
    showLocationBanner: read('showLocationBanner') as boolean,
    confirmBeforeLeavingActivities: read('confirmBeforeLeavingActivities') as boolean,
    chatTimestamps: read('chatTimestamps') as boolean,
    autoOpenPartyNotifications: read('autoOpenPartyNotifications') as boolean,
    reducedMotion: read('reducedMotion') as boolean,
    uiScale: read('uiScale') as GameUiScale,
    largerChatText: read('largerChatText') as boolean,
    increasedTextContrast: read('increasedTextContrast') as boolean,
  };
}

interface VersionThreeSettings extends Omit<
  GameSettings,
  'version' | 'ambienceVolume' | 'sfxVolume'
> {
  readonly version: 3;
}

function parseVersionThree(value: unknown): VersionThreeSettings | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const read = (key: keyof VersionThreeSettings) => Reflect.get(value, key);
  if (
    read('version') !== 3 ||
    !validVolume(read('masterVolume')) ||
    !validBoolean(read('muted')) ||
    !validVisualQuality(read('visualQuality')) ||
    !validBoolean(read('ambientEffects')) ||
    !validBoolean(read('shadows')) ||
    !validBoolean(read('waterAnimation')) ||
    !validBoolean(read('chatBubbles')) ||
    !validBoolean(read('worldLabels')) ||
    !validHudDensity(read('hudDensity')) ||
    !validBoolean(read('showInteractionHints')) ||
    !validBoolean(read('showLocationBanner')) ||
    !validBoolean(read('confirmBeforeLeavingActivities')) ||
    !validBoolean(read('chatTimestamps')) ||
    !validBoolean(read('autoOpenPartyNotifications')) ||
    !validBoolean(read('reducedMotion')) ||
    !validUiScale(read('uiScale')) ||
    !validBoolean(read('largerChatText')) ||
    !validBoolean(read('increasedTextContrast'))
  ) {
    return undefined;
  }
  return {
    version: 3,
    masterVolume: read('masterVolume') as number,
    muted: read('muted') as boolean,
    visualQuality: read('visualQuality') as GameVisualQuality,
    ambientEffects: read('ambientEffects') as boolean,
    shadows: read('shadows') as boolean,
    waterAnimation: read('waterAnimation') as boolean,
    chatBubbles: read('chatBubbles') as boolean,
    worldLabels: read('worldLabels') as boolean,
    hudDensity: read('hudDensity') as GameHudDensity,
    showInteractionHints: read('showInteractionHints') as boolean,
    showLocationBanner: read('showLocationBanner') as boolean,
    confirmBeforeLeavingActivities: read('confirmBeforeLeavingActivities') as boolean,
    chatTimestamps: read('chatTimestamps') as boolean,
    autoOpenPartyNotifications: read('autoOpenPartyNotifications') as boolean,
    reducedMotion: read('reducedMotion') as boolean,
    uiScale: read('uiScale') as GameUiScale,
    largerChatText: read('largerChatText') as boolean,
    increasedTextContrast: read('increasedTextContrast') as boolean,
  };
}

function migrateVersionThree(value: VersionThreeSettings): GameSettings {
  return {
    ...value,
    version: GAME_SETTINGS_VERSION,
    ambienceVolume: DEFAULT_GAME_SETTINGS.ambienceVolume,
    sfxVolume: DEFAULT_GAME_SETTINGS.sfxVolume,
  };
}

interface VersionTwoSettings {
  readonly version: 2;
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

function parseVersionTwo(value: unknown): VersionTwoSettings | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const read = (key: keyof VersionTwoSettings) => Reflect.get(value, key);
  if (
    read('version') !== 2 ||
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
    version: 2,
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

function migrateVersionTwo(value: VersionTwoSettings): GameSettings {
  return {
    ...DEFAULT_GAME_SETTINGS,
    masterVolume: value.masterVolume,
    muted: value.muted,
    worldLabels: value.showNearbyPlayerNames,
    hudDensity: value.compactHud || value.simplifiedHud ? 'compact' : 'comfortable',
    showInteractionHints: value.showInteractionHints,
    showLocationBanner: value.showLocationBanner,
    confirmBeforeLeavingActivities: value.confirmBeforeLeavingActivities,
    chatTimestamps: value.chatTimestamps,
    autoOpenPartyNotifications: value.autoOpenPartyNotifications,
    reducedMotion: value.reducedMotion,
    uiScale: value.uiScale,
    largerChatText: value.largerChatText,
    increasedTextContrast: value.increasedTextContrast,
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
  const current = parseVersionFour(parseStoredJson(storage.getItem(GAME_SETTINGS_STORAGE_KEY)));
  if (current !== undefined) return current;

  const versionThree = parseVersionThree(
    parseStoredJson(storage.getItem(VERSION_THREE_STORAGE_KEY)),
  );
  if (versionThree !== undefined) return migrateVersionThree(versionThree);

  const versionTwo = parseVersionTwo(parseStoredJson(storage.getItem(VERSION_TWO_STORAGE_KEY)));
  if (versionTwo !== undefined) return migrateVersionTwo(versionTwo);

  const legacy = parseLegacy(parseStoredJson(storage.getItem(LEGACY_STORAGE_KEY)));
  return legacy ?? { ...DEFAULT_GAME_SETTINGS };
}

export function saveGameSettings(storage: Pick<Storage, 'setItem'>, settings: GameSettings): void {
  storage.setItem(GAME_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
