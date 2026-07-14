import type { AdminPermissionKey } from '@starville/admin-auth';
import {
  PLATFORM_ROUTE_REGISTRY,
  isModuleEnabled,
  type PlatformConfiguration,
  type PlatformRouteKey,
} from '@starville/platform-configuration';

export function resolvePlatformNavigation(
  configuration: PlatformConfiguration,
  permissionKeys: readonly AdminPermissionKey[],
) {
  return configuration.navigation.items
    .filter((item) => {
      const route = PLATFORM_ROUTE_REGISTRY[item.routeKey];
      return (
        isModuleEnabled(configuration, item.moduleKey) && permissionKeys.includes(route.permission)
      );
    })
    .sort((first, second) => first.order - second.order)
    .map((item) => ({
      href: PLATFORM_ROUTE_REGISTRY[item.routeKey].href,
      label: item.label,
      exact: item.routeKey === 'overview',
      icon: item.icon,
      group: item.group,
      badgeLabel: item.badgeLabel,
    }));
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
