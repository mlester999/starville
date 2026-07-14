'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { resolveAdminPageChrome } from '../lib/admin-route-meta';
import { AdminBrand } from './admin-brand';
import {
  activeAdminNavigationHref,
  groupAdminNavigationItems,
  resolveInitialSidebarCollapsed,
  writeSidebarCollapsePreference,
  type AdminNavigationItem,
} from './admin-navigation-state';
import { focusTrapTarget } from './dialog-focus';

const iconGlyphs: Readonly<Record<string, string>> = {
  overview: '⌂',
  operations: '◉',
  players: '♙',
  access: '◇',
  world: '◎',
  assets: '▧',
  content: '▤',
  audit: '≡',
  settings: '⚙',
};

export interface AdminAppShellProps {
  readonly items: readonly AdminNavigationItem[];
  readonly collapsedByDefault?: boolean;
  readonly gameName: string;
  readonly administrationName: string;
  readonly logoUrl?: string | null;
  readonly brandMarkUrl?: string | null;
  readonly displayName: string;
  readonly roleName: string;
  readonly environmentLabel?: string | null;
  readonly signOut: ReactNode;
  readonly children: ReactNode;
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return 'A';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'A';
}

export function AdminAppShell({
  items,
  collapsedByDefault = false,
  gameName,
  administrationName,
  logoUrl = null,
  brandMarkUrl = null,
  displayName,
  roleName,
  environmentLabel = null,
  signOut,
  children,
}: AdminAppShellProps) {
  const pathname = usePathname();
  const drawerTitleId = useId();
  const [collapsed, setCollapsed] = useState(collapsedByDefault);
  const [hydrated, setHydrated] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const groups = groupAdminNavigationItems(items);
  const activeHref = activeAdminNavigationHref(pathname, items);
  const chrome = resolveAdminPageChrome(pathname, items);
  const activeLabel = items.find((item) => item.href === activeHref)?.label ?? chrome.title;

  useEffect(() => {
    const storage = typeof window === 'undefined' ? null : window.localStorage;
    setCollapsed(resolveInitialSidebarCollapsed(collapsedByDefault, storage));
    setHydrated(true);
  }, [collapsedByDefault]);

  useEffect(() => {
    if (!hydrated) return;
    writeSidebarCollapsePreference(
      typeof window === 'undefined' ? null : window.localStorage,
      collapsed,
    );
  }, [collapsed, hydrated]);

  useEffect(() => {
    setDrawerOpen(false);
    setProfileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.dataset['adminDrawerOpen'] = 'true';
    queueMicrotask(() =>
      drawerRef.current?.querySelector<HTMLElement>('[aria-current="page"], a[href]')?.focus(),
    );
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      delete document.body.dataset['adminDrawerOpen'];
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!profileOpen) return;
    function handlePointer(event: MouseEvent) {
      if (profileRef.current?.contains(event.target as Node)) return;
      setProfileOpen(false);
    }
    function handleKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') setProfileOpen(false);
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [profileOpen]);

  function closeDrawer(returnFocus = true) {
    setDrawerOpen(false);
    if (returnFocus) queueMicrotask(() => triggerRef.current?.focus());
  }

  function toggleCollapsed() {
    setCollapsed((value) => !value);
  }

  function handleDrawerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDrawer();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = drawerRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled])',
    );
    if (controls === undefined || controls.length === 0) return;
    const destination = focusTrapTarget(
      [...controls],
      document.activeElement as HTMLElement | null,
      event.shiftKey,
    );
    if (destination !== undefined) {
      event.preventDefault();
      destination.focus();
    }
  }

  function renderNavLink(
    item: AdminNavigationItem,
    options: { readonly compact: boolean; readonly onNavigate?: (() => void) | undefined },
  ) {
    const active = item.href === activeHref;
    const glyph = iconGlyphs[item.icon ?? ''] ?? '•';
    return (
      <Link
        aria-current={active ? 'page' : undefined}
        aria-label={options.compact ? item.label : undefined}
        className={`portal-sidebar__link${active ? ' is-active' : ''}`}
        href={item.href}
        key={item.href}
        onClick={() => options.onNavigate?.()}
        title={options.compact ? item.label : undefined}
      >
        <span aria-hidden="true" className="portal-sidebar__icon">
          {glyph}
        </span>
        <span className="portal-sidebar__label">{item.label}</span>
        {item.badgeLabel ? (
          <small className="portal-sidebar__badge">{item.badgeLabel}</small>
        ) : null}
      </Link>
    );
  }

  function renderGroups(compact: boolean, onNavigate?: () => void, idPrefix = 'desktop') {
    return groups.map((group) => {
      const headingId = `portal-nav-group-${idPrefix}-${group.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, '-')}`;
      return (
        <div className="portal-sidebar__group" key={`${idPrefix}-${group.label}`}>
          {compact ? (
            <div
              aria-hidden="true"
              className="portal-sidebar__group-separator"
              title={group.label}
            />
          ) : (
            <h2 className="portal-sidebar__group-label" id={headingId}>
              {group.label}
            </h2>
          )}
          <div
            aria-labelledby={compact ? undefined : headingId}
            className="portal-sidebar__group-links"
            role="group"
          >
            {group.items.map((item) => renderNavLink(item, { compact, onNavigate }))}
          </div>
        </div>
      );
    });
  }

  const brand = (
    <AdminBrand
      administrationName={administrationName}
      compact
      gameName={gameName}
      href="/overview"
      logoUrl={logoUrl}
      markOnly={collapsed}
      markUrl={brandMarkUrl}
    />
  );

  const profileExpanded = (
    <div className="portal-sidebar__profile-copy">
      <span className="portal-sidebar__profile-name">{displayName}</span>
      <span className="portal-sidebar__profile-role">{roleName}</span>
    </div>
  );

  return (
    <div
      className={`portal-shell${collapsed ? ' portal-shell--collapsed' : ''}${
        hydrated ? ' portal-shell--hydrated' : ''
      }`}
    >
      <aside
        aria-label="Administrator sidebar"
        className="portal-sidebar"
        data-collapsed={collapsed ? 'true' : 'false'}
      >
        <div className="portal-sidebar__brand">
          {brand}
          <button
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="portal-sidebar__collapse"
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            type="button"
          >
            <span aria-hidden="true">{collapsed ? '»' : '«'}</span>
          </button>
        </div>

        <nav aria-label="Administrator navigation" className="portal-sidebar__nav">
          {renderGroups(collapsed)}
        </nav>

        <div className="portal-sidebar__footer">
          <div
            className={`portal-sidebar__profile${profileOpen ? ' is-open' : ''}`}
            ref={profileRef}
          >
            {/* Compact account control — used when collapsed or tablet compact rail. */}
            <button
              aria-expanded={profileOpen}
              aria-haspopup="menu"
              aria-label={`Account menu for ${displayName}`}
              className="portal-sidebar__avatar portal-sidebar__avatar--menu"
              onClick={() => setProfileOpen((value) => !value)}
              title={`${displayName} · ${roleName}`}
              type="button"
            >
              <span aria-hidden="true">{initialsFor(displayName)}</span>
            </button>
            <div className="portal-sidebar__profile-expanded">
              <span
                aria-hidden="true"
                className="portal-sidebar__avatar portal-sidebar__avatar--static"
              >
                {initialsFor(displayName)}
              </span>
              {profileExpanded}
              <div className="portal-sidebar__profile-actions">{signOut}</div>
            </div>
            {profileOpen ? (
              <div
                className="portal-sidebar__profile-menu"
                role="menu"
                aria-label="Administrator account"
              >
                <div className="portal-sidebar__profile-menu-meta">
                  <strong>{displayName}</strong>
                  <span>{roleName}</span>
                </div>
                <div className="portal-sidebar__profile-menu-actions" role="none">
                  {signOut}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      <div className="portal-main">
        <header className="portal-header">
          <div className="portal-header__start">
            <button
              aria-controls="admin-mobile-navigation"
              aria-expanded={drawerOpen}
              aria-label={drawerOpen ? 'Close navigation' : 'Open navigation'}
              className="portal-nav-trigger"
              onClick={() => setDrawerOpen(true)}
              ref={triggerRef}
              type="button"
            >
              <span aria-hidden="true" className="portal-nav-trigger__bars">
                ☰
              </span>
              <span className="portal-nav-trigger__label">Menu</span>
            </button>
            <div className="portal-header__titles">
              {chrome.breadcrumbs.length > 1 ? (
                <nav aria-label="Breadcrumb" className="portal-breadcrumb">
                  <ol>
                    {chrome.breadcrumbs.map((crumb, index) => {
                      const isLast = index === chrome.breadcrumbs.length - 1;
                      return (
                        <li key={`${crumb.label}-${index}`}>
                          {crumb.href !== undefined && !isLast ? (
                            <Link href={crumb.href}>{crumb.label}</Link>
                          ) : (
                            <span aria-current={isLast ? 'page' : undefined}>{crumb.label}</span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </nav>
              ) : null}
              <h1 className="portal-header__title">{chrome.title}</h1>
            </div>
          </div>
          <div className="portal-header__end">
            {environmentLabel ? (
              <span
                className="portal-env-badge"
                title={`Application environment: ${environmentLabel}`}
              >
                {environmentLabel}
              </span>
            ) : null}
            <div className="portal-header__account portal-header__account--mobile">
              <span className="account-name">{displayName}</span>
              <span className="account-role">{roleName}</span>
              {signOut}
            </div>
          </div>
        </header>

        <div className="portal-content">{children}</div>
      </div>

      {drawerOpen ? (
        <div className="portal-nav-backdrop" onMouseDown={() => closeDrawer()} role="presentation">
          <div
            aria-label="Administrator navigation"
            aria-labelledby={drawerTitleId}
            aria-modal="true"
            className="portal-nav-drawer"
            id="admin-mobile-navigation"
            onKeyDown={handleDrawerKeyDown}
            onMouseDown={(event) => event.stopPropagation()}
            ref={drawerRef}
            role="dialog"
          >
            <header className="portal-nav-drawer__header">
              <div>
                <AdminBrand
                  administrationName={administrationName}
                  compact
                  gameName={gameName}
                  href="/overview"
                  logoUrl={logoUrl}
                  markUrl={brandMarkUrl}
                />
                <p className="portal-nav-drawer__current" id={drawerTitleId}>
                  {activeLabel}
                </p>
              </div>
              <button
                aria-label="Close navigation"
                className="portal-nav-drawer__close"
                onClick={() => closeDrawer()}
                type="button"
              >
                ×
              </button>
            </header>
            <nav aria-label="Mobile administrator navigation" className="portal-nav-drawer__nav">
              {renderGroups(false, () => closeDrawer(false), 'mobile')}
            </nav>
            <div className="portal-nav-drawer__profile">
              <div className="portal-sidebar__profile-expanded">
                <span
                  aria-hidden="true"
                  className="portal-sidebar__avatar portal-sidebar__avatar--static"
                >
                  {initialsFor(displayName)}
                </span>
                {profileExpanded}
              </div>
              <div className="portal-nav-drawer__actions">{signOut}</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
