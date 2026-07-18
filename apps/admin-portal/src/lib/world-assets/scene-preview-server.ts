import 'server-only';

import { loadWorldDirectory } from '../worlds/api';
import {
  sceneWorldOptionsFromDirectory,
  type AssetSceneWorldDirectory,
} from './scene-preview-model';

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined;
  return typeof error.status === 'number' ? error.status : undefined;
}

export async function loadAssetSceneWorldDirectory(input: {
  readonly canReadWorlds: boolean;
  readonly canPreviewDrafts: boolean;
}): Promise<AssetSceneWorldDirectory> {
  if (!input.canReadWorlds) {
    return {
      status: 'denied',
      items: [],
      message: 'Your current administrator role cannot read world context for asset preview.',
    };
  }

  try {
    const directory = await loadWorldDirectory({
      page: 1,
      pageSize: 100,
      search: '',
      status: 'active',
      sort: 'display_name',
      direction: 'asc',
    });
    const items = sceneWorldOptionsFromDirectory(directory, input.canPreviewDrafts);
    return {
      status: 'loaded',
      items,
      message:
        items.length === 0
          ? 'No authorized validated draft or published world snapshot is available.'
          : 'Only authorized read-only world projections are listed.',
    };
  } catch (error) {
    return {
      status: errorStatus(error) === 403 ? 'denied' : 'unavailable',
      items: [],
      message:
        errorStatus(error) === 403
          ? 'Your current administrator role cannot read world context for asset preview.'
          : 'World preview context is temporarily unavailable. Asset and world state are unchanged.',
    };
  }
}
