import {
  isPositionWalkable,
  PLAYER_FOOT_RADIUS,
  validateMapManifest,
  validateWorldManifestGraph,
  type MapId,
  type MapManifest,
  type MapManifestInput,
} from '@starville/game-core';

import { WORLD_ASSET_CATALOG } from './assets';
import { WORLD_MANIFESTS } from './manifests';

export const PHASE_7_LOCAL_CONTENT_LIFECYCLE = 'local_draft' as const;

const FARM_PLOT_POINTS = [
  { x: 12.25, y: 11.75 },
  { x: 13.5, y: 11.75 },
  { x: 14.75, y: 11.75 },
  { x: 12.25, y: 13.25 },
  { x: 13.5, y: 13.25 },
  { x: 14.75, y: 13.25 },
] as const;

const PHASE_12C_LANTERN_ASSETS = [
  'phase7-dev-willow-chair',
  'phase7-dev-moonwoven-rug',
  'phase7-dev-round-leaf-planter',
] as const;

const PHASE_12C_LANTERN_OBJECTS = [
  { id: 'phase12c-lantern-heart', assetId: 'lamp-star', kind: 'lamp', x: 12, y: 9, scale: 1.18 },
  {
    id: 'phase12c-social-chair-west-north',
    assetId: 'phase7-dev-willow-chair',
    kind: 'furniture',
    x: 10.6,
    y: 8.65,
    scale: 1,
    rotation: 90,
  },
  {
    id: 'phase12c-social-chair-east-north',
    assetId: 'phase7-dev-willow-chair',
    kind: 'furniture',
    x: 13.4,
    y: 8.65,
    scale: 1,
    rotation: 270,
  },
  {
    id: 'phase12c-social-chair-west-south',
    assetId: 'phase7-dev-willow-chair',
    kind: 'furniture',
    x: 10.6,
    y: 10.4,
    scale: 1,
    rotation: 90,
  },
  {
    id: 'phase12c-social-chair-east-south',
    assetId: 'phase7-dev-willow-chair',
    kind: 'furniture',
    x: 13.4,
    y: 10.4,
    scale: 1,
    rotation: 270,
  },
  {
    id: 'phase12c-social-rug',
    assetId: 'phase7-dev-moonwoven-rug',
    kind: 'furniture',
    x: 12,
    y: 8.9,
    scale: 1.15,
  },
  {
    id: 'phase12c-photo-rug',
    assetId: 'phase7-dev-moonwoven-rug',
    kind: 'furniture',
    x: 15.9,
    y: 11.55,
    scale: 1.2,
  },
  {
    id: 'phase12c-photo-planter-west',
    assetId: 'phase7-dev-round-leaf-planter',
    kind: 'furniture',
    x: 14.9,
    y: 11.75,
    scale: 0.92,
  },
  {
    id: 'phase12c-photo-planter-east',
    assetId: 'phase7-dev-round-leaf-planter',
    kind: 'furniture',
    x: 16.9,
    y: 11.75,
    scale: 0.92,
  },
  {
    id: 'phase12c-tree-northwest',
    assetId: 'tree-maple',
    kind: 'tree',
    x: 2.2,
    y: 3.2,
    scale: 0.9,
  },
  {
    id: 'phase12c-tree-northeast',
    assetId: 'tree-pine',
    kind: 'tree',
    x: 21.5,
    y: 3.3,
    scale: 0.92,
  },
  {
    id: 'phase12c-tree-southwest',
    assetId: 'tree-maple',
    kind: 'tree',
    x: 2.5,
    y: 17.4,
    scale: 0.92,
  },
  {
    id: 'phase12c-tree-southeast',
    assetId: 'tree-pine',
    kind: 'tree',
    x: 21.3,
    y: 17.3,
    scale: 0.9,
  },
  {
    id: 'phase12c-route-lamp-north',
    assetId: 'lamp-star',
    kind: 'lamp',
    x: 9.5,
    y: 2.5,
    scale: 0.88,
  },
  {
    id: 'phase12c-route-lamp-east',
    assetId: 'lamp-star',
    kind: 'lamp',
    x: 21,
    y: 10.15,
    scale: 0.9,
  },
  {
    id: 'phase12c-route-lamp-south',
    assetId: 'lamp-star',
    kind: 'lamp',
    x: 14.8,
    y: 17.35,
    scale: 0.9,
  },
  { id: 'phase12c-route-lamp-west', assetId: 'lamp-star', kind: 'lamp', x: 3, y: 5.1, scale: 0.88 },
  {
    id: 'phase12c-bush-northwest',
    assetId: 'bush-round',
    kind: 'bush',
    x: 3.1,
    y: 4.4,
    scale: 0.92,
  },
  {
    id: 'phase12c-bush-northeast',
    assetId: 'bush-round',
    kind: 'bush',
    x: 20.4,
    y: 4.6,
    scale: 0.88,
  },
  {
    id: 'phase12c-bush-southwest',
    assetId: 'bush-round',
    kind: 'bush',
    x: 3.2,
    y: 16.6,
    scale: 0.95,
  },
  {
    id: 'phase12c-bush-southeast',
    assetId: 'bush-round',
    kind: 'bush',
    x: 20.2,
    y: 16.5,
    scale: 0.9,
  },
  {
    id: 'phase12c-bush-north-path',
    assetId: 'bush-round',
    kind: 'bush',
    x: 16.8,
    y: 2.7,
    scale: 0.82,
  },
  {
    id: 'phase12c-bush-south-path',
    assetId: 'bush-round',
    kind: 'bush',
    x: 7.3,
    y: 17.2,
    scale: 0.82,
  },
  {
    id: 'phase12c-flowers-store',
    assetId: 'flowers-moon',
    kind: 'flowers',
    x: 6.5,
    y: 4.8,
    scale: 0.92,
  },
  {
    id: 'phase12c-flowers-home',
    assetId: 'flowers-moon',
    kind: 'flowers',
    x: 18.1,
    y: 4.6,
    scale: 0.92,
  },
  {
    id: 'phase12c-flowers-west',
    assetId: 'flowers-moon',
    kind: 'flowers',
    x: 4.2,
    y: 9.9,
    scale: 0.84,
  },
  {
    id: 'phase12c-flowers-east',
    assetId: 'flowers-moon',
    kind: 'flowers',
    x: 19.4,
    y: 10.1,
    scale: 0.86,
  },
  {
    id: 'phase12c-flowers-southwest',
    assetId: 'flowers-moon',
    kind: 'flowers',
    x: 7.5,
    y: 16.75,
    scale: 0.8,
  },
  {
    id: 'phase12c-flowers-southeast',
    assetId: 'flowers-moon',
    kind: 'flowers',
    x: 17.8,
    y: 16.7,
    scale: 0.82,
  },
] as const satisfies MapManifestInput['objects'];

