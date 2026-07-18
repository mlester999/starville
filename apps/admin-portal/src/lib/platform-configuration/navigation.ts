import type { AdminPermissionKey } from '@starville/admin-auth';
import {
  PLATFORM_ROUTE_REGISTRY,
  isModuleEnabled,
  type PlatformConfiguration,
  type PlatformRouteKey,
} from '@starville/platform-configuration';

const ECONOMY_SECTION_LANDING_ROUTES = [
  { permission: 'economy.read', href: '/economy' },
  { permission: 'economy.shop.read', href: '/economy/shops' },
  { permission: 'economy.audit.read', href: '/economy/ledger' },
  { permission: 'economy.settings.read', href: '/economy/policies' },
  { permission: 'economy.risk.read', href: '/economy/risk' },
  { permission: 'economy.correction.create', href: '/economy/corrections' },
  { permission: 'economy.correction.review', href: '/economy/corrections' },
  {
    permission: 'economy.simulation.run',
    href: '/economy/simulations',
    moduleKey: 'economy_simulation',
  },
] as const satisfies readonly {
  readonly permission: AdminPermissionKey;
  readonly href: string;
  readonly moduleKey?: string;
}[];

/**
 * Finds the first economy page an administrator can actually read. Economy has
 * several independently authorized workspaces, so its sidebar entry cannot be
 * coupled only to the overview permission.
 */
export function resolveEconomyNavigationHref(
  configuration: PlatformConfiguration,
  permissionKeys: readonly AdminPermissionKey[],
): string | null {
  if (!isModuleEnabled(configuration, 'offchain_economy')) return null;

  const route = ECONOMY_SECTION_LANDING_ROUTES.find(
    (candidate) =>
      permissionKeys.includes(candidate.permission) &&
      (!('moduleKey' in candidate) || isModuleEnabled(configuration, candidate.moduleKey)),
  );

  return route?.href ?? null;
}

export function resolvePlatformNavigation(
  configuration: PlatformConfiguration,
  permissionKeys: readonly AdminPermissionKey[],
) {
  return configuration.navigation.items
    .filter((item) => {
      const route = PLATFORM_ROUTE_REGISTRY[item.routeKey];
      return (
        isModuleEnabled(configuration, item.moduleKey) &&
        (permissionKeys.includes(route.permission) ||
          (item.routeKey === 'economy' &&
            resolveEconomyNavigationHref(configuration, permissionKeys) !== null))
      );
    })
    .sort((first, second) => first.order - second.order)
    .map((item) => {
      const route = PLATFORM_ROUTE_REGISTRY[item.routeKey];
      const economyHref =
        item.routeKey === 'economy'
          ? resolveEconomyNavigationHref(configuration, permissionKeys)
          : null;

      return {
        href: economyHref ?? route.href,
        label: item.label,
        exact: item.routeKey === 'overview',
        icon: item.icon,
        group: item.group,
        badgeLabel: item.badgeLabel,
      };
    });
}

export function platformRouteAccess(
  configuration: PlatformConfiguration,
  routeKey: PlatformRouteKey,
  permissionKeys: readonly AdminPermissionKey[],
): 'enabled' | 'disabled' | 'denied' {
  const route = PLATFORM_ROUTE_REGISTRY[routeKey];
  if (!permissionKeys.includes(route.permission)) return 'denied';
  return isModuleEnabled(configuration, route.module) ? 'enabled' : 'disabled';
}
