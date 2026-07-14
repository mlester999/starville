import type { ReactNode } from 'react';
import { requireEnabledPlatformModule } from '../../../lib/platform-configuration/module-access';
export default async function Layout({ children }: { readonly children: ReactNode }) {
  await requireEnabledPlatformModule('players');
  return children;
}
