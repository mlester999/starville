import { describe, expect, it } from 'vitest';

import { activeAdminNavigationHref, type AdminNavigationItem } from './admin-navigation-state';

const items: readonly AdminNavigationItem[] = [
  { href: '/overview', label: 'Overview', exact: true },
  { href: '/operations', label: 'Operations' },
  { href: '/players', label: 'Players' },
  { href: '/token-access', label: 'Token Access' },
  { href: '/worlds', label: 'Worlds' },
  { href: '/world-assets', label: 'World Assets' },
  { href: '/world-audit', label: 'World Audit' },
];

describe('admin navigation route matching', () => {
  it.each([
    ['/overview', '/overview'],
    ['/overview/extra', undefined],
    ['/players', '/players'],
    ['/players/player-id/activity', '/players'],
    ['/operations/live', '/operations'],
    ['/token-access/configuration', '/token-access'],
    ['/worlds/map-id/editor', '/worlds'],
    ['/world-assets/library', '/world-assets'],
    ['/world-audit/event-id', '/world-audit'],
  ])('matches %s to exactly one parent', (pathname, expected) => {
    expect(activeAdminNavigationHref(pathname, items)).toBe(expected);
  });
});