const PHASE_12C_LANTERN_COLLISIONS = [
  { id: 'phase12c-lantern-heart-base', shape: 'circle', x: 12, y: 9, radius: 0.23, blocking: true },
  {
    id: 'phase12c-social-chair-west-north-base',
    shape: 'circle',
    x: 10.6,
    y: 8.65,
    radius: 0.22,
    blocking: true,
  },
  {
    id: 'phase12c-social-chair-east-north-base',
    shape: 'circle',
    x: 13.4,
    y: 8.65,
    radius: 0.22,
    blocking: true,
  },
  {
    id: 'phase12c-social-chair-west-south-base',
    shape: 'circle',
    x: 10.6,
    y: 10.4,
    radius: 0.22,
    blocking: true,
  },
  {
    id: 'phase12c-social-chair-east-south-base',
    shape: 'circle',
    x: 13.4,
    y: 10.4,
    radius: 0.22,
    blocking: true,
  },
  {
    id: 'phase12c-photo-planter-west-base',
    shape: 'circle',
    x: 14.9,
    y: 11.75,
    radius: 0.24,
    blocking: true,
  },
  {
    id: 'phase12c-photo-planter-east-base',
    shape: 'circle',
    x: 16.9,
    y: 11.75,
    radius: 0.24,
    blocking: true,
  },
  {
    id: 'phase12c-tree-northwest-base',
    shape: 'circle',
    x: 2.2,
    y: 3.2,
    radius: 0.31,
    blocking: true,
  },
  {
    id: 'phase12c-tree-northeast-base',
    shape: 'circle',
    x: 21.5,
    y: 3.3,
    radius: 0.32,
    blocking: true,
  },
  {
    id: 'phase12c-tree-southwest-base',
    shape: 'circle',
    x: 2.5,
    y: 17.4,
    radius: 0.31,
    blocking: true,
  },
  {
    id: 'phase12c-tree-southeast-base',
    shape: 'circle',
    x: 21.3,
    y: 17.3,
    radius: 0.31,
    blocking: true,
  },
  {
    id: 'phase12c-route-lamp-north-base',
    shape: 'circle',
    x: 9.5,
    y: 2.5,
    radius: 0.2,
    blocking: true,
  },
  {
    id: 'phase12c-route-lamp-east-base',
    shape: 'circle',
    x: 21,
    y: 10.15,
    radius: 0.2,
    blocking: true,
  },
  {
    id: 'phase12c-route-lamp-south-base',
    shape: 'circle',
    x: 14.8,
    y: 17.35,
    radius: 0.2,
    blocking: true,
  },
  {
    id: 'phase12c-route-lamp-west-base',
    shape: 'circle',
    x: 3,
    y: 5.1,
    radius: 0.2,
    blocking: true,
  },
] as const satisfies MapManifestInput['collisions'];

