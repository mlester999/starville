import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  activeAdminNavigationHref,
  groupAdminNavigationItems,
  readSidebarCollapsePreference,
  resolveInitialSidebarCollapsed,
  writeSidebarCollapsePreference,
  type AdminNavigationItem,
} from './admin-navigation-state';
import { resolveAdminPageChrome } from '../lib/admin-route-meta';

const items: readonly AdminNavigationItem[] = [
  { href: '/overview', label: 'Overview', exact: true, icon: 'overview', group: 'Administration' },
  { href: '/operations', label: 'Operations', icon: 'operations', group: 'Administration' },
  { href: '/players', label: 'Players', icon: 'players', group: 'Administration' },
  { href: '/token-access', label: 'Token Access', icon: 'access', group: 'Administration' },
  { href: '/worlds', label: 'Worlds', icon: 'world', group: 'World Management' },
  { href: '/world-assets', label: 'World Assets', icon: 'assets', group: 'World Management' },
  { href: '/game-content', label: 'Game Content', icon: 'content', group: 'World Management' },
  { href: '/world-audit', label: 'World Audit', icon: 'audit', group: 'World Management' },
  {
    href: '/platform-settings',
    label: 'Platform Settings',
    icon: 'settings',
    group: 'Platform',
  },
];

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    className,
    ...rest
  }: {
    readonly children: React.ReactNode;
    readonly href: string;
    readonly className?: string;
    readonly [key: string]: unknown;
  }) =>
    createElement(
      'a',
      {
        href,
        className,
        ...Object.fromEntries(
          Object.entries(rest).filter(([key]) => key.startsWith('aria-') || key === 'title'),
        ),
      },
      children,
    ),
}));

let mockPathname = '/overview';

describe('admin navigation route matching', () => {
  it.each([
    ['/overview', '/overview'],
    ['/overview/extra', undefined],
    ['/players', '/players'],
    ['/players/player-id/activity', '/players'],
    ['/operations/live', '/operations'],
    ['/token-access/configuration', '/token-access'],
    ['/worlds/map-id/editor', '/worlds'],
    ['/world-assets/upload', '/world-assets'],
    ['/world-assets/library', '/world-assets'],
    ['/platform-settings/theme', '/platform-settings'],
    ['/world-audit/event-id', '/world-audit'],
  ])('matches %s to exactly one parent', (pathname, expected) => {
    expect(activeAdminNavigationHref(pathname, items)).toBe(expected);
  });
});

describe('admin navigation grouping', () => {
  it('orders Administration, World Management, and Platform groups', () => {
    const groups = groupAdminNavigationItems(items);
    expect(groups.map((group) => group.label)).toEqual([
      'Administration',
      'World Management',
      'Platform',
    ]);
    expect(groups[0]?.items.map((item) => item.label)).toEqual([
      'Overview',
      'Operations',
      'Players',
      'Token Access',
    ]);
    expect(groups[1]?.items.map((item) => item.label)).toEqual([
      'Worlds',
      'World Assets',
      'Game Content',
      'World Audit',
    ]);
    expect(groups[2]?.items.map((item) => item.label)).toEqual(['Platform Settings']);
  });

  it('preserves configured labels, icons, and item order within groups', () => {
    const configured: readonly AdminNavigationItem[] = [
      {
        href: '/players',
        label: 'Residents',
        icon: 'players',
        group: 'Administration',
      },
      {
        href: '/overview',
        label: 'Village Pulse',
        exact: true,
        icon: 'overview',
        group: 'Administration',
      },
      {
        href: '/platform-settings',
        label: 'Brand Studio',
        icon: 'settings',
        group: 'Platform',
      },
    ];
    const groups = groupAdminNavigationItems(configured);
    expect(groups[0]?.items).toEqual([
      expect.objectContaining({ label: 'Residents', icon: 'players' }),
      expect.objectContaining({ label: 'Village Pulse', icon: 'overview' }),
    ]);
    expect(groups[1]?.items[0]).toEqual(
      expect.objectContaining({ label: 'Brand Studio', href: '/platform-settings' }),
    );
  });
});

describe('sidebar collapse preference', () => {
  it('reads and writes local preference without throwing on storage failure', () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
    };

    expect(readSidebarCollapsePreference(storage)).toBeNull();
    expect(resolveInitialSidebarCollapsed(false, storage)).toBe(false);
    writeSidebarCollapsePreference(storage, true);
    expect(readSidebarCollapsePreference(storage)).toBe(true);
    expect(resolveInitialSidebarCollapsed(false, storage)).toBe(true);
    writeSidebarCollapsePreference(storage, false);
    expect(resolveInitialSidebarCollapsed(true, storage)).toBe(false);
  });

  it('falls back to configured default when storage is unavailable', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readSidebarCollapsePreference(blocked)).toBeNull();
    expect(() => writeSidebarCollapsePreference(blocked, true)).not.toThrow();
    expect(resolveInitialSidebarCollapsed(true, null)).toBe(true);
  });
});

