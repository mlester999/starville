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

function sourceManifest(mapId: MapId): MapManifest {
  const manifest = WORLD_MANIFESTS.find((candidate) => candidate.id === mapId);
  if (manifest === undefined) throw new Error(`Phase 7 source map '${mapId}' is unavailable`);
  return manifest;
}

function phase7DevelopmentArt(source: MapManifest): MapManifestInput['developmentArt'] {
  return {
    ...source.developmentArt,
    temporary: true,
    label: 'Phase 7 local draft procedural interaction markers — not published',
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
  ],
  objects: [
    ...lanternSquareSource.objects,
    {
      id: 'phase7-general-store-object',
      assetId: 'phase7-general-store-marker',
      kind: 'shop',
      x: 5,
      y: 5.7,
      scale: 1,
    },
    {
      id: 'phase7-cooking-hearth-object',
      assetId: 'phase7-cooking-hearth-marker',
      kind: 'cooking_station',
      x: 14.8,
      y: 6.1,
      scale: 1,
    },
    {
      id: 'phase7-crafting-workbench-object',
      assetId: 'phase7-crafting-workbench-marker',
      kind: 'crafting_station',
      x: 14.8,
      y: 7.8,
      scale: 1,
    },
    {
      id: 'phase7-home-entrance-object',
      assetId: 'phase7-home-entrance-marker',
      kind: 'home_entrance',
      x: 19,
      y: 8,
      scale: 1,
    },
    {
      id: 'phase10b-wardrobe-mirror-object',
      assetId: 'phase10b-wardrobe-mirror-marker',
      kind: 'sign',
      x: 10.8,
      y: 6.4,
      scale: 1,
    },
    {
      id: 'phase10b-wardrobe-furniture-object',
      assetId: 'phase10b-wardrobe-furniture-marker',
      kind: 'sign',
      x: 12.3,
      y: 6.4,
      scale: 1,
    },
  ],
  interactions: [
    ...lanternSquareSource.interactions,
    {
      id: 'phase7-general-store',
      type: 'shop',
      x: 5,
      y: 5.7,
      range: 1.5,
      title: 'Lantern General Store',
      content: 'Browse server-priced seeds, pantry goods, materials, and starter furnishings.',
      shopSlug: 'lantern-general-store',
    },
    {
      id: 'phase7-cooking-hearth',
      type: 'cooking_station',
      x: 14.8,
      y: 6.1,
      range: 1.35,
      title: 'Cooking Hearth',
      content: 'Prepare recipes defined by the trusted Starville cooking catalog.',
      stationType: 'cooking_hearth',
    },
    {
      id: 'phase7-crafting-workbench',
      type: 'crafting_station',
      x: 14.8,
      y: 7.8,
      range: 1.35,
      title: 'Crafting Workbench',
      content: 'Create simple materials and furnishings from trusted recipes.',
      stationType: 'crafting_workbench',
    },
    {
      id: 'phase7-home-entrance',
      type: 'home_entrance',
      x: 19,
      y: 8,
      range: 1.5,
      title: 'Starter Cottage',
      content: 'Enter the private starter home assigned by the Starville server.',
      homeTemplateSlug: 'starter-cottage-interior',
    },
    {
      id: 'phase10b-wardrobe-mirror',
      type: 'notice',
      x: 10.8,
      y: 6.8,
      range: 1.35,
      title: 'Wardrobe Mirror',
      content: 'Open the same server-authoritative Wardrobe available from village settings.',
    },
    {
      id: 'phase10b-wardrobe-furniture',
      type: 'notice',
      x: 12.3,
      y: 6.8,
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
