import type { AdminNavigationItem } from '../components/admin-navigation-state';
import {
  activeAdminNavigationHref,
  isAdminNavigationItemActive,
} from '../components/admin-navigation-state';

export interface AdminRouteMeta {
  readonly title: string;
  readonly description?: string;
  readonly breadcrumbGroup?: string;
  readonly breadcrumbParent?: string;
  readonly parentHref?: string;
}

/**
 * Compiled route presentation metadata for the admin application header.
 * Labels remain secondary to platform-configuration navigation labels when a
 * matching navigation item is available.
 */
export const ADMIN_ROUTE_METADATA: readonly {
  readonly path: string;
  readonly exact?: boolean;
  readonly meta: AdminRouteMeta;
}[] = [
  {
    path: '/overview',
    exact: true,
    meta: {
      title: 'Overview',
      description: 'Session assurance and administrator access summary.',
      breadcrumbGroup: 'Administration',
    },
  },
  {
    path: '/operations/live',
    meta: {
      title: 'Live operations',
      description: 'Announcements, maintenance, and live player notices.',
      breadcrumbGroup: 'Administration',
      breadcrumbParent: 'Operations',
      parentHref: '/operations',
    },
  },
  {
    path: '/operations',
    meta: {
      title: 'Operations',
      description: 'Operational summary for authorized administrators.',
      breadcrumbGroup: 'Administration',
    },
  },
  {
    path: '/players',
    meta: {
      title: 'Players',
      description: 'Player directory and account operations.',
      breadcrumbGroup: 'Administration',
    },
  },
  {
    path: '/token-access',
    meta: {
      title: 'Token Access',
      description: 'Token gate and blockchain access configuration.',
      breadcrumbGroup: 'Administration',
    },
  },
  {
    path: '/worlds',
    meta: {
      title: 'Worlds',
      description: 'World graph, maps, and publication controls.',
      breadcrumbGroup: 'World Management',
    },
  },
  {
    path: '/world-assets/upload',
    meta: {
      title: 'Upload asset',
      breadcrumbGroup: 'World Management',
      breadcrumbParent: 'World Assets',
      parentHref: '/world-assets',
    },
  },
  {
    path: '/world-assets/review',
    meta: {
      title: 'Asset review',
      breadcrumbGroup: 'World Management',
      breadcrumbParent: 'World Assets',
      parentHref: '/world-assets',
    },
  },
  {
    path: '/world-assets/audit',
    meta: {
      title: 'Asset audit',
      breadcrumbGroup: 'World Management',
      breadcrumbParent: 'World Assets',
      parentHref: '/world-assets',
    },
  },
  {
    path: '/world-assets',
    meta: {
      title: 'World Assets',
      description: 'Approved world asset library and review workflow.',
      breadcrumbGroup: 'World Management',
    },
  },
  {
    path: '/game-content',
    meta: {
      title: 'Game Content',
      description: 'Inspection-only cozy gameplay content views.',
      breadcrumbGroup: 'World Management',
    },
  },
  {
    path: '/world-audit',
    meta: {
      title: 'World Audit',
      description: 'Append-only world change history.',
      breadcrumbGroup: 'World Management',
    },
  },
  {
    path: '/platform-settings/branding',
    meta: {
      title: 'Branding',
      breadcrumbGroup: 'Platform',
      breadcrumbParent: 'Platform Settings',
      parentHref: '/platform-settings',
    },
  },
  {
    path: '/platform-settings/theme',
    meta: {
      title: 'Theme',
      breadcrumbGroup: 'Platform',
      breadcrumbParent: 'Platform Settings',
      parentHref: '/platform-settings',
    },
  },
  {
    path: '/platform-settings/typography',
    meta: {
      title: 'Typography',
      breadcrumbGroup: 'Platform',
      breadcrumbParent: 'Platform Settings',
      parentHref: '/platform-settings',
    },
  },
  {
    path: '/platform-settings/admin-login',
    meta: {
      title: 'Admin login',
      breadcrumbGroup: 'Platform',
      breadcrumbParent: 'Platform Settings',
      parentHref: '/platform-settings',
    },
  },
  {
    path: '/platform-settings/landing',
    meta: {
      title: 'Landing',
      breadcrumbGroup: 'Platform',
      breadcrumbParent: 'Platform Settings',
      parentHref: '/platform-settings',
    },
  },
  {
    path: '/platform-settings/navigation',
    meta: {
      title: 'Navigation',
      breadcrumbGroup: 'Platform',
      breadcrumbParent: 'Platform Settings',
      parentHref: '/platform-settings',
    },
  },
  {
    path: '/platform-settings/modules',
    meta: {
      title: 'Modules',
      breadcrumbGroup: 'Platform',
      breadcrumbParent: 'Platform Settings',
      parentHref: '/platform-settings',
    },
  },
  {
    path: '/platform-settings/preview',
    meta: {
      title: 'Preview',
      breadcrumbGroup: 'Platform',
      breadcrumbParent: 'Platform Settings',
      parentHref: '/platform-settings',
    },
  },
  {
    path: '/platform-settings/versions',
    meta: {
      title: 'Versions',
      breadcrumbGroup: 'Platform',
      breadcrumbParent: 'Platform Settings',
      parentHref: '/platform-settings',
    },
  },
  {
    path: '/platform-settings/audit',
    meta: {
      title: 'Configuration audit',
      breadcrumbGroup: 'Platform',
      breadcrumbParent: 'Platform Settings',
      parentHref: '/platform-settings',
    },
  },
  {
    path: '/platform-settings',
    exact: true,
    meta: {
      title: 'Platform Settings',
      description: 'White-label presentation, navigation, and module configuration.',
      breadcrumbGroup: 'Platform',
    },
  },
  {
    path: '/module-disabled',
    exact: true,
    meta: {
      title: 'Module unavailable',
      description: 'This module is disabled for the active platform configuration.',
    },
  },
] as const;

