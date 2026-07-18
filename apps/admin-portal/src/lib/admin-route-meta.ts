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
    path: '/game-content/progression',
    meta: {
      title: 'Progression operations',
      description:
        'Versioned skills, curves, unlocks, quest chains, achievements, corrections, and live ops.',
      breadcrumbGroup: 'Administration',
      breadcrumbParent: 'Game content',
      parentHref: '/game-content',
    },
  },
  {
    path: '/economy/token-claims',
    meta: {
      title: 'Token claim security',
      description:
        'Disabled token-claim architecture, treasury threat modeling, and offline simulations.',
      breadcrumbGroup: 'Administration',
      breadcrumbParent: 'Economy',
      parentHref: '/economy',
    },
  },
  {
    path: '/economy/ledger',
    meta: {
      title: 'DUST ledger',
      description: 'Immutable DUST entries, bounded filters, and safe receipt references.',
      breadcrumbGroup: 'Administration',
      breadcrumbParent: 'Economy',
      parentHref: '/economy',
    },
  },
  {
    path: '/economy/sources',
    meta: {
      title: 'DUST sources',
      description: 'Closed, versioned registry of approved DUST creation operations.',
      breadcrumbGroup: 'Administration',
      breadcrumbParent: 'Economy',
      parentHref: '/economy',
    },
  },
  {
    path: '/economy/sinks',
    meta: {
      title: 'DUST sinks',
      description: 'Closed, versioned registry of approved DUST spending operations.',
      breadcrumbGroup: 'Administration',
      breadcrumbParent: 'Economy',
      parentHref: '/economy',
    },
  },
  {
    path: '/economy/shops',
    meta: {
      title: 'Economy shops',
      description: 'Reviewed shop versions, structured offers, scheduling, and publication.',
      breadcrumbGroup: 'Administration',
      breadcrumbParent: 'Economy',
      parentHref: '/economy',
    },
  },
  {
    path: '/economy/policies',
    meta: {
      title: 'Economy policies',
      description: 'Bounded policy drafts, validation, independent review, and activation.',
      breadcrumbGroup: 'Administration',
      breadcrumbParent: 'Economy',
      parentHref: '/economy',
    },
  },
  {
    path: '/economy/reconciliation',
    meta: {
      title: 'Economy reconciliation',
      description: 'Read-only balance evidence and reviewed mismatch workflows.',
      breadcrumbGroup: 'Administration',
      breadcrumbParent: 'Economy',
      parentHref: '/economy',
    },
  },
  {
    path: '/economy/risk',
    meta: {
      title: 'Economy risk review',
      description: 'Human-reviewed economy signals with bounded, audited dispositions.',
      breadcrumbGroup: 'Administration',
      breadcrumbParent: 'Economy',
      parentHref: '/economy',
    },
  },
  {
    path: '/economy/corrections',
    meta: {
      title: 'Economy corrections',
      description: 'Reviewed DUST deltas with separation of duties and immutable settlement.',
      breadcrumbGroup: 'Administration',
      breadcrumbParent: 'Economy',
      parentHref: '/economy',
    },
  },
  {
    path: '/economy/simulations',
    meta: {
      title: 'Economy simulations',
      description: 'Deterministic planning comparisons that never mutate player balances.',
      breadcrumbGroup: 'Administration',
      breadcrumbParent: 'Economy',
      parentHref: '/economy',
    },
  },
  {
    path: '/economy/audit',
    meta: {
      title: 'Economy audit',
      description: 'Append-only evidence for economy administration and review decisions.',
      breadcrumbGroup: 'Administration',
      breadcrumbParent: 'Economy',
      parentHref: '/economy',
    },
  },
  {
    path: '/economy',
    meta: {
      title: 'DUST economy',
      description: 'Off-chain DUST ledger, shops, reconciliation, risk, and corrections.',
      breadcrumbGroup: 'Administration',
    },
  },
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
    path: '/operations/social/parties',
    meta: {
      title: 'Parties',
      description: 'Read-only party membership, reconnect, invitation, and audit visibility.',
      breadcrumbGroup: 'Administration',
      breadcrumbParent: 'Social interactions',
      parentHref: '/operations/social',
    },
  },
  {
    path: '/operations/social/friends',
    meta: {
      title: 'Friendships',
      description: 'Privacy-bounded friendship and request health.',
      breadcrumbGroup: 'Administration',
      breadcrumbParent: 'Social interactions',
      parentHref: '/operations/social',
    },
  },
  {
    path: '/operations/social/audit',
    meta: {
      title: 'Social graph audit',
      description: 'Append-only friends and parties lifecycle evidence.',
      breadcrumbGroup: 'Administration',
      breadcrumbParent: 'Social interactions',
      parentHref: '/operations/social',
    },
  },
  {
    path: '/operations/social',
    meta: {
      title: 'Social interactions',
      description: 'Read-only gift, trade, receipt, and settlement audit visibility.',
      breadcrumbGroup: 'Administration',
      breadcrumbParent: 'Operations',
      parentHref: '/operations',
    },
  },
  {
    path: '/operations/chat',
    meta: {
      title: 'Chat moderation',
      description: 'Protected chat evidence, player reports, and audited safety actions.',
      breadcrumbGroup: 'Administration',
      breadcrumbParent: 'Operations',
      parentHref: '/operations',
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
    path: '/world-assets/guide',
    meta: {
      title: 'Asset guide & templates',
      description: 'Type checklists and local blank PNG templates for World Assets.',
      breadcrumbGroup: 'World Management',
      breadcrumbParent: 'World Assets',
      parentHref: '/world-assets',
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
    path: '/game-content/cosmetics/catalog',
    meta: {
      title: 'Cosmetic catalog',
      description: 'Canonical avatar definitions with cosmetic lifecycle and readiness context.',
      breadcrumbGroup: 'World Management',
      breadcrumbParent: 'Cosmetics',
      parentHref: '/game-content/cosmetics',
    },
  },
  {
    path: '/game-content/cosmetics/collections',
    meta: {
      title: 'Cosmetic collections',
      description: 'Structured cosmetic-only collections and exact-once completion rewards.',
      breadcrumbGroup: 'World Management',
      breadcrumbParent: 'Cosmetics',
      parentHref: '/game-content/cosmetics',
    },
  },
  {
    path: '/game-content/cosmetics/emotes',
    meta: {
      title: 'Cosmetic emotes',
      description: 'Bounded server-authoritative emote definitions and lifecycle.',
      breadcrumbGroup: 'World Management',
      breadcrumbParent: 'Cosmetics',
      parentHref: '/game-content/cosmetics',
    },
  },
  {
    path: '/game-content/cosmetics/grants',
    meta: {
      title: 'Cosmetic grants',
      description: 'Controlled one-player, one-cosmetic grants with immutable receipts.',
      breadcrumbGroup: 'World Management',
      breadcrumbParent: 'Cosmetics',
      parentHref: '/game-content/cosmetics',
    },
  },
  {
    path: '/game-content/cosmetics/revocations',
    meta: {
      title: 'Cosmetic revocations',
      description: 'Audited revocation with safe appearance fallback.',
      breadcrumbGroup: 'World Management',
      breadcrumbParent: 'Cosmetics',
      parentHref: '/game-content/cosmetics',
    },
  },
  {
    path: '/game-content/cosmetics/shop',
    meta: {
      title: 'Disabled cosmetic shop',
      description: 'Draft-only future DUST sink architecture; purchases are disabled.',
      breadcrumbGroup: 'World Management',
      breadcrumbParent: 'Cosmetics',
      parentHref: '/game-content/cosmetics',
    },
  },
  {
    path: '/game-content/cosmetics/review',
    meta: {
      title: 'Cosmetic review',
      description: 'Separated content review using existing Avatar and World Asset pipelines.',
      breadcrumbGroup: 'World Management',
      breadcrumbParent: 'Cosmetics',
      parentHref: '/game-content/cosmetics',
    },
  },
  {
    path: '/game-content/cosmetics/audit',
    meta: {
      title: 'Cosmetic audit',
      description: 'Immutable ownership and collection reward receipts.',
      breadcrumbGroup: 'World Management',
      breadcrumbParent: 'Cosmetics',
      parentHref: '/game-content/cosmetics',
    },
  },
  {
    path: '/game-content/cosmetics/settings',
    meta: {
      title: 'Cosmetic settings',
      description: 'Revisioned Wardrobe, emote, collection, and disabled-shop controls.',
      breadcrumbGroup: 'World Management',
      breadcrumbParent: 'Cosmetics',
      parentHref: '/game-content/cosmetics',
    },
  },
  {
    path: '/game-content/cosmetics',
    meta: {
      title: 'Cosmetics',
      description: 'Wardrobes, outfits, emotes, collections, grants, and safe revocations.',
      breadcrumbGroup: 'World Management',
      breadcrumbParent: 'Game Content',
      parentHref: '/game-content',
    },
  },
  {
    path: '/game-content/avatars/settings',
    meta: {
      title: 'Avatar settings',
      description: 'Bounded creator availability, fallback, and starter-catalog settings.',
      breadcrumbGroup: 'World Management',
      breadcrumbParent: 'Avatar Content',
      parentHref: '/game-content/avatars',
    },
  },
  {
    path: '/game-content/avatars/audit',
    meta: {
      title: 'Avatar audit',
      description: 'Append-only avatar catalog, review, activation, and settings evidence.',
      breadcrumbGroup: 'World Management',
      breadcrumbParent: 'Avatar Content',
      parentHref: '/game-content/avatars',
    },
  },
  {
    path: '/game-content/avatars/presets',
    meta: {
      title: 'Avatar presets',
      description: 'Curated, versioned starter combinations using active approved content.',
      breadcrumbGroup: 'World Management',
      breadcrumbParent: 'Avatar Content',
      parentHref: '/game-content/avatars',
    },
  },
  {
    path: '/game-content/avatars/validation',
    meta: {
      title: 'Avatar validation',
      description: 'Non-mutating eight-direction layer and animation validation previews.',
      breadcrumbGroup: 'World Management',
      breadcrumbParent: 'Avatar Content',
      parentHref: '/game-content/avatars',
    },
  },
  {
    path: '/game-content/avatars/review',
    meta: {
      title: 'Avatar review',
      description: 'Separated review, approval, activation, and superseding workflow.',
      breadcrumbGroup: 'World Management',
      breadcrumbParent: 'Avatar Content',
      parentHref: '/game-content/avatars',
    },
  },
  {
    path: '/game-content/avatars/assets',
    meta: {
      title: 'Avatar assets',
      description: 'Approved World Asset Manager references used by avatar content versions.',
      breadcrumbGroup: 'World Management',
      breadcrumbParent: 'Avatar Content',
      parentHref: '/game-content/avatars',
    },
  },
  {
    path: '/game-content/avatars/catalog',
    meta: {
      title: 'Avatar catalog',
      description: 'Bounded, filterable avatar definitions and immutable active versions.',
      breadcrumbGroup: 'World Management',
      breadcrumbParent: 'Avatar Content',
      parentHref: '/game-content/avatars',
    },
  },
  {
    path: '/game-content/avatars',
    meta: {
      title: 'Avatar Content',
      description: 'Character catalog, production assets, validation, review, and presets.',
      breadcrumbGroup: 'World Management',
      breadcrumbParent: 'Game Content',
      parentHref: '/game-content',
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
