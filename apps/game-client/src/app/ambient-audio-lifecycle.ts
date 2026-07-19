export interface AmbientAudioSettings {
  readonly masterVolume: number;
  readonly ambienceVolume: number;
  readonly muted: boolean;
}

export interface AmbientAudioTrack {
  loop: boolean;
  volume: number;
  readonly paused: boolean;
  play(): Promise<void>;
  pause(): void;
}

export type AmbientAudioFactory = (source: string) => AmbientAudioTrack;

export interface AmbientAudioLifecycleOptions {
  /** Only repository-authored or reviewed licensed sources may be registered here. */
  readonly sources?: Readonly<Record<string, string>>;
  readonly createTrack: AmbientAudioFactory;
  readonly document?: Pick<
    Document,
    'visibilityState' | 'addEventListener' | 'removeEventListener'
  >;
  readonly fadeDurationMs?: number;
  readonly fadeStepMs?: number;
}

/**
 * Owns one current ambient loop and, only during a bounded location crossfade,
 * one outgoing loop. It never starts before a user gesture arms it, catches
 * autoplay rejection, pauses in background tabs, and is silent when no approved
 * source is registered.
 */
export class AmbientAudioLifecycle {
  private readonly sources: Readonly<Record<string, string>>;
  private readonly document:
    Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'> | undefined;
  private track: AmbientAudioTrack | undefined;
  private outgoingTrack: AmbientAudioTrack | undefined;
  private location: string | undefined;
  private fadeTimer: ReturnType<typeof setInterval> | undefined;
  private armed = false;
  private disposed = false;
  private settings: AmbientAudioSettings = {
    masterVolume: 0.8,
    ambienceVolume: 0.6,
    muted: false,
  };
  private readonly handleVisibility = () => {
    if (this.document?.visibilityState === 'hidden') {
      this.stopFade(true);
      this.track?.pause();
    } else {
      void this.playIfAllowed();
    }
  };

  public constructor(private readonly options: AmbientAudioLifecycleOptions) {
    this.sources = options.sources ?? {};
    this.document = options.document ?? (typeof document === 'undefined' ? undefined : document);
    if (Object.keys(this.sources).length > 0) {
      this.document?.addEventListener('visibilitychange', this.handleVisibility);
    }
  }

  public armFromUserGesture(): void {
    if (this.disposed) return;
    this.armed = true;
    void this.playIfAllowed();
  }

  public setSettings(settings: AmbientAudioSettings): void {
    this.settings = settings;
    this.applyVolume();
    if (settings.muted) {
      this.stopFade(true);
      this.track?.pause();
    } else {
      void this.playIfAllowed();
    }
  }

  public setLocation(location: string): void {
    if (this.disposed || location === this.location) return;
    this.location = location;
    this.stopFade(true);
    const previous = this.track;
    this.track = undefined;
    const source = this.sources[location];
    if (source === undefined) {
      if (previous !== undefined) this.fade(previous, undefined);
      return;
    }
    const track = this.options.createTrack(source);
    track.loop = true;
    this.track = track;
    if (previous === undefined || !this.canPlay()) {
      previous?.pause();
      this.applyVolume();
      void this.playIfAllowed();
      return;
    }
    this.fade(previous, track);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopFade(true);
    this.track?.pause();
    this.outgoingTrack?.pause();
    this.track = undefined;
    this.outgoingTrack = undefined;
    if (Object.keys(this.sources).length > 0) {
      this.document?.removeEventListener('visibilitychange', this.handleVisibility);
    }
  }

  private applyVolume(): void {
    if (this.track !== undefined) {
      this.track.volume = this.targetVolume();
    }
  }

  private targetVolume(): number {
    return Math.max(0, Math.min(1, this.settings.masterVolume * this.settings.ambienceVolume));
  }

  private canPlay(): boolean {
    return (
      this.armed &&
      !this.disposed &&
      !this.settings.muted &&
      this.document?.visibilityState !== 'hidden'
    );
  }

  private fade(previous: AmbientAudioTrack, next: AmbientAudioTrack | undefined): void {
    if (!this.canPlay()) {
      previous.pause();
      if (next !== undefined) {
        next.volume = this.targetVolume();
        void this.playIfAllowed();
      }
      return;
    }
    this.outgoingTrack = previous;
    const outgoingStart = previous.volume;
    if (next !== undefined) {
      next.volume = 0;
      void next.play().catch(() => undefined);
    }
    const duration = Math.max(0, this.options.fadeDurationMs ?? 600);
    const step = Math.max(16, this.options.fadeStepMs ?? 50);
    if (duration === 0) {
      previous.pause();
      this.outgoingTrack = undefined;
      if (next !== undefined) next.volume = this.targetVolume();
      return;
    }
    const startedAt = Date.now();
    this.fadeTimer = setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / duration);
      previous.volume = outgoingStart * (1 - progress);
      if (next !== undefined) next.volume = this.targetVolume() * progress;
      if (progress >= 1) this.stopFade(true);
    }, step);
  }

  private stopFade(pauseOutgoing: boolean): void {
    if (this.fadeTimer !== undefined) clearInterval(this.fadeTimer);
    this.fadeTimer = undefined;
    if (pauseOutgoing) this.outgoingTrack?.pause();
    this.outgoingTrack = undefined;
    this.applyVolume();
  }

  private async playIfAllowed(): Promise<void> {
    if (!this.canPlay() || this.track === undefined || !this.track.paused) {
      return;
    }
    try {
      await this.track.play();
    } catch {
      // Autoplay denial is expected until another explicit user gesture.
    }
  }
}