export interface AdminBreadcrumb {
  readonly label: string;
  readonly href?: string;
}

export interface ResolvedAdminPageChrome {
  readonly title: string;
  readonly description?: string | undefined;
  readonly breadcrumbs: readonly AdminBreadcrumb[];
  readonly activeNavigationHref?: string | undefined;
}

function matchesRoute(pathname: string, path: string, exact: boolean | undefined): boolean {
  if (exact === true) return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function resolveAdminRouteMeta(pathname: string): AdminRouteMeta | undefined {
  // Longest registered path wins so nested routes beat their parents.
  const matches = ADMIN_ROUTE_METADATA.filter(({ path, exact }) =>
    matchesRoute(pathname, path, exact),
  ).sort((first, second) => second.path.length - first.path.length);
  return matches[0]?.meta;
}

export function resolveAdminPageChrome(
  pathname: string,
  navigation: readonly AdminNavigationItem[],
): ResolvedAdminPageChrome {
  const activeNavigationHref = activeAdminNavigationHref(pathname, navigation);
  const activeItem = navigation.find((item) => item.href === activeNavigationHref);
  const meta = resolveAdminRouteMeta(pathname);

  const title = meta?.title ?? activeItem?.label ?? 'Administration';
  const description = meta?.description;
  const breadcrumbs: AdminBreadcrumb[] = [];

  const groupLabel =
    meta?.breadcrumbGroup ??
    activeItem?.group ??
    (activeItem === undefined ? undefined : 'Administration');

  if (groupLabel !== undefined) {
    breadcrumbs.push({ label: groupLabel });
  }

  const parentHref = meta?.parentHref;
  const parentLabel = meta?.breadcrumbParent;
  if (parentHref !== undefined && parentLabel !== undefined) {
    const parentVisible =
      navigation.some((item) => item.href === parentHref) ||
      navigation.some((item) => isAdminNavigationItemActive(parentHref, item));
    if (parentVisible) {
      breadcrumbs.push({ label: parentLabel, href: parentHref });
    }
  }

  // Current page — never a link. Prefer nested route titles when present.
  const currentLabel =
    meta !== undefined && meta.title !== activeItem?.label
      ? meta.title
      : (activeItem?.label ?? title);
  if (breadcrumbs.length > 0 || meta !== undefined || activeItem !== undefined) {
    breadcrumbs.push({ label: currentLabel });
  }

  return {
    title: activeItem !== undefined && meta === undefined ? activeItem.label : title,
    description,
    breadcrumbs,
    activeNavigationHref,
  };
}
