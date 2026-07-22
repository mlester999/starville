# Phase 12E release-candidate audio

Status: **development-safe procedural foundation; owner replacement and listening acceptance
pending**.

This implementation is local presentation only. It changes no gameplay authority, inventory, DUST,
progression, reward, wallet, world, or hosted record. It does not connect to `starville-prod`,
upload media, activate an asset version, publish a world, deploy, or push a migration.

## Architecture

`ReleaseCandidateAudioManager` owns the browser lifecycle outside Phaser. It creates Web Audio only
after an explicit pointer or keyboard gesture, then maintains at most one music timer and one
ambient timer for the current location. It supports Lantern Square and the personal home, bounded
cue cooldowns, immediate volume updates, per-group mute, master mute, hidden-tab suspension,
foreground resume, duplicate-arm prevention, and full timer/context/listener disposal.

The three groups are:

- music: restrained Lantern Square and personal-home motif foundations;
- ambient: quiet village-air and room-tone foundations; and
- sound effects: UI click, interaction, transition, success, error, and reconnect cues.

Important cues retain visible status/error/recovery text. Sound is never the only carrier of
meaning. If Web Audio is unavailable or playback is denied, the manager fails silent and the game
remains playable with a visible audio-unavailable notice.

## Source, originality, and license

All ten catalog entries are generated at runtime from repository-declared oscillator frequencies,
waveforms, gains, durations, and intervals. There are no embedded recordings, downloaded music,
scraped sound-library files, commercial-game assets, animal sounds, or third-party audio samples.

Every entry records:

- source: `repository_generated_procedural_web_audio`;
- license: `Starville project-owned original; no third-party audio`;
- classification: `development_safe`; and
- an authoring note describing the original procedural purpose.

The catalog is intentionally not classified as final or production audio. Owner replacement may
retain stable cue keys while changing the reviewed implementation or media source.

## Payload and validation

The embedded audio payload is **0 bytes** because the cues contain parameters rather than binary
audio. Browser-decoded audio-file memory is also **0 bytes**. Runtime oscillator nodes are short
lived and disconnect when their envelope ends.

Run:

```sh
pnpm audio:validate
```

The command rejects duplicate keys, group/key mismatch, incomplete provenance, non-development-safe
classification, invalid frequencies, and envelopes outside the restrained gain/duration budget.
Lifecycle unit tests cover gesture unlock, duplicate prevention, group settings, location changes,
hidden-tab suspend/resume, cue cooldown, text equivalents, unavailable fallback, and cleanup.

## Owner review still required

Owner review must cover listening quality, comfort, originality, loop repetition, autoplay behavior,
mobile speakers/headphones, group volumes and mutes, tab/background lifecycle, long-session cleanup,
and replacement classification. These procedural cues must not be relabeled `final` merely because
automated validation passes.
