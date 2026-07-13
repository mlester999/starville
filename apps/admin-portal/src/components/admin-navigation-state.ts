export interface AdminNavigationItem {
  readonly href: string;
  readonly label: string;
  readonly exact?: boolean;
}

export function isAdminNavigationItemActive(pathname: string, item: AdminNavigationItem): boolean {
  return item.exact === true
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function activeAdminNavigationHref(
  pathname: string,
  items: readonly AdminNavigationItem[],
): string | undefined {
  return items.find((item) => isAdminNavigationItemActive(pathname, item))?.href;
}