function sourceManifest(mapId: MapId): MapManifest {
  const manifest = WORLD_MANIFESTS.find((candidate) => candidate.id === mapId);
  if (manifest === undefined) throw new Error(`Phase 7 source map '${mapId}' is unavailable`);
  return manifest;
}

function phase7DevelopmentArt(source: MapManifest): MapManifestInput['developmentArt'] {
  return {
    ...source.developmentArt,
    temporary: true,
    label: 'Phase 7–12C local draft interaction and composition art — not published',
  };
}

const lanternSquareSource = sourceManifest('lantern-square');
const rawPhase7LanternSquareDraft = {
  ...lanternSquareSource,
  version: lanternSquareSource.version + 1,
  developmentArt: phase7DevelopmentArt(lanternSquareSource),
  assets: [
    ...lanternSquareSource.assets,
    'phase7-general-store-marker',
    'phase7-cooking-hearth-marker',
    'phase7-crafting-workbench-marker',
    'phase7-home-entrance-marker',
    'phase10b-wardrobe-mirror-marker',
    'phase10b-wardrobe-furniture-marker',
    ...PHASE_12C_LANTERN_ASSETS,
  ],
  collisions: [
    ...lanternSquareSource.collisions,
    {
      id: 'phase7-cooking-hearth-base',
      shape: 'circle',
      x: 15.2,
      y: 5.9,
      radius: 0.38,
      blocking: true,
    },
    {
      id: 'phase7-crafting-workbench-base',
      shape: 'circle',
      x: 15.4,
      y: 8.05,
      radius: 0.4,
      blocking: true,
    },
    {
      id: 'phase10b-wardrobe-mirror-base',
      shape: 'circle',
      x: 17.2,
      y: 8.4,
      radius: 0.24,
      blocking: true,
    },
    {
      id: 'phase10b-wardrobe-furniture-base',
      shape: 'circle',
      x: 18.2,
      y: 8.6,
      radius: 0.28,
      blocking: true,
    },
    ...PHASE_12C_LANTERN_COLLISIONS,
  ],
  objects: [
    ...lanternSquareSource.objects.filter(
      ({ id }) => id !== 'cottage-amber' && id !== 'cottage-sage',
    ),
    {
      id: 'phase7-general-store-object',
      assetId: 'phase7-general-store-marker',
      kind: 'shop',
      x: 5,
      y: 4.25,
      scale: 1,
    },
    {
      id: 'phase7-cooking-hearth-object',
      assetId: 'phase7-cooking-hearth-marker',
      kind: 'cooking_station',
      x: 15.2,
      y: 5.9,
      scale: 1,
    },
    {
      id: 'phase7-crafting-workbench-object',
      assetId: 'phase7-crafting-workbench-marker',
      kind: 'crafting_station',
      x: 15.4,
      y: 8.05,
      scale: 1,
    },
    {
      id: 'phase7-home-entrance-object',
      assetId: 'phase7-home-entrance-marker',
      kind: 'home_entrance',
      x: 19,
      y: 6.45,
      scale: 1,
    },
    {
      id: 'phase10b-wardrobe-mirror-object',
      assetId: 'phase10b-wardrobe-mirror-marker',
      kind: 'furniture',
      x: 17.2,
      y: 8.4,
      scale: 1,
    },
    {
      id: 'phase10b-wardrobe-furniture-object',
      assetId: 'phase10b-wardrobe-furniture-marker',
      kind: 'furniture',
      x: 18.2,
      y: 8.6,
      scale: 1,
    },
    ...PHASE_12C_LANTERN_OBJECTS,
  ],
  interactions: [
    ...lanternSquareSource.interactions,
    {
      id: 'phase7-general-store',
      type: 'shop',
      x: 5,
      y: 6.25,
      range: 1.5,
      title: 'Lantern General Store',
      content: 'Browse server-priced seeds, pantry goods, materials, and starter furnishings.',
      shopSlug: 'lantern-general-store',
    },
    {
      id: 'phase7-cooking-hearth',
      type: 'cooking_station',
      x: 14.2,
      y: 6.6,
      range: 1.35,
      title: 'Cooking Hearth',
      content: 'Prepare recipes defined by the trusted Starville cooking catalog.',
      stationType: 'cooking_hearth',
    },
    {
      id: 'phase7-crafting-workbench',
      type: 'crafting_station',
      x: 14.45,
      y: 8.85,
      range: 1.35,
      title: 'Crafting Workbench',
      content: 'Create simple materials and furnishings from trusted recipes.',
      stationType: 'crafting_workbench',
    },
    {
      id: 'phase7-home-entrance',
      type: 'home_entrance',
      x: 19,
      y: 7.95,
      range: 1.5,
      title: 'Starter Cottage',
      content: 'Enter the private starter home assigned by the Starville server.',
      homeTemplateSlug: 'starter-cottage-interior',
    },
    {
      id: 'phase10b-wardrobe-mirror',
      type: 'notice',
      x: 16.45,
      y: 8.8,
      range: 1.35,
      title: 'Wardrobe Mirror',
      content: 'Open the same server-authoritative Wardrobe available from village settings.',
    },
    {
      id: 'phase10b-wardrobe-furniture',
      type: 'notice',
      x: 17.45,
      y: 9.2,
      range: 1.35,
      title: 'Wardrobe Furniture',
      content: 'Open your owned cosmetics, saved outfits, emotes, and collections.',
    },
  ],
} as const satisfies MapManifestInput;

