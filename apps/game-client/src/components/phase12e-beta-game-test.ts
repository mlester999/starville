export type Phase12EBetaScenarioArea =
  | 'world'
  | 'character'
  | 'guidance'
  | 'home'
  | 'farming'
  | 'workstation'
  | 'shop'
  | 'progression'
  | 'housing'
  | 'home_visit'
  | 'modal'
  | 'recovery'
  | 'asset_fallback'
  | 'accessibility'
  | 'responsive';

export type Phase12EBetaScenarioSurface =
  'onboarding' | 'general_store' | 'progression' | 'asset_coverage';

export interface Phase12EBetaScenarioStep {
  readonly id: string;
  readonly area: Phase12EBetaScenarioArea;
  readonly title: string;
  readonly instruction: string;
  readonly expected: string;
  readonly evidence: string;
  readonly surface?: Phase12EBetaScenarioSurface;
  readonly review?: Readonly<{
    readonly v2Candidate?: boolean;
    readonly elevenPlayers?: boolean;
    readonly reducedMotion?: boolean;
    readonly highContrast?: boolean;
  }>;
}

/**
 * This fixture is deliberately descriptive and in-memory. It coordinates the
 * existing protected Game Test surfaces without calling a player mutation API,
 * writing browser storage, or fabricating authoritative completion.
 */
