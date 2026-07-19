export const WORLD_VISUAL_REVIEW_CHECKS = [
  {
    id: 'camera_coverage',
    label: 'Camera coverage',
    guidance:
      'The playable area stays framed at spawn, while moving, and near every edge without exposing an empty void.',
  },
  {
    id: 'terrain_readability',
    label: 'Terrain readability',
    guidance:
      'Grass, paths, plazas, water, bridges, and transitions remain distinct at play zoom and 200% browser zoom.',
  },
  {
    id: 'object_scale',
    label: 'Object scale',
    guidance:
      'Buildings, trees, props, and interactables read at a coherent scale beside the player and 96×48 tile projection.',
  },
  {
    id: 'depth_occlusion',
    label: 'Depth and occlusion',
    guidance:
      'The player passes naturally in front of and behind tall objects without disappearing at interaction points.',
  },
  {
    id: 'shadow_language',
    label: 'Shadow language',
    guidance:
      'Ground contact, shadow direction, softness, and opacity stay consistent across terrain and world objects.',
  },
  {
    id: 'world_boundaries',
    label: 'World boundaries',
    guidance:
      'All four edges feel intentional; cameras, sprites, labels, and effects do not clip or reveal unbuilt space.',
  },
  {
    id: 'route_readability',
    label: 'Route readability',
    guidance:
      'Primary paths, entrances, crossings, and directional exits remain visually discoverable without relying on debug overlays.',
  },
  {
    id: 'landmark_hierarchy',
    label: 'Landmark hierarchy',
    guidance:
      'The main landmark is recognizable on arrival and secondary props do not compete with it.',
  },
  {
    id: 'repetition_rhythm',
    label: 'Repetition and rhythm',
    guidance:
      'Repeated terrain and prop families have enough authored variation, spacing, and silhouette rhythm to avoid visible stamping.',
  },
  {
    id: 'mobile_touch',
    label: 'Mobile and touch',
    guidance:
      'Compact portrait and landscape views keep the player, route, interaction target, and touch controls usable.',
  },
  {
    id: 'hud_clearance',
    label: 'HUD clearance',
    guidance:
      'Critical world cues do not sit permanently under navigation, quickbar, chat, announcements, or safe-area insets.',
  },
  {
    id: 'manual_screenshots',
    label: 'Manual screenshot evidence',
    guidance:
      'Capture the deterministic desktop, tablet, and compact-mobile frames after animations settle; compare the exact revision, viewport, and mode.',
  },
] as const;

export type WorldVisualReviewCheckId = (typeof WORLD_VISUAL_REVIEW_CHECKS)[number]['id'];

export const WORLD_VISUAL_REVIEW_VIEWPORTS = [
  {
    id: 'mobile-compact',
    label: 'Mobile compact',
    width: 360,
    height: 800,
    input: 'Touch',
    evidence: 'Minimum-width HUD, player visibility, safe areas, and one reachable interaction.',
  },
  {
    id: 'mobile-portrait',
    label: 'Mobile portrait',
    width: 390,
    height: 844,
    input: 'Touch',
    evidence: 'Player visibility, compact HUD, safe-area clearance, and one reachable interaction.',
  },
  {
    id: 'tablet-portrait',
    label: 'Tablet portrait',
    width: 768,
    height: 1024,
    input: 'Touch',
    evidence: 'Arrival hierarchy, portrait camera framing, controls, and route readability.',
  },
  {
    id: 'tablet-large-portrait',
    label: 'Tablet large portrait',
    width: 820,
    height: 1180,
    input: 'Touch',
    evidence: 'Tall camera coverage, landmark approach, edge apron, and HUD balance.',
  },
  {
    id: 'tablet-landscape',
    label: 'Tablet landscape',
    width: 1024,
    height: 768,
    input: 'Touch',
    evidence: 'Route tour, edge apron, touch targets, and HUD/world balance.',
  },
  {
    id: 'desktop-compact',
    label: 'Desktop compact',
    width: 1280,
    height: 800,
    input: 'Keyboard + pointer',
    evidence: 'Depth corridor, bottom HUD clearance, and readable interaction prompts.',
  },
  {
    id: 'desktop-wide',
    label: 'Desktop wide',
    width: 1440,
    height: 900,
    input: 'Keyboard + pointer',
    evidence: 'Arrival frame, central landmark, complete HUD, and both near camera edges.',
  },
  {
    id: 'desktop-hd',
    label: 'Desktop HD',
    width: 1920,
    height: 1080,
    input: 'Keyboard + pointer',
    evidence: 'Wide camera apron, terrain repetition, landmark hierarchy, and full HUD balance.',
  },
] as const;

export type WorldVisualReviewViewportId = (typeof WORLD_VISUAL_REVIEW_VIEWPORTS)[number]['id'];

