import { ASSET_TYPES, type AssetType } from '@starville/asset-management';

import {
  assetTypeLabel,
  assetTypeProfile,
  formatAssetBytes,
  type AssetTypeProfile,
} from './profiles';

export type RequirementSeverity = 'required' | 'recommended' | 'advisory';

export interface AssetRequirementItem {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly severity: RequirementSeverity;
}

export interface AssetRequirementGuide {
  readonly assetType: AssetType;
  readonly label: string;
  readonly description: string;
  readonly formats: readonly string[];
  readonly recommendedWidth: number;
  readonly recommendedHeight: number;
  readonly recommendedDimensionsLabel: string;
  readonly recommendedRatio: string;
  readonly dimensionsExact: boolean;
  readonly maxFileSizeBytes: number;
  readonly maxFileSizeLabel: string;
  readonly transparency: 'required' | 'optional';
  readonly previewMode: AssetTypeProfile['previewMode'];
  readonly anchorRequired: boolean;
  readonly collisionSupport: AssetTypeProfile['collisionSupport'];
  readonly checklist: readonly AssetRequirementItem[];
  readonly rejectList: readonly string[];
  readonly templateFileName: string;
}

const COMMON_REJECTS = [
  'SVG, HTML, scripts, executables, or archives',
  'Animated or multi-page images',
  'Full-map backgrounds or scene screenshots',
  'Black or solid full-bleed backgrounds when transparency is expected',
  'Embedded UI chrome, debug overlays, or unlicensed material',
] as const;

/**
 * Local, typed presentation of asset-type requirements for the admin portal.
 * Source of truth for dimensions and limits remains the shared profile catalog;
 * this module only shapes operator-facing checklists and guides.
 */
export function assetRequirementGuide(type: AssetType): AssetRequirementGuide {
  const profile = assetTypeProfile(type);
  const checklist: AssetRequirementItem[] = [
    {
      id: 'format',
      label: 'File format',
      detail:
        'Static PNG or WebP only. Browser MIME is advisory; the server decodes the real bytes.',
      severity: 'required',
    },
    {
      id: 'dimensions',
      label: 'Recommended dimensions',
      detail: `${profile.recommendedDimensions} (${profile.recommendedRatio}). These are recommended targets, not a hard server range unless validation reports otherwise.`,
      severity: 'recommended',
    },
    {
      id: 'max-size',
      label: 'Maximum file size',
      detail: `${formatAssetBytes(profile.maxFileSizeBytes)} for ${profile.label.toLowerCase()}.`,
      severity: 'required',
    },
    {
      id: 'transparency',
      label:
        profile.transparency === 'required' ? 'Transparency required' : 'Transparency optional',
      detail:
        profile.transparency === 'required'
          ? 'Use a clean transparent background so terrain and lighting show through.'
          : 'Transparency is optional for this type, but solid full-map backgrounds are still rejected.',
      severity: profile.transparency === 'required' ? 'required' : 'recommended',
    },
  ];

  if (profile.previewMode === 'isometric') {
    checklist.push({
      id: 'isometric',
      label: 'Isometric perspective',
      detail: 'Use the approved Starville isometric camera angle with clean empty padding.',
      severity: 'required',
    });
  }

  if (profile.previewMode === 'icon') {
    checklist.push({
      id: 'icon-safe',
      label: 'Icon safe area',
      detail:
        'Keep the focal object centered and legible at small thumbnail sizes. No embedded labels or counts.',
      severity: 'required',
    });
  }

  if (profile.anchorRequired) {
    checklist.push({
      id: 'anchor',
      label: 'Foot and depth anchors',
      detail:
        'Configured after upload in the version workspace. Keep the ground-contact point visually clear.',
      severity: 'advisory',
    });
  }

  if (profile.collisionSupport !== 'none') {
    checklist.push({
      id: 'collision',
      label: 'Collision footprint',
      detail:
        'Default collision is configured after upload and is only a placement suggestion for new drafts.',
      severity: 'advisory',
    });
  }

  for (const [index, tip] of profile.helperText.entries()) {
    checklist.push({
      id: `tip-${String(index)}`,
      label: 'Production tip',
      detail: tip,
      severity: 'recommended',
    });
  }

  return {
    assetType: type,
    label: profile.label,
    description: profile.description,
    formats: ['PNG', 'WebP'],
    recommendedWidth: profile.recommendedWidth,
    recommendedHeight: profile.recommendedHeight,
    recommendedDimensionsLabel: profile.recommendedDimensions,
    recommendedRatio: profile.recommendedRatio,
    // Portal treats profile sizes as recommendations unless the shared catalog marks them exact.
    dimensionsExact: false,
    maxFileSizeBytes: profile.maxFileSizeBytes,
    maxFileSizeLabel: formatAssetBytes(profile.maxFileSizeBytes),
    transparency: profile.transparency,
    previewMode: profile.previewMode,
    anchorRequired: profile.anchorRequired,
    collisionSupport: profile.collisionSupport,
    checklist,
    rejectList: [...COMMON_REJECTS],
    templateFileName: `starville-${type.replaceAll('_', '-')}-template-${String(profile.recommendedWidth)}x${String(profile.recommendedHeight)}.png`,
  };
}

export function allAssetRequirementGuides(): readonly AssetRequirementGuide[] {
  return ASSET_TYPES.map((type) => assetRequirementGuide(type));
}

export function generalProductionChecklist(): readonly string[] {
  return [
    'Use non-pixel artwork consistent with Starville’s cozy isometric direction.',
    'Export a clean static PNG or WebP at the recommended dimensions for the selected type.',
    'Use transparency when the type expects an isolated object.',
    'Keep the foot/base contact point visually unambiguous.',
    'Do not bake a map, room, collision debug shape, label, or UI chrome into the artwork.',
    'Confirm legibility at in-game scale and in a small thumbnail.',
    'Do not include secrets, personal metadata, source paths, or unlicensed material.',
  ];
}

export function guideGroups(): readonly {
  readonly title: string;
  readonly description: string;
  readonly types: readonly AssetType[];
}[] {
  return [
    {
      title: 'Structures and shops',
      description: 'Buildings, shops, stations, entrances, and bridges.',
      types: ['building', 'shop', 'cooking_station', 'crafting_station', 'home_entrance', 'bridge'],
    },
    {
      title: 'Nature and decoration',
      description: 'Trees, rocks, fences, lamps, signs, and decorative props.',
      types: ['decoration', 'tree', 'rock', 'fence', 'lamp', 'sign'],
    },
    {
      title: 'Terrain and farming',
      description: 'Tiles, farm plots, and crop stages.',
      types: ['terrain_tile', 'farm_plot', 'crop_stage'],
    },
    {
      title: 'Furniture and interior',
      description: 'Furniture, interior objects, and interaction markers.',
      types: ['furniture', 'home_interior_object', 'interaction_marker'],
    },
    {
      title: 'Icons and branding',
      description: 'Inventory icons and platform branding surfaces.',
      types: [
        'item_icon',
        'seed_icon',
        'crop_icon',
        'recipe_icon',
        'furniture_icon',
        'shop_icon',
        'brand_logo',
        'brand_mark',
        'favicon',
        'admin_login_background',
        'landing_hero_background',
        'social_share_image',
      ],
    },
  ];
}

export function typeLabelList(types: readonly AssetType[]): string {
  return types.map((type) => assetTypeLabel(type)).join(', ');
}