export const PHASE12E_BETA_SCENARIO_STEPS: readonly Phase12EBetaScenarioStep[] = [
  {
    id: 'spawn-lantern-square',
    area: 'world',
    title: 'Spawn in Lantern Square',
    instruction: 'Inspect the safe overview spawn, central plaza, landmark hierarchy, and exits.',
    expected:
      'The player starts on a walkable route with the General Store and home route readable.',
    evidence: 'Exact selected Game Test revision or explicit unpublished local composition.',
  },
  {
    id: 'move-v2-character',
    area: 'character',
    title: 'Move the V2 character',
    instruction: 'Use WASD and Shift through all eight directions, then stop in each facing.',
    expected: 'Idle, walk, and jog preserve scale, anchor, direction, camera follow, and depth.',
    evidence: '24-state candidate rig plus the production movement and collision path.',
    review: { v2Candidate: true },
  },
  {
    id: 'remote-player-parity',
    area: 'character',
    title: 'Review remote-player parity',
    instruction: 'Inspect the bounded eleven-player fixture while crossing in front of the group.',
    expected:
      'One instance per remote player, eight-direction parity, stable labels, and clean depth.',
    evidence: 'Deterministic local presences; realtime and telemetry remain disabled.',
    review: { v2Candidate: true, elevenPlayers: true },
  },
  {
    id: 'objective-guidance',
    area: 'guidance',
    title: 'Follow objective guidance',
    instruction:
      'Open the onboarding preview and inspect objective, route, distance, and fallback text.',
    expected: 'Guidance uses semantic targets and never fabricates progress.',
    evidence: 'Existing Player Experience Game Test projection.',
    surface: 'onboarding',
  },
  {
    id: 'personal-home',
    area: 'home',
    title: 'Review the personal-home transition',
    instruction: 'Inspect the home entrance and the isolated home/farm handoff contract.',
    expected: 'The route remains collision-safe and no public-world or player state is changed.',
    evidence: 'Published transition contract plus in-memory Game Test inspection.',
  },
  {
    id: 'plant-crop',
    area: 'farming',
    title: 'Plant a crop',
    instruction: 'Inspect empty, prepared, selected, planted, and invalid plot presentations.',
    expected: 'Each state has text or shape feedback in addition to color.',
    evidence: 'Bundled farming-state assets and deterministic visual coverage fixture.',
  },
  {
    id: 'water-crop',
    area: 'farming',
    title: 'Water a crop',
    instruction: 'Compare dry and watered soil with Reduced Motion both off and on.',
    expected: 'Watered state remains readable without continuous animation.',
    evidence: 'Authoritative-state projection only; no crop mutation is issued.',
  },
  {
    id: 'harvest-crop',
    area: 'farming',
    title: 'Harvest-ready crop',
    instruction: 'Inspect growing and harvest-ready stages plus inventory-full feedback.',
    expected: 'Readiness and blocked collection are visually and textually distinct.',
    evidence: 'Crop-stage and validation assets; no inventory grant occurs.',
  },
  {
    id: 'workstation',
    area: 'workstation',
    title: 'Cooking and crafting states',
    instruction:
      'Inspect idle, active, ready, blocked, missing-ingredient, and inventory-full states.',
    expected: 'Hearth and workbench state remains legible without relying only on glow or motion.',
    evidence: 'Existing workstation projections and bundled default/active/ready media.',
  },
  {
    id: 'general-store',
    area: 'shop',
    title: 'General Store transaction states',
    instruction:
      'Open the General Store fixture and review buy, sell, insufficient-DUST, and limits.',
    expected: 'Success and failure remain deterministic and explicitly nonpersistent.',
    evidence: 'Existing isolated General Store Game Test.',
    surface: 'general_store',
  },
  {
    id: 'xp-feedback',
    area: 'progression',
    title: 'XP and progression feedback',
    instruction:
      'Open the progression fixture and inspect level, quest, achievement, and title feedback.',
    expected: 'The projection is readable, deduplicated, and grants no XP.',
    evidence: 'Existing isolated Progression Game Test.',
    surface: 'progression',
  },
  {
    id: 'furniture-placement',
    area: 'housing',
    title: 'Furniture placement',
    instruction: 'Inspect valid, invalid, collision, rotation, unsaved, and saved-layout states.',
    expected: 'Footprints and supported rotations agree with the visual asset metadata.',
    evidence: 'Housing placement and asset-coverage fixtures; no home revision is saved.',
  },
  {
    id: 'home-visit',
    area: 'home_visit',
    title: 'Live home-visit fixture',
    instruction: 'Inspect hosting, closed, visitor joined/removed, and permission states.',
    expected: 'Owner authority and visitor limitations remain explicit.',
    evidence: 'Deterministic inspection state; no hosted visit is created.',
  },
  {
    id: 'guestbook-appreciation',
    area: 'home_visit',
    title: 'Guestbook and appreciation',
    instruction: 'Review guestbook, appreciation, and safe text feedback.',
    expected: 'Social feedback is bounded and no production social event is emitted.',
    evidence: 'Bundled social visuals and existing home-visit contracts.',
  },
  {
    id: 'helper-watering',
    area: 'home_visit',
    title: 'Helper watering',
    instruction: 'Inspect permitted, unavailable, already-watered, and session-closed feedback.',
    expected: 'The fixture never grants broader harvest or inventory authority.',
    evidence: 'Existing helper-watering permission contract without a mutation call.',
  },
  {
    id: 'modal-consistency',
    area: 'modal',
    title: 'Modal consistency',
    instruction: 'Open and close Game Test panels with keyboard, Escape, and focus restoration.',
    expected:
      'The portalled surface stays sharp, blocks game input, and never becomes stuck behind HUD.',
    evidence: 'Shared GameModalShell focus and stacking architecture.',
  },
  {
    id: 'reconnect',
    area: 'recovery',
    title: 'Connection interruption and recovery',
    instruction: 'Review cached-view, reconnecting, unavailable, and restored connection states.',
    expected: 'There is one bounded retry path, no fake success, and no duplicate player instance.',
    evidence: 'Coordinated recovery fixture; no real service is stopped by Game Test.',
  },
  {
    id: 'missing-asset',
    area: 'asset_fallback',
    title: 'Missing-asset fallback',
    instruction: 'Open asset coverage and inspect a missing or failed candidate delivery.',
    expected: 'Collision and interaction remain while safe V1/diagnostic media renders.',
    evidence: 'Version-aware resolver and sanitized fallback event.',
    surface: 'asset_coverage',
    review: { v2Candidate: true },
  },
  {
    id: 'reduced-motion',
    area: 'accessibility',
    title: 'Reduced Motion',
    instruction: 'Inspect water, motes, markers, character idle, and transitions in static form.',
    expected: 'Continuous motion stops while required state communication remains.',
    evidence: 'Shared renderer setting and media-query-safe presentation.',
    review: { reducedMotion: true },
  },
  {
    id: 'high-contrast',
    area: 'accessibility',
    title: 'High contrast',
    instruction: 'Inspect player, prompts, markers, crop/workstation states, HUD, and modal text.',
    expected: 'Outlines and text remain legible without changing game rules.',
    evidence: 'Increased-contrast Game Test class and non-color-only labels.',
    review: { highContrast: true },
  },
  {
    id: 'mobile-state',
    area: 'responsive',
    title: 'Mobile and zoom state',
    instruction: 'Use the browser matrix at 360×800, 390×844, landscape, and 200% zoom.',
    expected: 'No HUD collision, hidden primary action, modal overflow, or horizontal page scroll.',
    evidence: 'Production safe-region CSS plus owner/browser geometry inspection.',
  },
] as const;

export function phase12EBetaScenarioAreaCoverage(): ReadonlySet<Phase12EBetaScenarioArea> {
  return new Set(PHASE12E_BETA_SCENARIO_STEPS.map(({ area }) => area));
}

export function phase12EBetaScenarioStep(id: string): Phase12EBetaScenarioStep | undefined {
  return PHASE12E_BETA_SCENARIO_STEPS.find((step) => step.id === id);
}