export const WORLD_VISUAL_REVIEW_MODES = [
  {
    id: 'arrival_landmark',
    label: 'Arrival → landmark',
    purpose: 'Establishes the first meaningful frame and primary visual hierarchy.',
    fixture: 'Start at the enabled default spawn. Do not pan or use debug overlays before capture.',
    viewportId: 'desktop-wide',
    steps: [
      'Wait for terrain, world objects, avatar, and HUD to settle.',
      'Capture the untouched arrival frame.',
      'Walk the shortest readable route to the primary landmark and capture its approach.',
    ],
    checkIds: ['camera_coverage', 'route_readability', 'landmark_hierarchy', 'hud_clearance'],
  },
  {
    id: 'depth_corridor',
    label: 'Depth corridor',
    purpose:
      'Exercises player/object ordering, grounding, silhouette scale, and occlusion recovery.',
    fixture:
      'Use the nearest tall building/tree pair from spawn and follow the same clockwise loop each run.',
    viewportId: 'desktop-compact',
    steps: [
      'Stand one tile in front of the tall object and capture.',
      'Walk behind it, pause at the deepest occlusion point, and capture.',
      'Exit beside the interaction point and confirm the player becomes readable again.',
    ],
    checkIds: ['object_scale', 'depth_occlusion', 'shadow_language'],
  },
  {
    id: 'boundary_route_tour',
    label: 'Boundary + route tour',
    purpose:
      'Checks the authored camera apron, edge construction, crossings, and four-way routing.',
    fixture:
      'Visit north, east, south, then west in that order; stop one player radius before each exit trigger.',
    viewportId: 'tablet-landscape',
    steps: [
      'Follow only visible paths; note any ambiguous branch.',
      'At each edge, pause without entering a transition and inspect camera framing.',
      'Capture the weakest edge and the least readable route junction.',
    ],
    checkIds: ['camera_coverage', 'world_boundaries', 'route_readability'],
  },
  {
    id: 'terrain_repetition_sweep',
    label: 'Terrain + repetition sweep',
    purpose:
      'Finds repeated stamps, noisy clusters, weak terrain boundaries, and competing accents.',
    fixture:
      'Traverse the longest path and largest open terrain field at normal play zoom without debug labels.',
    viewportId: 'desktop-wide',
    steps: [
      'Inspect terrain transitions at the first path, water, bridge, and plaza boundary encountered.',
      'Count visibly adjacent duplicate props or tiles in the densest cluster.',
      'Capture the densest cluster and the broadest terrain field.',
    ],
    checkIds: ['terrain_readability', 'landmark_hierarchy', 'repetition_rhythm'],
  },
  {
    id: 'compact_hud',
    label: 'Compact mobile HUD',
    purpose:
      'Verifies touch usability and the world/HUD relationship at the narrowest supported frame.',
    fixture:
      'Use 390×844 portrait with browser zoom at 100%, then repeat the arrival frame at 200% zoom.',
    viewportId: 'mobile-portrait',
    steps: [
      'Capture arrival with every default HUD surface visible.',
      'Move diagonally, open and close one non-destructive HUD surface, then reach one interaction.',
      'Repeat at 200% browser zoom and record any clipped or hidden control.',
    ],
    checkIds: ['mobile_touch', 'hud_clearance', 'manual_screenshots'],
  },
] as const satisfies readonly {
  readonly id: string;
  readonly label: string;
  readonly purpose: string;
  readonly fixture: string;
  readonly viewportId: WorldVisualReviewViewportId;
  readonly steps: readonly string[];
  readonly checkIds: readonly WorldVisualReviewCheckId[];
}[];

export type WorldVisualReviewModeId = (typeof WORLD_VISUAL_REVIEW_MODES)[number]['id'];

export function worldVisualReviewMode(modeId: WorldVisualReviewModeId) {
  return WORLD_VISUAL_REVIEW_MODES.find(({ id }) => id === modeId) ?? WORLD_VISUAL_REVIEW_MODES[0];
}

export function worldVisualReviewViewport(viewportId: WorldVisualReviewViewportId) {
  return (
    WORLD_VISUAL_REVIEW_VIEWPORTS.find(({ id }) => id === viewportId) ??
    WORLD_VISUAL_REVIEW_VIEWPORTS[0]
  );
}

export function worldVisualReviewProgress(
  completed: ReadonlySet<WorldVisualReviewCheckId>,
): Readonly<{ complete: number; total: number; percent: number }> {
  const complete = WORLD_VISUAL_REVIEW_CHECKS.filter(({ id }) => completed.has(id)).length;
  const total = WORLD_VISUAL_REVIEW_CHECKS.length;
  return { complete, total, percent: Math.round((complete / total) * 100) };
}