const moonpetalSource = sourceManifest('moonpetal-meadow');
const farmPlotObjects = FARM_PLOT_POINTS.map((point, index) => ({
  id: `phase7-farm-plot-${String(index + 1)}-object`,
  assetId: 'phase7-farm-plot-marker',
  kind: 'farm_plot' as const,
  x: point.x,
  y: point.y,
  scale: 1,
}));
const farmPlotInteractions = FARM_PLOT_POINTS.map((point, index) => ({
  id: `phase7-farm-plot-${String(index + 1)}`,
  type: 'farm_plot' as const,
  x: point.x,
  y: point.y,
  range: 1.1,
  title: `Personal Farm Plot ${String(index + 1)}`,
  content: 'This anchor displays server-authoritative personal farming state.',
  farmPlotKey: `moonpetal-starter-${String(index + 1)}`,
  slot: index + 1,
}));
const rawPhase7MoonpetalMeadowDraft = {
  ...moonpetalSource,
  version: moonpetalSource.version + 1,
  developmentArt: phase7DevelopmentArt(moonpetalSource),
  assets: [...moonpetalSource.assets, 'phase7-farm-plot-marker'],
  objects: [...moonpetalSource.objects, ...farmPlotObjects],
  interactions: [...moonpetalSource.interactions, ...farmPlotInteractions],
} as const satisfies MapManifestInput;

export const PHASE_7_LOCAL_DRAFTS = Object.freeze([
  Object.freeze({
    lifecycle: PHASE_7_LOCAL_CONTENT_LIFECYCLE,
    sourceManifestVersion: lanternSquareSource.version,
    manifest: validateMapManifest(rawPhase7LanternSquareDraft, WORLD_ASSET_CATALOG),
  }),
  Object.freeze({
    lifecycle: PHASE_7_LOCAL_CONTENT_LIFECYCLE,
    sourceManifestVersion: moonpetalSource.version,
    manifest: validateMapManifest(rawPhase7MoonpetalMeadowDraft, WORLD_ASSET_CATALOG),
  }),
]);

export const PHASE_7_LOCAL_PREVIEW_WORLD = Object.freeze(
  validateWorldManifestGraph(
    WORLD_MANIFESTS.map(
      (manifest) =>
        PHASE_7_LOCAL_DRAFTS.find((draft) => draft.manifest.id === manifest.id)?.manifest ??
        manifest,
    ),
    WORLD_ASSET_CATALOG,
  ),
);

for (const draft of PHASE_7_LOCAL_DRAFTS) {
  for (const interaction of draft.manifest.interactions) {
    if (
      !isPositionWalkable(
        interaction,
        PLAYER_FOOT_RADIUS,
        draft.manifest.safeSaveBounds,
        draft.manifest.collisions,
      )
    ) {
      throw new Error(`Phase 7 interaction '${interaction.id}' is not safely reachable`);
    }
  }
}

export function getPhase7LocalDraft(mapId: 'lantern-square' | 'moonpetal-meadow') {
  const draft = PHASE_7_LOCAL_DRAFTS.find((candidate) => candidate.manifest.id === mapId);
  if (draft === undefined) throw new Error(`Phase 7 local draft '${mapId}' is unavailable`);
  return draft;
}
