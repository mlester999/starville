export interface AdminNavigationItem {
  readonly href: string;
  readonly label: string;
  readonly exact?: boolean;
  readonly icon?: string;
  readonly group?: string;
  readonly badgeLabel?: string | null;
}

export interface AdminNavigationGroup {
  readonly label: string;
  readonly items: readonly AdminNavigationItem[];
}

/** Preferred group order for the premium sidebar. Unknown groups follow by first appearance. */
export const ADMIN_NAVIGATION_GROUP_ORDER = [
  'Administration',
  'World Management',
  'Platform',
] as const;

export const ADMIN_SIDEBAR_COLLAPSE_STORAGE_KEY = 'starville.admin.sidebar.collapsed';

export function isAdminNavigationItemActive(pathname: string, item: AdminNavigationItem): boolean {
  return item.exact === true
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Resolves the single active navigation href for a pathname.
 * Longer hrefs win so nested modules do not steal parent active state incorrectly
 * when paths could theoretically overlap.
 */
export function activeAdminNavigationHref(
  pathname: string,
  items: readonly AdminNavigationItem[],
): string | undefined {
  const matches = items
    .filter((item) => isAdminNavigationItemActive(pathname, item))
    .sort((first, second) => second.href.length - first.href.length);
  return matches[0]?.href;
}

export function groupAdminNavigationItems(
  items: readonly AdminNavigationItem[],
): readonly AdminNavigationGroup[] {
  const grouped = new Map<string, AdminNavigationItem[]>();

  for (const item of items) {
    const group = item.group?.trim() || 'Administration';
    const existing = grouped.get(group);
    if (existing === undefined) {
      grouped.set(group, [item]);
    } else {
      existing.push(item);
    }
  }

  const preferred = ADMIN_NAVIGATION_GROUP_ORDER.filter((label) => grouped.has(label));
  const remainder = [...grouped.keys()]
    .filter(
      (label) =>
        !ADMIN_NAVIGATION_GROUP_ORDER.includes(
          label as (typeof ADMIN_NAVIGATION_GROUP_ORDER)[number],
        ),
    )
    .sort((first, second) => first.localeCompare(second));

  return [...preferred, ...remainder].map((label) => ({
    label,
    items: grouped.get(label) ?? [],
  }));
}

export function readSidebarCollapsePreference(
  storage: Pick<Storage, 'getItem'> | null | undefined,
): boolean | null {
  if (storage === null || storage === undefined) return null;
  try {
    const value = storage.getItem(ADMIN_SIDEBAR_COLLAPSE_STORAGE_KEY);
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
  } catch {
    return null;
  }
}

export function writeSidebarCollapsePreference(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  collapsed: boolean,
): void {
  if (storage === null || storage === undefined) return;
  try {
    storage.setItem(ADMIN_SIDEBAR_COLLAPSE_STORAGE_KEY, collapsed ? 'true' : 'false');
  } catch {
    // Private mode or blocked storage must never break navigation.
  }
}

export function resolveInitialSidebarCollapsed(
  collapsedByDefault: boolean,
  storage: Pick<Storage, 'getItem'> | null | undefined,
): boolean {
  return readSidebarCollapsePreference(storage) ?? collapsedByDefault;
}
