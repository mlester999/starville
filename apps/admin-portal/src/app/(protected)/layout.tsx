import type { ReactNode } from 'react';

import { AdminBrand } from '../../components/admin-brand';
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
      {children}
    </div>
  );
}