describe('admin page chrome and breadcrumbs', () => {
  it('keeps nested routes under the correct parent label and aria-ready title', () => {
    expect(resolveAdminPageChrome('/players/abc', items)).toMatchObject({
      title: 'Players',
      activeNavigationHref: '/players',
      breadcrumbs: expect.arrayContaining([
        expect.objectContaining({ label: 'Administration' }),
        expect.objectContaining({ label: 'Players' }),
      ]),
    });
    expect(resolveAdminPageChrome('/world-assets/upload', items)).toMatchObject({
      title: 'Upload asset',
      activeNavigationHref: '/world-assets',
      breadcrumbs: [
        { label: 'World Management' },
        { label: 'World Assets', href: '/world-assets' },
        { label: 'Upload asset' },
      ],
    });
    expect(resolveAdminPageChrome('/platform-settings/theme', items)).toMatchObject({
      title: 'Theme',
      activeNavigationHref: '/platform-settings',
      breadcrumbs: [
        { label: 'Platform' },
        { label: 'Platform Settings', href: '/platform-settings' },
        { label: 'Theme' },
      ],
    });
  });

  it('does not breadcrumb unauthorized parent routes', () => {
    const limited = items.filter((item) => item.href === '/overview');
    const chrome = resolveAdminPageChrome('/world-assets/upload', limited);
    expect(chrome.breadcrumbs.some((crumb) => crumb.href === '/world-assets')).toBe(false);
  });
});

