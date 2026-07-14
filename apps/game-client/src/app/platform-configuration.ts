import {
  STARVILLE_DEFAULT_CONFIGURATION,
  EMPTY_PLATFORM_ASSET_URLS,
  activePlatformConfigurationSchema,
  type ActivePlatformConfiguration,
} from '@starville/platform-configuration';

export function compiledPlatformConfiguration(): ActivePlatformConfiguration {
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

export async function fetchPlatformConfiguration(
  apiUrl: string,
  signal?: AbortSignal,
): Promise<ActivePlatformConfiguration> {
  const response = await fetch(`${apiUrl}/api/v1/platform-configuration/starville`, {
    headers: { accept: 'application/json' },
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok) throw new Error('Published presentation is unavailable');
  const envelope = (await response.json()) as { readonly data?: unknown };
  return activePlatformConfigurationSchema.parse(envelope.data);
}
