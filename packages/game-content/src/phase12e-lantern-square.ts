import {
  isPositionWalkable,
  PLAYER_FOOT_RADIUS,
  validateMapManifest,
  type MapManifest,
  type MapManifestInput,
} from '@starville/game-core';

import { WORLD_ASSET_CATALOG } from './assets';
import { getPhase7LocalDraft, PHASE_7_LOCAL_CONTENT_LIFECYCLE } from './phase7-local-content';

export const PHASE_12E_LANTERN_SQUARE_LIFECYCLE = 'local_draft' as const;
export const PHASE_12E_LANTERN_SQUARE_CANDIDATE_ID =
  'phase12e-lantern-square-v2-candidate-unpublished' as const;

export const PHASE_12E_INTERACTION_ASSET_KEYS = [
  'ui.interaction',
  'ui.objective.active',
  'ui.quest.active',
  'ui.direction',
  'ui.warning',
] as const;

export interface Phase12ELanternSquareRouteFixture {
  readonly id: string;
  readonly label: string;
  readonly points: readonly Readonly<{ x: number; y: number }>[];
}

/**
 * Review routes are deliberately expressed in world coordinates rather than
 * screen pixels. They verify the same authoritative collision used by normal
 * movement and remain independent of V1/V2 media, scale, and transparent trim.
 */
export const PHASE_12E_LANTERN_SQUARE_ROUTE_FIXTURES = Object.freeze([
  {
    id: 'onboarding-spawn-to-guide',
    label: 'Default spawn to Willow Guide around the central lantern',
    points: [
      { x: 12, y: 7.5 },
      { x: 11.45, y: 8.25 },
      { x: 11.45, y: 9.75 },
      { x: 12, y: 10.5 },
    ],
  },
  {
    id: 'plaza-to-general-store',
    label: 'Central plaza to the General Store entrance',
    points: [
      { x: 12, y: 7.5 },
      { x: 9, y: 7 },
      { x: 7, y: 7 },
      { x: 5, y: 6.25 },
    ],
  },
  {
    id: 'plaza-to-home',
    label: 'Central plaza to the personal-home entrance',
    points: [
      { x: 12, y: 7.5 },
      { x: 15, y: 7 },
      { x: 17, y: 6.2 },
      { x: 18, y: 5 },
      { x: 20.5, y: 5 },
      { x: 20.5, y: 8 },
      { x: 19, y: 7.95 },
    ],
  },
  {
    id: 'north-to-south-exit',
    label: 'North road through the plaza and across the bridge',
    points: [
      { x: 12, y: 2.75 },
      { x: 12, y: 6.5 },
      { x: 11.45, y: 8.25 },
      { x: 11.45, y: 10.25 },
      { x: 12, y: 12.25 },
      { x: 12, y: 14.5 },
      { x: 12, y: 17.25 },
    ],
  },
  {
    id: 'guide-to-photo-garden',
    label: 'Willow Guide to the social photo garden',
    points: [
      { x: 12, y: 10.5 },
      { x: 12, y: 9.8 },
      { x: 14, y: 9.8 },
      { x: 15.9, y: 11 },
    ],
  },
] as const satisfies readonly Phase12ELanternSquareRouteFixture[]);

const sourceDraft = getPhase7LocalDraft('lantern-square');

if (sourceDraft.lifecycle !== PHASE_7_LOCAL_CONTENT_LIFECYCLE) {
  throw new Error('Phase 12E Lantern Square must derive from the unpublished local composition');
}

const rawPhase12ELanternSquareCandidate = {
  ...sourceDraft.manifest,
  version: sourceDraft.manifest.version + 1,
  developmentArt: {
    temporary: true,
    label: 'Phase 12E local V2 world-integration candidate — unpublished and in memory',
  },
  interactions: [
    ...sourceDraft.manifest.interactions,
    {
      id: 'phase12e-social-photo-area',
      type: 'notice',
      x: 15.9,
      y: 11,
      range: 1.45,
      title: 'Lantern Square Photo Garden',
      content: 'A quiet social gathering point framed by planters beside the central plaza.',
    },
  ],
} as const satisfies MapManifestInput;

const manifest = validateMapManifest(rawPhase12ELanternSquareCandidate, WORLD_ASSET_CATALOG);

for (const interaction of manifest.interactions) {
  if (
    !isPositionWalkable(
      interaction,
      PLAYER_FOOT_RADIUS,
      manifest.safeSaveBounds,
      manifest.collisions,
    )
  ) {
    throw new Error(`Phase 12E interaction '${interaction.id}' is not safely reachable`);
  }
}

export const PHASE_12E_LANTERN_SQUARE_CANDIDATE = Object.freeze({
  id: PHASE_12E_LANTERN_SQUARE_CANDIDATE_ID,
  lifecycle: PHASE_12E_LANTERN_SQUARE_LIFECYCLE,
  sourceManifestVersion: sourceDraft.manifest.version,
  visualAssetKeys: Object.freeze([
    ...new Set([...manifest.assets, ...PHASE_12E_INTERACTION_ASSET_KEYS]),
  ]),
  manifest,
});

export function getPhase12ELanternSquareCandidate(): Readonly<{
  readonly id: typeof PHASE_12E_LANTERN_SQUARE_CANDIDATE_ID;
  readonly lifecycle: typeof PHASE_12E_LANTERN_SQUARE_LIFECYCLE;
  readonly sourceManifestVersion: number;
  readonly visualAssetKeys: readonly string[];
  readonly manifest: MapManifest;
}> {
  return PHASE_12E_LANTERN_SQUARE_CANDIDATE;
}
