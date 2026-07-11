import { hasAdminPermission } from '@starville/admin-auth';

import { TokenGateForm } from '../../../components/token-gate-form';
import { requireAuthorizedAdmin } from '../../../lib/auth/authorization';
import { AdminTokenGateApiError, loadAdminTokenGateConfig } from '../../../lib/token-access/api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TokenAccessPage() {
  const context = await requireAuthorizedAdmin('token_gate.read');

  try {
    const config = await loadAdminTokenGateConfig();

    return (
      <main className="token-access-page" aria-labelledby="token-access-title">
        <header className="token-access-intro">
          <div>
            <p className="eyebrow">Player entry control</p>
            <h1 id="token-access-title">Token Access</h1>
            <p>
              Review the real Solana mint requirement and manage the short-lived sessions that
              protect entry to Starville.
            </p>
          </div>
          <span className="permission-badge">
            {hasAdminPermission(context, 'token_gate.configure') ? 'Configure access' : 'Read only'}
          </span>
        </header>

        <TokenGateForm
          key={config.configVersion}
          canConfigure={hasAdminPermission(context, 'token_gate.configure')}
          config={config}
        />
      </main>
    );
  } catch (error) {
    const isForbidden = error instanceof AdminTokenGateApiError && error.status === 403;

    return (
      <main className="token-access-page" aria-labelledby="token-access-title">
        <header className="token-access-intro">
          <div>
            <p className="eyebrow">Player entry control</p>
            <h1 id="token-access-title">Token Access</h1>
          </div>
        </header>
        <section className="token-access-unavailable" role="alert">
          <span aria-hidden="true">◇</span>
          <div>
            <h2>{isForbidden ? 'Permission required' : 'Configuration unavailable'}</h2>
            <p>
              {isForbidden
                ? 'Your current administrator session cannot read the token-gate configuration.'
                : 'The trusted token-access service could not be reached. No placeholder configuration is shown.'}
            </p>
            <a className="button button--secondary" href="/token-access">
              Try again
            </a>
          </div>
        </section>
      </main>
    );
  }
}
