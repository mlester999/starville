import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';

import { hasAdminPermission } from '@starville/admin-auth';
import { isModuleEnabled } from '@starville/platform-configuration';

import {
  EconomyNavigation,
  type EconomyNavigationItem,
} from '../../../components/economy-navigation';
import { requireAuthorizedAdmin } from '../../../lib/auth/authorization';
import { requireEnabledPlatformModule } from '../../../lib/platform-configuration/module-access';
import { resolveEconomyNavigationHref } from '../../../lib/platform-configuration/navigation';
import { loadPublicPlatformConfiguration } from '../../../lib/platform-configuration/runtime';

export default async function EconomyLayout({ children }: { readonly children: ReactNode }) {
  const context = await requireAuthorizedAdmin();
  await requireEnabledPlatformModule('offchain_economy');
  const runtime = await loadPublicPlatformConfiguration();
  if (resolveEconomyNavigationHref(runtime.configuration, context.permissionKeys) === null) {
    redirect('/unauthorized');
  }
  const items: EconomyNavigationItem[] = [
    ...(hasAdminPermission(context, 'economy.read')
      ? ([{ href: '/economy', label: 'Overview' }] satisfies EconomyNavigationItem[])
      : []),
    ...(hasAdminPermission(context, 'economy.audit.read')
      ? ([
          { href: '/economy/ledger', label: 'Ledger' },
          { href: '/economy/reconciliation', label: 'Reconciliation' },
        ] satisfies EconomyNavigationItem[])
      : []),
    ...(hasAdminPermission(context, 'economy.settings.read')
      ? ([
          { href: '/economy/sources', label: 'Sources' },
          { href: '/economy/sinks', label: 'Sinks' },
          { href: '/economy/policies', label: 'Policies' },
        ] satisfies EconomyNavigationItem[])
      : []),
    ...(hasAdminPermission(context, 'economy.shop.read')
      ? ([{ href: '/economy/shops', label: 'Shops' }] satisfies EconomyNavigationItem[])
      : []),
    ...(hasAdminPermission(context, 'economy.risk.read')
      ? ([{ href: '/economy/risk', label: 'Risk Review' }] satisfies EconomyNavigationItem[])
      : []),
    ...(hasAdminPermission(context, 'economy.correction.create') ||
    hasAdminPermission(context, 'economy.correction.review')
      ? ([{ href: '/economy/corrections', label: 'Corrections' }] satisfies EconomyNavigationItem[])
      : []),
    ...(hasAdminPermission(context, 'economy.simulation.run') &&
    isModuleEnabled(runtime.configuration, 'economy_simulation')
      ? ([{ href: '/economy/simulations', label: 'Simulations' }] satisfies EconomyNavigationItem[])
      : []),
    ...(hasAdminPermission(context, 'economy.read')
      ? ([
          { href: '/economy/token-claims', label: 'Token Claims' },
        ] satisfies EconomyNavigationItem[])
      : []),
    ...(hasAdminPermission(context, 'economy.audit.read')
      ? ([{ href: '/economy/audit', label: 'Audit' }] satisfies EconomyNavigationItem[])
      : []),
  ];

  return (
    <div className="economy-admin-area">
      <EconomyNavigation items={items} />
      {children}
    </div>
  );
}
