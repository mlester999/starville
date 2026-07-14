import 'server-only';

import type { PlatformModuleKey } from '@starville/platform-configuration';
import { isModuleEnabled } from '@starville/platform-configuration';
import { redirect } from 'next/navigation';

import { loadPublicPlatformConfiguration } from './runtime';

export async function requireEnabledPlatformModule(moduleKey: PlatformModuleKey): Promise<void> {
  const runtime = await loadPublicPlatformConfiguration();
  if (!isModuleEnabled(runtime.configuration, moduleKey)) {
    redirect(`/module-disabled?module=${encodeURIComponent(moduleKey)}`);
  }
}
