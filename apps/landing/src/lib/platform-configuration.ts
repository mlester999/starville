import {
  STARVILLE_DEFAULT_CONFIGURATION,
  EMPTY_PLATFORM_ASSET_URLS,
  activePlatformConfigurationSchema,
  type ActivePlatformConfiguration,
} from '@starville/platform-configuration';
import { cache } from 'react';

import { parseLandingPublicConfig } from './public-config';

async function load(): Promise<ActivePlatformConfiguration> {
  const publicConfig = parseLandingPublicConfig(process.env);
  try {
    const response = await fetch(`${publicConfig.apiUrl}/api/v1/platform-configuration/starville`, {
      headers: { accept: 'application/json' },
      next: { revalidate: 30 },
    });
    if (!response.ok) throw new Error('Published configuration unavailable');
    const envelope = (await response.json()) as { readonly data?: unknown };
    return activePlatformConfigurationSchema.parse(envelope.data);
  } catch {
    return activePlatformConfigurationSchema.parse({
      platformKey: 'starville',
      versionId: null,
      versionNumber: 0,
      revision: 0,
      configuration: STARVILLE_DEFAULT_CONFIGURATION,
      assetUrls: EMPTY_PLATFORM_ASSET_URLS,
      fallback: true,
      etag: 'platform-compiled-starville-v1',
    });
  }
}

export const loadPublishedPlatformConfiguration = cache(load);
