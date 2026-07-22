export type ReleaseCandidateAudioGroup = 'music' | 'ambient' | 'sfx';
export type ReleaseCandidateAudioStatus =
  'locked' | 'ready' | 'suspended' | 'unavailable' | 'disposed';

export interface ReleaseCandidateAudioSettings {
  readonly masterVolume: number;
  readonly musicVolume: number;
  readonly ambienceVolume: number;
  readonly sfxVolume: number;
  readonly muted: boolean;
  readonly musicMuted: boolean;
  readonly ambienceMuted: boolean;
  readonly sfxMuted: boolean;
}

export type ReleaseCandidateAudioCueKey =
  | 'music.lantern-square'
  | 'music.personal-home'
  | 'ambient.lantern-square'
  | 'ambient.personal-home'
  | 'sfx.ui-click'
  | 'sfx.interaction'
  | 'sfx.transition'
  | 'sfx.success'
  | 'sfx.error'
  | 'sfx.reconnect';

export interface ReleaseCandidateAudioManifestEntry {
  readonly key: ReleaseCandidateAudioCueKey;
  readonly group: ReleaseCandidateAudioGroup;
  readonly title: string;
  readonly classification: 'development_safe';
  readonly source: 'repository_generated_procedural_web_audio';
  readonly license: 'Starville project-owned original; no third-party audio';
  readonly authoringNote: string;
  readonly frequenciesHz: readonly number[];
  readonly durationMs: number;
  readonly gain: number;
  readonly waveform: OscillatorType;
  readonly intervalMs?: number;
  readonly textEquivalent?: string;
}

const ORIGINAL_LICENSE = 'Starville project-owned original; no third-party audio' as const;
const PROCEDURAL_SOURCE = 'repository_generated_procedural_web_audio' as const;

/**
 * The release-candidate audio catalog contains no downloaded or embedded media.
 * Every cue is synthesized at runtime from the declared parameters below and is
 * intentionally classified as development-safe pending owner audio replacement.
 */
export const RELEASE_CANDIDATE_AUDIO_MANIFEST: readonly ReleaseCandidateAudioManifestEntry[] = [
  {
    key: 'music.lantern-square',
    group: 'music',
    title: 'Lantern Square chime foundation',
    classification: 'development_safe',
    source: PROCEDURAL_SOURCE,
    license: ORIGINAL_LICENSE,
    authoringNote: 'Original restrained three-note lantern motif synthesized in the browser.',
    frequenciesHz: [261.63, 329.63, 392],
    durationMs: 2_400,
    gain: 0.055,
    waveform: 'sine',
    intervalMs: 6_400,
  },
  {
    key: 'music.personal-home',
    group: 'music',
    title: 'Personal home chime foundation',
    classification: 'development_safe',
    source: PROCEDURAL_SOURCE,
    license: ORIGINAL_LICENSE,
    authoringNote: 'Original lower-register home motif synthesized in the browser.',
    frequenciesHz: [220, 277.18, 329.63],
    durationMs: 2_600,
    gain: 0.05,
    waveform: 'sine',
    intervalMs: 7_200,
  },
  {
    key: 'ambient.lantern-square',
    group: 'ambient',
    title: 'Lantern Square air bed',
    classification: 'development_safe',
    source: PROCEDURAL_SOURCE,
    license: ORIGINAL_LICENSE,
    authoringNote: 'Original low-volume village-air tone; no recorded ambience is embedded.',
    frequenciesHz: [98, 147],
    durationMs: 3_600,
    gain: 0.018,
    waveform: 'sine',
    intervalMs: 4_200,
  },
  {
    key: 'ambient.personal-home',
    group: 'ambient',
    title: 'Personal home room tone',
    classification: 'development_safe',
    source: PROCEDURAL_SOURCE,
    license: ORIGINAL_LICENSE,
    authoringNote: 'Original quiet interior tone; no animal, livestock, or recorded room audio.',
    frequenciesHz: [82.41, 123.47],
    durationMs: 4_000,
    gain: 0.016,
    waveform: 'sine',
    intervalMs: 4_800,
  },
  {
    key: 'sfx.ui-click',
    group: 'sfx',
    title: 'Soft UI click',
    classification: 'development_safe',
    source: PROCEDURAL_SOURCE,
    license: ORIGINAL_LICENSE,
    authoringNote: 'Original short interface tick.',
    frequenciesHz: [520],
    durationMs: 55,
    gain: 0.055,
    waveform: 'sine',
  },
  {
    key: 'sfx.interaction',
    group: 'sfx',
    title: 'Interaction prompt',
    classification: 'development_safe',
    source: PROCEDURAL_SOURCE,
    license: ORIGINAL_LICENSE,
    authoringNote: 'Original two-note interaction acknowledgement.',
    frequenciesHz: [392, 523.25],
    durationMs: 150,
    gain: 0.07,
    waveform: 'sine',
  },
  {
    key: 'sfx.transition',
    group: 'sfx',
    title: 'World transition',
    classification: 'development_safe',
    source: PROCEDURAL_SOURCE,
    license: ORIGINAL_LICENSE,
    authoringNote: 'Original soft descending transition cue.',
    frequenciesHz: [440, 329.63],
    durationMs: 420,
    gain: 0.06,
    waveform: 'sine',
    textEquivalent: 'Traveling to another Starville location.',
  },
  {
    key: 'sfx.success',
    group: 'sfx',
    title: 'Success confirmation',
    classification: 'development_safe',
    source: PROCEDURAL_SOURCE,
    license: ORIGINAL_LICENSE,
    authoringNote: 'Original restrained ascending confirmation cue.',
    frequenciesHz: [392, 493.88, 587.33],
    durationMs: 260,
    gain: 0.065,
    waveform: 'sine',
    textEquivalent: 'Action completed.',
  },
  {
    key: 'sfx.error',
    group: 'sfx',
    title: 'Recoverable error',
    classification: 'development_safe',
    source: PROCEDURAL_SOURCE,
    license: ORIGINAL_LICENSE,
    authoringNote: 'Original low two-note recoverable-error cue without alarm styling.',
    frequenciesHz: [246.94, 196],
    durationMs: 300,
    gain: 0.055,
    waveform: 'triangle',
    textEquivalent: 'Starville needs your attention.',
  },
  {
    key: 'sfx.reconnect',
    group: 'sfx',
    title: 'Connection restored',
    classification: 'development_safe',
    source: PROCEDURAL_SOURCE,
    license: ORIGINAL_LICENSE,
    authoringNote: 'Original gentle reconnect confirmation.',
    frequenciesHz: [329.63, 440],
    durationMs: 240,
    gain: 0.06,
    waveform: 'sine',
    textEquivalent: 'Connection restored.',
  },
] as const;

