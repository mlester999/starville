import type { ReactNode } from 'react';
import { AdminBrand } from '../../components/admin-brand';
import { AdminNavigation } from '../../components/admin-navigation';
import type { AdminNavigationItem } from '../../components/admin-navigation-state';
import { SubmitButton } from '../../components/submit-button';
import { requireAuthorizedAdmin } from '../../lib/auth/authorization';
import { logoutAction } from '../actions/auth';

interface ProtectedLayoutProps {
  readonly children: ReactNode;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ProtectedLayout({ children }: ProtectedLayoutProps) {
  const context = await requireAuthorizedAdmin();
  const navigation: AdminNavigationItem[] = [];
  if (context.permissionKeys.includes('overview.read'))
    navigation.push({ href: '/overview', label: 'Overview', exact: true });
  if (context.permissionKeys.includes('operations.read'))
    navigation.push({ href: '/operations', label: 'Operations' });
  if (context.permissionKeys.includes('players.read'))
    navigation.push({ href: '/players', label: 'Players' });
  if (context.permissionKeys.includes('token_gate.read'))
    navigation.push({ href: '/token-access', label: 'Token Access' });
  if (context.permissionKeys.includes('maps.read'))
    navigation.push({ href: '/worlds', label: 'Worlds' });
  if (context.permissionKeys.includes('assets.read'))
    navigation.push({ href: '/world-assets', label: 'World Assets' });
  if (context.permissionKeys.includes('items.read'))
    navigation.push({ href: '/game-content', label: 'Game Content' });
  if (context.permissionKeys.includes('maps.audit_read'))
    navigation.push({ href: '/world-audit', label: 'World Audit' });

  return (
    <div className="portal-shell">
      <header className="portal-header">
        <AdminBrand compact />
        <div className="portal-header__account">
          <span className="account-name">{context.displayName}</span>
          <span className="account-role">{context.roleName}</span>
          <form action={logoutAction}>
            <SubmitButton variant="quiet" pendingLabel="Signing out…">
              Sign out
            </SubmitButton>
          </form>
        </div>
      </header>
      <AdminNavigation items={navigation} />
      {children}
    </div>
  );
}