describe('admin app shell presentation', () => {
  beforeEach(() => {
    mockPathname = '/overview';
  });

  it('renders expanded sidebar groups, profile, and collapse control', async () => {
    const { AdminAppShell } = await import('./admin-app-shell');
    const markup = renderToStaticMarkup(
      createElement(AdminAppShell, {
        items,
        collapsedByDefault: false,
        gameName: 'STARVILLE',
        administrationName: 'Starville Administration',
        displayName: 'Star Dev',
        roleName: 'Super Admin',
        environmentLabel: 'Development',
        logoUrl: 'https://cdn.example/logo.png',
        signOut: createElement('button', { type: 'submit' }, 'Sign out'),
        children: createElement('main', null, 'Content'),
      }),
    );

    expect(markup).toContain('Administrator navigation');
    expect(markup).toContain('Administration');
    expect(markup).toContain('World Management');
    expect(markup).toContain('Platform');
    expect(markup).toContain('Platform Settings');
    expect(markup).toContain('Star Dev');
    expect(markup).toContain('Super Admin');
    expect(markup).toContain('Sign out');
    expect(markup).toContain('Collapse sidebar');
    expect(markup).toContain('Development');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('href="/overview"');
    expect(markup).toContain('https://cdn.example/logo.png');
    expect(markup).not.toContain('portal-nav--horizontal');
  });

  it('renders collapsed icon-only links with accessible names and expand control', async () => {
    mockPathname = '/world-assets/upload';
    const { AdminAppShell } = await import('./admin-app-shell');
    const markup = renderToStaticMarkup(
      createElement(AdminAppShell, {
        items,
        collapsedByDefault: true,
        gameName: 'STARVILLE',
        administrationName: 'Starville Administration',
        displayName: 'Star Dev',
        roleName: 'Super Admin',
        signOut: createElement('button', { type: 'submit' }, 'Sign out'),
        children: createElement('main', null, 'Content'),
      }),
    );

    expect(markup).toContain('portal-shell--collapsed');
    expect(markup).toContain('Expand sidebar');
    expect(markup).toContain('aria-label="World Assets"');
    expect(markup).toContain('title="World Assets"');
    expect(markup).toContain('brand--mark-only');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('Account menu for Star Dev');
  });

  it('keeps mobile drawer markup with brand, groups, profile, and focus trap hooks', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('./admin-app-shell.tsx', import.meta.url), 'utf8'),
    );
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain("event.key === 'Escape'");
    expect(source).toContain('focusTrapTarget');
    expect(source).toContain('Open navigation');
    expect(source).toContain('Close navigation');
    expect(source).toContain('Mobile administrator navigation');
    expect(source).toContain('setDrawerOpen(false)');
    expect(source).toContain('triggerRef.current?.focus()');
    expect(source).toContain('writeSidebarCollapsePreference');
    expect(source).toContain('resolveInitialSidebarCollapsed');
    expect(source).toContain("document.body.style.overflow = 'hidden'");
    expect(source).toContain("document.documentElement.style.overflow = 'hidden'");
    expect(source).toContain('adminDrawerOpen');
  });

  it('pins the administrator profile in the sidebar footer for both shell states', async () => {
    const { AdminAppShell } = await import('./admin-app-shell');
    const expanded = renderToStaticMarkup(
      createElement(AdminAppShell, {
        items,
        collapsedByDefault: false,
        gameName: 'STARVILLE',
        administrationName: 'Starville Administration',
        displayName: 'Star Dev',
        roleName: 'Super Admin',
        signOut: createElement('button', { type: 'submit' }, 'Sign out'),
        children: createElement('main', null, 'Content'),
      }),
    );
    expect(expanded).toContain('portal-sidebar__footer');
    expect(expanded).toContain('portal-sidebar__profile-expanded');
    expect(expanded).toContain('portal-sidebar__avatar--menu');
    expect(expanded).toContain('Sign out');

    const collapsed = renderToStaticMarkup(
      createElement(AdminAppShell, {
        items,
        collapsedByDefault: true,
        gameName: 'STARVILLE',
        administrationName: 'Starville Administration',
        displayName: 'Star Dev',
        roleName: 'Super Admin',
        signOut: createElement('button', { type: 'submit' }, 'Sign out'),
        children: createElement('main', null, 'Content'),
      }),
    );
    expect(collapsed).toContain('portal-shell--collapsed');
    expect(collapsed).toContain('Account menu for Star Dev');
    expect(collapsed).toContain('portal-sidebar__footer');
  });

  it('does not claim overflow-x scroll on the shell root', async () => {
    const css = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8'),
    );
    expect(css).toContain('overflow-x: hidden');
    expect(css).toContain('--portal-sidebar-width-expanded: 16.5rem');
    expect(css).toContain('--portal-sidebar-width-collapsed: 4.85rem');
    expect(css).toContain('portal-sidebar__group-label');
    expect(css).toContain('prefers-reduced-motion');
  });

  it('shares one desktop shell header height between sidebar brand and app header', async () => {
    const css = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8'),
    );
    expect(css).toContain('--admin-shell-header-height: 5.25rem');
    expect(css).toMatch(
      /\.portal-sidebar__brand\s*\{[^}]*height:\s*var\(--admin-shell-header-height\)/su,
    );
    expect(css).toMatch(/\.portal-header\s*\{[^}]*height:\s*var\(--admin-shell-header-height\)/su);
  });

  it('uses a locked full-height shell with independent main and nav scrolling', async () => {
    const css = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8'),
    );
    expect(css).toMatch(/\.portal-theme\s*\{[^}]*height:\s*100dvh/su);
    expect(css).toMatch(/\.portal-theme\s*\{[^}]*overflow:\s*hidden/su);
    expect(css).toMatch(/\.portal-shell\s*\{[^}]*height:\s*100%/su);
    expect(css).toMatch(/\.portal-shell\s*\{[^}]*overflow:\s*hidden/su);
    expect(css).toMatch(/\.portal-sidebar\s*\{[^}]*height:\s*100%/su);
    expect(css).toMatch(/\.portal-sidebar\s*\{[^}]*min-height:\s*0/su);
    expect(css).toMatch(/\.portal-sidebar__nav\s*\{[^}]*flex:\s*1 1 auto/su);
    expect(css).toMatch(/\.portal-sidebar__nav\s*\{[^}]*overflow-y:\s*auto/su);
    expect(css).toMatch(/\.portal-sidebar__footer\s*\{[^}]*margin-top:\s*auto/su);
    expect(css).toMatch(/\.portal-content\s*\{[^}]*overflow-y:\s*auto/su);
    expect(css).toMatch(/\.portal-main\s*\{[^}]*min-height:\s*0/su);
    expect(css).not.toMatch(/\.portal-sidebar\s*\{[^}]*position:\s*sticky/su);
  });

  it('centralizes shell breakpoints for desktop rail and drawer modes', async () => {
    const css = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8'),
    );
    expect(css).toContain('--admin-shell-bp-desktop: 75rem');
    expect(css).toContain('--admin-shell-bp-mobile: 47.9875rem');
    expect(css).toContain(
      '@media (min-width: 48rem) and (max-width: 74.9875rem) and (orientation: landscape)',
    );
    expect(css).toContain(
      '@media (max-width: 47.9875rem), (max-width: 74.9875rem) and (orientation: portrait)',
    );
    expect(css).toMatch(
      /orientation: landscape\)\s*\{[\s\S]*?--portal-sidebar-width:\s*var\(--portal-sidebar-width-collapsed\)/u,
    );
    expect(css).toMatch(
      /orientation: portrait\)\s*\{[\s\S]*?\.portal-sidebar\s*\{[\s\S]*?display:\s*none/u,
    );
    expect(css).toMatch(/\.portal-nav-drawer\s*\{[\s\S]*?width:\s*min\(88vw,\s*21\.25rem\)/u);
    expect(css).toMatch(/\.portal-nav-drawer\s*\{[\s\S]*?height:\s*100%/u);
  });
});
