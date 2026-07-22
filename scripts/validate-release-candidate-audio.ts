import {
  RELEASE_CANDIDATE_AUDIO_MANIFEST,
  validateReleaseCandidateAudioManifest,
} from '../apps/game-client/src/app/release-candidate-audio';

const issues = validateReleaseCandidateAudioManifest();
if (issues.length > 0) {
  throw new Error(`Release-candidate audio validation failed:\n${issues.join('\n')}`);
}

const groupCounts = Object.fromEntries(
  ['music', 'ambient', 'sfx'].map((group) => [
    group,
    RELEASE_CANDIDATE_AUDIO_MANIFEST.filter((entry) => entry.group === group).length,
  ]),
);

console.log(
  JSON.stringify(
    {
      result: 'PASS',
      entries: RELEASE_CANDIDATE_AUDIO_MANIFEST.length,
      groups: groupCounts,
      embeddedAudioBytes: 0,
      classification: 'development_safe',
      source: 'repository_generated_procedural_web_audio',
      license: 'Starville project-owned original; no third-party audio',
    },
    null,
    2,
  ),
);
