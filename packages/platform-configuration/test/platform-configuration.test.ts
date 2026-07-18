import { describe, expect, it } from 'vitest';

import {
  PLATFORM_MODULE_REGISTRY,
  PLATFORM_ROUTE_REGISTRY,
  STARVILLE_DEFAULT_CONFIGURATION,
  contrastRatio,
  isModuleEnabled,
  moduleDependencyCycles,
  platformConfigurationSchema,
  validatePlatformConfiguration,
} from '../src';

const copy = () => structuredClone(STARVILLE_DEFAULT_CONFIGURATION);

describe('platform configuration', () => {
  it('accepts the complete Starville presentation defaults', () => {
    expect(platformConfigurationSchema.parse(copy())).toEqual(STARVILLE_DEFAULT_CONFIGURATION);
    expect(validatePlatformConfiguration(copy()).valid).toBe(true);
  });

  it.each(['<script>alert(1)</script>', '<style>body{display:none}</style>', '<b>unsafe</b>'])(
    'rejects markup and arbitrary code in structured copy: %s',
    (unsafe) => {
      const value = copy();
      value.branding.tagline = unsafe;
      expect(validatePlatformConfiguration(value).valid).toBe(false);
    },
  );

  it.each(['javascript:alert(1)', 'http://insecure.example', '//example.com'])(
    'rejects unsafe URLs: %s',
    (url) => {
      const value = copy();
      value.branding.documentationUrl = url;
      expect(validatePlatformConfiguration(value).valid).toBe(false);
    },
  );

  it('rejects unknown fonts, routes, icons, and modules', () => {
    const original = copy();
    const values: unknown[] = [
      { ...original, typography: { ...original.typography, body: 'remote_font' } },
      {
        ...original,
        navigation: {
          ...original.navigation,
          items: [{ ...original.navigation.items[0], routeKey: '/arbitrary' }],
        },
      },
      {
        ...original,
        navigation: {
          ...original.navigation,
          items: [{ ...original.navigation.items[0], icon: '<svg />' }],
        },
      },
      {
        ...original,
        modules: [...original.modules, { key: 'unknown', enabled: true, label: 'Unknown' }],
      },
    ];
    for (const value of values) {
      expect(platformConfigurationSchema.safeParse(value).success).toBe(false);
    }
  });

  it('prevents required module disabling and enforces dependencies', () => {
    const required = copy();
    required.modules.find(({ key }) => key === 'audit')!.enabled = false;
    expect(validatePlatformConfiguration(required).findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'REQUIRED_MODULE_DISABLED' })]),
    );

    const dependency = copy();
    dependency.modules.find(({ key }) => key === 'world_management')!.enabled = false;
    expect(validatePlatformConfiguration(dependency).findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'MODULE_DEPENDENCY_DISABLED' })]),
    );
  });

  it('detects trusted registry cycles and duplicate presentation ordering', () => {
    expect(
      moduleDependencyCycles({
        first: { dependencies: ['second'] },
        second: { dependencies: ['first'] },
      }),
    ).not.toHaveLength(0);
    const value = copy();
    value.landing.sections[1]!.order = value.landing.sections[0]!.order;
    value.navigation.items[1]!.order = value.navigation.items[0]!.order;
    expect(validatePlatformConfiguration(value).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'LANDING_SECTION_ORDER_DUPLICATE' }),
        expect.objectContaining({ code: 'NAVIGATION_ORDER_DUPLICATE' }),
      ]),
    );
  });

  it('detects inaccessible contrast and reports text results', () => {
    const value = copy();
    value.theme.tokens.textPrimary = '#0d1a17';
    const result = validatePlatformConfiguration(value);
    expect(result.valid).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'TEXT_BACKGROUND_CONTRAST',
          level: 'blocking_error',
        }),
      ]),
    );
    expect(contrastRatio('#ffffff', '#000000')).toBe(21);
  });

  it('keeps module visibility separate from permission-bearing routes', () => {
    const configuration = copy();
    configuration.modules.find(({ key }) => key === 'world_assets')!.enabled = false;
    expect(isModuleEnabled(configuration, 'world_assets')).toBe(false);
    expect(PLATFORM_ROUTE_REGISTRY.world_assets.permission).toBe('assets.read');
    expect(PLATFORM_MODULE_REGISTRY.world_assets.dependencies).toEqual(['world_management']);
  });

  it('keeps additive social modules available for legacy published configurations', () => {
    const legacy = copy();
    legacy.modules = legacy.modules.filter(
      ({ key }) => key !== 'social_graph' && key !== 'cooperative_activities',
    );
    expect(isModuleEnabled(legacy, 'social_graph')).toBe(true);
    expect(isModuleEnabled(legacy, 'cooperative_activities')).toBe(true);
    expect(validatePlatformConfiguration(legacy).valid).toBe(false);
  });

  it('keeps additive off-chain economy modules available without enabling future $STAR utility', () => {
    const legacy = copy();
    legacy.modules = legacy.modules.filter(
      ({ key }) =>
        key !== 'offchain_economy' && key !== 'economy_simulation' && key !== 'star_utility',
    );
    expect(isModuleEnabled(legacy, 'offchain_economy')).toBe(true);
    expect(isModuleEnabled(legacy, 'economy_simulation')).toBe(true);
    expect(isModuleEnabled(legacy, 'star_utility')).toBe(false);
    expect(
      STARVILLE_DEFAULT_CONFIGURATION.modules.find(({ key }) => key === 'star_utility')?.enabled,
    ).toBe(false);
  });

  it('keeps additive avatar customization safe for legacy configuration and permission-bound routes', () => {
    const legacy = copy();
    legacy.modules = legacy.modules.filter(({ key }) => key !== 'avatar_customization');
    expect(isModuleEnabled(legacy, 'avatar_customization')).toBe(true);
    expect(PLATFORM_ROUTE_REGISTRY.avatar_content).toEqual({
      href: '/game-content/avatars',
      permission: 'avatar_content.read',
      module: 'avatar_customization',
    });
    expect(PLATFORM_MODULE_REGISTRY.avatar_customization.dependencies).toEqual([
      'players',
      'world_assets',
      'content_management',
      'operations',
      'audit',
    ]);
    expect(
      STARVILLE_DEFAULT_CONFIGURATION.modules.find(({ key }) => key === 'avatar_customization')
        ?.enabled,
    ).toBe(true);
  });
});