const AUDIO_BY_KEY = new Map(
  RELEASE_CANDIDATE_AUDIO_MANIFEST.map((entry) => [entry.key, entry] as const),
);

const LOCATION_AUDIO: Readonly<
  Record<'lantern-square' | 'personal-home', readonly ReleaseCandidateAudioCueKey[]>
> = {
  'lantern-square': ['music.lantern-square', 'ambient.lantern-square'],
  'personal-home': ['music.personal-home', 'ambient.personal-home'],
};

function boundedVolume(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function validateReleaseCandidateAudioManifest(): readonly string[] {
  const issues: string[] = [];
  const keys = new Set<string>();
  for (const entry of RELEASE_CANDIDATE_AUDIO_MANIFEST) {
    if (keys.has(entry.key)) issues.push(`Duplicate audio key: ${entry.key}`);
    keys.add(entry.key);
    if (!entry.key.startsWith(`${entry.group}.`)) {
      issues.push(`Audio group/key mismatch: ${entry.key}`);
    }
    if (entry.classification !== 'development_safe') {
      issues.push(`Audio is not honestly classified: ${entry.key}`);
    }
    if (entry.source !== PROCEDURAL_SOURCE || entry.license !== ORIGINAL_LICENSE) {
      issues.push(`Audio provenance is incomplete: ${entry.key}`);
    }
    if (entry.frequenciesHz.length === 0 || entry.frequenciesHz.some((value) => value <= 0)) {
      issues.push(`Audio frequencies are invalid: ${entry.key}`);
    }
    if (entry.durationMs <= 0 || entry.gain <= 0 || entry.gain > 0.12) {
      issues.push(`Audio envelope is outside the restrained budget: ${entry.key}`);
    }
  }
  return issues;
}

interface ReleaseCandidateAudioEngine {
  resume(): Promise<void>;
  suspend(): Promise<void>;
  configure(settings: ReleaseCandidateAudioSettings): void;
  play(entry: ReleaseCandidateAudioManifestEntry): void;
  dispose(): void;
}

type AudioContextWindow = Window &
  typeof globalThis & { readonly webkitAudioContext?: typeof AudioContext };

class BrowserProceduralAudioEngine implements ReleaseCandidateAudioEngine {
  private context: AudioContext | undefined;
  private master: GainNode | undefined;
  private readonly groups = new Map<ReleaseCandidateAudioGroup, GainNode>();
  private settings: ReleaseCandidateAudioSettings;

  public constructor(
    settings: ReleaseCandidateAudioSettings,
    private readonly window: AudioContextWindow,
  ) {
    this.settings = settings;
  }

  public async resume(): Promise<void> {
    this.ensureContext();
    await this.context?.resume();
  }

  public async suspend(): Promise<void> {
    await this.context?.suspend();
  }

  public configure(settings: ReleaseCandidateAudioSettings): void {
    this.settings = settings;
    if (this.context === undefined) return;
    const at = this.context.currentTime;
    this.master?.gain.setTargetAtTime(
      settings.muted ? 0 : boundedVolume(settings.masterVolume),
      at,
      0.02,
    );
    this.groups
      .get('music')
      ?.gain.setTargetAtTime(
        settings.musicMuted ? 0 : boundedVolume(settings.musicVolume),
        at,
        0.02,
      );
    this.groups
      .get('ambient')
      ?.gain.setTargetAtTime(
        settings.ambienceMuted ? 0 : boundedVolume(settings.ambienceVolume),
        at,
        0.02,
      );
    this.groups
      .get('sfx')
      ?.gain.setTargetAtTime(settings.sfxMuted ? 0 : boundedVolume(settings.sfxVolume), at, 0.02);
  }

  public play(entry: ReleaseCandidateAudioManifestEntry): void {
    const context = this.context;
    const destination = this.groups.get(entry.group);
    if (context === undefined || destination === undefined || context.state !== 'running') return;
    const durationSeconds = entry.durationMs / 1_000;
    entry.frequenciesHz.forEach((frequency, index) => {
      const start = context.currentTime + index * Math.min(0.18, durationSeconds / 4);
      const stop = start + durationSeconds;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = entry.waveform;
      oscillator.frequency.setValueAtTime(frequency, start);
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(
        entry.gain,
        start + Math.min(0.08, durationSeconds / 3),
      );
      envelope.gain.exponentialRampToValueAtTime(0.0001, stop);
      oscillator.connect(envelope);
      envelope.connect(destination);
      oscillator.addEventListener('ended', () => {
        oscillator.disconnect();
        envelope.disconnect();
      });
      oscillator.start(start);
      oscillator.stop(stop + 0.01);
    });
  }

  public dispose(): void {
    const context = this.context;
    this.context = undefined;
    this.master = undefined;
    this.groups.clear();
    if (context !== undefined) void context.close().catch(() => undefined);
  }

  private ensureContext(): void {
    if (this.context !== undefined) return;
    const Constructor = this.window.AudioContext ?? this.window.webkitAudioContext;
    if (Constructor === undefined) throw new Error('Web Audio is unavailable.');
    const context = new Constructor();
    const master = context.createGain();
    master.connect(context.destination);
    this.context = context;
    this.master = master;
    for (const group of ['music', 'ambient', 'sfx'] as const) {
      const gain = context.createGain();
      gain.connect(master);
      this.groups.set(group, gain);
    }
    this.configure(this.settings);
  }
}

export interface ReleaseCandidateAudioManagerOptions {
  readonly document?: Pick<
    Document,
    'visibilityState' | 'addEventListener' | 'removeEventListener'
  >;
  readonly createEngine?: (settings: ReleaseCandidateAudioSettings) => ReleaseCandidateAudioEngine;
  readonly onStatusChange?: (status: ReleaseCandidateAudioStatus) => void;
  readonly onMeaningfulCue?: (textEquivalent: string) => void;
  readonly now?: () => number;
}

export class ReleaseCandidateAudioManager {
  private readonly document:
    Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'> | undefined;
  private readonly engine: ReleaseCandidateAudioEngine;
  private readonly loopTimers = new Map<
    ReleaseCandidateAudioCueKey,
    ReturnType<typeof setInterval>
  >();
  private readonly lastPlayedAt = new Map<ReleaseCandidateAudioCueKey, number>();
  private status: ReleaseCandidateAudioStatus = 'locked';
  private location: keyof typeof LOCATION_AUDIO = 'lantern-square';
  private armPromise: Promise<void> | undefined;
  private settings: ReleaseCandidateAudioSettings = {
    masterVolume: 0.8,
    musicVolume: 0.45,
    ambienceVolume: 0.6,
    sfxVolume: 0.8,
    muted: false,
    musicMuted: false,
    ambienceMuted: false,
    sfxMuted: false,
  };
  private readonly handleVisibility = () => {
    if (this.document?.visibilityState === 'hidden') {
      this.stopLoops();
      void this.engine.suspend();
      if (this.status === 'ready') this.setStatus('suspended');
      return;
    }
    if (this.status === 'suspended') {
      void this.armFromUserGesture();
    }
  };

  public constructor(private readonly options: ReleaseCandidateAudioManagerOptions = {}) {
    this.document = options.document ?? (typeof document === 'undefined' ? undefined : document);
    this.engine =
      options.createEngine?.(this.settings) ??
      new BrowserProceduralAudioEngine(this.settings, window as unknown as AudioContextWindow);
    this.document?.addEventListener('visibilitychange', this.handleVisibility);
  }

  public getStatus(): ReleaseCandidateAudioStatus {
    return this.status;
  }

  public setSettings(settings: ReleaseCandidateAudioSettings): void {
    if (this.status === 'disposed') return;
    this.settings = {
      masterVolume: boundedVolume(settings.masterVolume),
      musicVolume: boundedVolume(settings.musicVolume),
      ambienceVolume: boundedVolume(settings.ambienceVolume),
      sfxVolume: boundedVolume(settings.sfxVolume),
      muted: settings.muted,
      musicMuted: settings.musicMuted,
      ambienceMuted: settings.ambienceMuted,
      sfxMuted: settings.sfxMuted,
    };
    this.engine.configure(this.settings);
    this.reconcileLoops();
  }

  public setLocation(location: keyof typeof LOCATION_AUDIO): void {
    if (this.status === 'disposed' || location === this.location) return;
    this.location = location;
    this.reconcileLoops();
  }

  public armFromUserGesture(): Promise<void> {
    if (this.status === 'disposed' || this.status === 'unavailable') return Promise.resolve();
    if (this.status === 'ready' && this.document?.visibilityState !== 'hidden') {
      return Promise.resolve();
    }
    if (this.armPromise !== undefined) return this.armPromise;
    this.armPromise = this.engine
      .resume()
      .then(() => {
        if (this.status === 'disposed') return;
        this.setStatus(this.document?.visibilityState === 'hidden' ? 'suspended' : 'ready');
        this.reconcileLoops();
      })
      .catch(() => {
        this.stopLoops();
        this.setStatus('unavailable');
      })
      .finally(() => {
        this.armPromise = undefined;
      });
    return this.armPromise;
  }

  public play(cue: ReleaseCandidateAudioCueKey): void {
    if (!this.canPlayGroup('sfx')) return;
    const entry = AUDIO_BY_KEY.get(cue);
    if (entry === undefined || entry.group !== 'sfx') return;
    const now = this.options.now?.() ?? Date.now();
    const cooldown = cue === 'sfx.ui-click' ? 70 : 220;
    const previous = this.lastPlayedAt.get(cue) ?? Number.NEGATIVE_INFINITY;
    if (now - previous < cooldown) return;
    this.lastPlayedAt.set(cue, now);
    this.engine.play(entry);
    if (entry.textEquivalent !== undefined) this.options.onMeaningfulCue?.(entry.textEquivalent);
  }

  public preview(group: ReleaseCandidateAudioGroup): void {
    if (this.status !== 'ready' || this.settings.muted) return;
    const key: ReleaseCandidateAudioCueKey =
      group === 'music'
        ? this.location === 'personal-home'
          ? 'music.personal-home'
          : 'music.lantern-square'
        : group === 'ambient'
          ? this.location === 'personal-home'
            ? 'ambient.personal-home'
            : 'ambient.lantern-square'
          : 'sfx.interaction';
    const entry = AUDIO_BY_KEY.get(key);
    if (entry !== undefined && this.canPlayGroup(group)) this.engine.play(entry);
  }

  public dispose(): void {
    if (this.status === 'disposed') return;
    this.stopLoops();
    this.document?.removeEventListener('visibilitychange', this.handleVisibility);
    this.engine.dispose();
    this.setStatus('disposed');
  }

  private canPlayGroup(group: ReleaseCandidateAudioGroup): boolean {
    if (
      this.status !== 'ready' ||
      this.settings.muted ||
      this.document?.visibilityState === 'hidden'
    ) {
      return false;
    }
    if (group === 'music') return !this.settings.musicMuted && this.settings.musicVolume > 0;
    if (group === 'ambient') {
      return !this.settings.ambienceMuted && this.settings.ambienceVolume > 0;
    }
    return !this.settings.sfxMuted && this.settings.sfxVolume > 0;
  }

  private reconcileLoops(): void {
    this.stopLoops();
    if (this.status !== 'ready') return;
    for (const key of LOCATION_AUDIO[this.location]) {
      const entry = AUDIO_BY_KEY.get(key);
      if (
        entry === undefined ||
        entry.intervalMs === undefined ||
        !this.canPlayGroup(entry.group)
      ) {
        continue;
      }
      this.engine.play(entry);
      const timer = setInterval(() => {
        if (this.canPlayGroup(entry.group)) this.engine.play(entry);
      }, entry.intervalMs);
      this.loopTimers.set(key, timer);
    }
  }

  private stopLoops(): void {
    for (const timer of this.loopTimers.values()) clearInterval(timer);
    this.loopTimers.clear();
  }

  private setStatus(status: ReleaseCandidateAudioStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.options.onStatusChange?.(status);
  }
}
