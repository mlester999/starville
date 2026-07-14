import type { CSSProperties, ReactNode } from 'react';
import { PLATFORM_FONT_REGISTRY } from '@starville/platform-configuration';

import { AdminAppShell } from '../../components/admin-app-shell';
import type { AdminNavigationItem } from '../../components/admin-navigation-state';
import { SubmitButton } from '../../components/submit-button';
import { requireAuthorizedAdmin } from '../../lib/auth/authorization';
import { parseAdminPublicConfig } from '../../lib/public-config';
import { resolvePlatformNavigation } from '../../lib/platform-configuration/navigation';
import { loadPublicPlatformConfiguration } from '../../lib/platform-configuration/runtime';
import { logoutAction } from '../actions/auth';

interface ProtectedLayoutProps {
  readonly children: ReactNode;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function environmentLabel(value: string | undefined): string | null {
  if (value === undefined || value.trim() === '') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'production' || normalized === 'prod') return 'Production';
  if (normalized === 'staging' || normalized === 'stage') return 'Staging';
  if (normalized === 'test' || normalized === 'testing') return 'Test';
  if (normalized === 'development' || normalized === 'dev') return 'Development';
  return value.trim().replace(/^\w/u, (character) => character.toUpperCase());
}

export default async function ProtectedLayout({ children }: ProtectedLayoutProps) {
  const context = await requireAuthorizedAdmin();
  const runtime = await loadPublicPlatformConfiguration();
  const configuration = runtime.configuration;
  const navigation: AdminNavigationItem[] = resolvePlatformNavigation(
    configuration,
    context.permissionKeys,
  );
  const publicConfig = parseAdminPublicConfig(process.env);

  const signOut = (
    <form action={logoutAction}>
      <SubmitButton variant="quiet" pendingLabel="Signing out…">
        Sign out
      </SubmitButton>
    </form>
  );

  return (
    <div
      className="portal-theme"
      style={
        {
          '--admin-canvas': configuration.theme.tokens.background,
          '--admin-surface': configuration.theme.tokens.surface,
          '--admin-surface-solid': configuration.theme.tokens.elevatedSurface,
          '--admin-text': configuration.theme.tokens.textPrimary,
          '--admin-text-muted': configuration.theme.tokens.textSecondary,
          '--admin-forest': configuration.theme.tokens.primaryAction,
          '--admin-action-text': configuration.theme.tokens.primaryActionText,
          '--admin-line': configuration.theme.tokens.border,
          '--admin-focus': configuration.theme.tokens.focusRing,
          '--admin-nav-bg': configuration.theme.tokens.navigationBackground,
          '--admin-nav-active': configuration.theme.tokens.navigationActive,
          '--starville-font-display':
            PLATFORM_FONT_REGISTRY[configuration.typography.display].stack,
          '--starville-font-sans': PLATFORM_FONT_REGISTRY[configuration.typography.body].stack,
        } as CSSProperties
      }
    >
      <AdminAppShell
        administrationName={configuration.branding.administrationName}
        brandMarkUrl={runtime.assetUrls.branding.brand_mark}
        collapsedByDefault={configuration.navigation.collapsedByDefault}
        displayName={context.displayName}
        environmentLabel={environmentLabel(publicConfig.environment)}
        gameName={configuration.branding.shortGameName.toUpperCase()}
        items={navigation}
        logoUrl={runtime.assetUrls.branding.brand_logo}
        roleName={context.roleName}
        signOut={signOut}
      >
        {children}
      </AdminAppShell>
    </div>
  );
}
