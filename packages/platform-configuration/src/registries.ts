import type { AdminPermissionKey } from '@starville/admin-auth';

export const PLATFORM_KEY = 'starville' as const;

export const PLATFORM_FONT_REGISTRY = {
  system_display: {
    label: 'System display',
    stack:
      '"Avenir Next", Avenir, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  system_sans: {
    label: 'System sans',
    stack:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  system_mono: {
    label: 'System monospace',
    stack: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
} as const;

export type PlatformFontKey = keyof typeof PLATFORM_FONT_REGISTRY;

export const PLATFORM_THEME_PRESETS = {
  starville_twilight: {
    background: '#0d1a17',
    surface: '#172c27',
    elevatedSurface: '#203a34',
    textPrimary: '#f8f4e8',
    textSecondary: '#bdcbc2',
    primaryAction: '#f4c965',
    primaryActionText: '#302400',
    secondaryAction: '#73cbaa',
    border: '#38534b',
    success: '#7fd3a7',
    warning: '#f4c965',
    danger: '#ff938a',
    information: '#7fc8f8',
    focusRing: '#f4c965',
    navigationBackground: '#11231f',
    navigationActive: '#f4c965',
    loginPageOverlay: '#0d1a17',
    landingHeroOverlay: '#071916',
  },
  cozy_light: {
    background: '#f7f2e7',
    surface: '#fffdf7',
    elevatedSurface: '#ffffff',
    textPrimary: '#213c35',
    textSecondary: '#536b63',
    primaryAction: '#705200',
    primaryActionText: '#ffffff',
    secondaryAction: '#286c58',
    border: '#b9c9c1',
    success: '#176b49',
    warning: '#765500',
    danger: '#9e2e2b',
    information: '#155c82',
    focusRing: '#705200',
    navigationBackground: '#edf3ef',
    navigationActive: '#705200',
    loginPageOverlay: '#213c35',
    landingHeroOverlay: '#213c35',
  },
} as const;

export const PLATFORM_ICON_KEYS = [
  'overview',
  'operations',
  'players',
  'access',
  'world',
  'assets',
  'content',
  'audit',
  'settings',
] as const;
export type PlatformIconKey = (typeof PLATFORM_ICON_KEYS)[number];

export const PLATFORM_ROUTE_REGISTRY = {
  overview: { href: '/overview', permission: 'overview.read', module: 'operations' },
  operations: { href: '/operations', permission: 'operations.read', module: 'operations' },
  players: { href: '/players', permission: 'players.read', module: 'players' },
  token_access: { href: '/token-access', permission: 'token_gate.read', module: 'blockchain' },
  worlds: { href: '/worlds', permission: 'maps.read', module: 'world_management' },
  world_assets: { href: '/world-assets', permission: 'assets.read', module: 'world_assets' },
  game_content: { href: '/game-content', permission: 'items.read', module: 'content_management' },
  world_audit: { href: '/world-audit', permission: 'maps.audit_read', module: 'audit' },
  platform_settings: {
    href: '/platform-settings',
    permission: 'platform_configuration.read',
    module: 'platform_configuration',
  },
} as const satisfies Readonly<
  Record<
    string,
    { readonly href: string; readonly permission: AdminPermissionKey; readonly module: string }
  >
>;

export type PlatformRouteKey = keyof typeof PLATFORM_ROUTE_REGISTRY;

export const PLATFORM_MODULE_REGISTRY = {
  authentication: { label: 'Authentication', required: true, dependencies: [] },
  administrator_authorization: {
    label: 'Administrator authorization',
    required: true,
    dependencies: ['authentication'],
  },
  audit: {
    label: 'Audit',
    required: true,
    dependencies: ['administrator_authorization'],
  },
  security_settings: {
    label: 'Security settings',
    required: true,
    dependencies: ['administrator_authorization'],
  },
  platform_configuration: {
    label: 'Platform configuration',
    required: true,
    dependencies: ['administrator_authorization', 'audit'],
  },
  operations: { label: 'Operations', required: false, dependencies: ['audit'] },
  players: { label: 'Players', required: false, dependencies: ['administrator_authorization'] },
  world_management: { label: 'World management', required: false, dependencies: ['audit'] },
  world_assets: {
    label: 'World assets',
    required: false,
    dependencies: ['world_management'],
  },
  cozy_gameplay: { label: 'Cozy gameplay', required: false, dependencies: ['players'] },
  content_management: {
    label: 'Content management',
    required: false,
    dependencies: ['audit'],
  },
  economy: { label: 'Economy', required: false, dependencies: ['players', 'audit'] },
  blockchain: { label: 'Blockchain', required: false, dependencies: ['security_settings'] },
  support: { label: 'Support', required: false, dependencies: ['players'] },
  reporting: { label: 'Reporting', required: false, dependencies: ['audit'] },
} as const;

export type PlatformModuleKey = keyof typeof PLATFORM_MODULE_REGISTRY;

export const BRANDING_ASSET_PROFILES = [
  'brand_logo',
  'brand_mark',
  'favicon',
  'admin_login_background',
  'landing_hero_background',
  'social_share_image',
] as const;
export type BrandingAssetProfile = (typeof BRANDING_ASSET_PROFILES)[number];
