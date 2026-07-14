import { STARVILLE_DEFAULT_CONFIGURATION } from '@starville/platform-configuration';
import { describe, expect, it } from 'vitest';

import { platformRouteAccess, resolvePlatformNavigation } from './navigation';

const superAdminPermissions = [
  'overview.read',
  'operations.read',
  'players.read',
  'token_gate.read',
  'maps.read',
  'assets.read',
  'items.read',
  'maps.audit_read',
  'platform_configuration.read',
] as const;

describe('platform navigation authorization', () => {
  it('requires both an enabled module and the fixed route permission', () => {
    const configuration = structuredClone(STARVILLE_DEFAULT_CONFIGURATION);
    configuration.modules.find(({ key }) => key === 'world_assets')!.enabled = false;
    expect(platformRouteAccess(configuration, 'world_assets', ['assets.read'])).toBe('disabled');
    expect(platformRouteAccess(configuration, 'players', [])).toBe('denied');
    expect(resolvePlatformNavigation(configuration, ['assets.read'])).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ href: '/world-assets' })]),
    );
  });

  it('renaming a navigation item does not change its fixed permission', () => {
    const configuration = structuredClone(STARVILLE_DEFAULT_CONFIGURATION);
    configuration.navigation.items.find(({ routeKey }) => routeKey === 'players')!.label =
      'Residents';
    expect(resolvePlatformNavigation(configuration, ['players.read'])).toEqual(
      expect.arrayContaining([expect.objectContaining({ href: '/players', label: 'Residents' })]),
    );
    expect(platformRouteAccess(configuration, 'players', [])).toBe('denied');
  });

  it('hides disabled modules and unauthorized routes while keeping required platform navigation', () => {
    const configuration = structuredClone(STARVILLE_DEFAULT_CONFIGURATION);
    configuration.modules.find(({ key }) => key === 'players')!.enabled = false;
    const navigation = resolvePlatformNavigation(configuration, [
      'overview.read',
      'platform_configuration.read',
    ]);
    expect(navigation.map(({ href }) => href)).toEqual(['/overview', '/platform-settings']);
    expect(navigation).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ href: '/players' })]),
    );
  });

  it('preserves configured order, groups, icons, and labels for authorized modules', () => {
    const configuration = structuredClone(STARVILLE_DEFAULT_CONFIGURATION);
    const overview = configuration.navigation.items.find(
      ({ routeKey }) => routeKey === 'overview',
    )!;
    overview.label = 'Command Center';
    overview.icon = 'settings';
    overview.order = 900;
    const resolved = resolvePlatformNavigation(configuration, [...superAdminPermissions]);
    expect(resolved.at(-1)).toEqual(
      expect.objectContaining({
        href: '/overview',
        label: 'Command Center',
        icon: 'settings',
        group: 'Administration',
      }),
    );
    expect(resolved.find(({ href }) => href === '/world-assets')).toEqual(
      expect.objectContaining({ group: 'World Management', icon: 'assets' }),
    );
    expect(resolved.find(({ href }) => href === '/platform-settings')).toEqual(
      expect.objectContaining({ group: 'Platform', label: 'Platform Settings' }),
    );
  });

  it('falls back to compiled defaults when configuration is the Starville default document', () => {
    const resolved = resolvePlatformNavigation(STARVILLE_DEFAULT_CONFIGURATION, [
      ...superAdminPermissions,
    ]);
    expect(resolved.map(({ href }) => href)).toEqual([
      '/overview',
      '/operations',
      '/players',
      '/token-access',
      '/worlds',
      '/world-assets',
      '/game-content',
      '/world-audit',
      '/platform-settings',
    ]);
  });
});
