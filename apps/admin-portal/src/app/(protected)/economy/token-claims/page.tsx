import { EconomyPageHeader } from '../../../../components/economy-admin-ui';
import { TokenClaimArchitectureDashboard } from '../../../../components/token-claim-architecture-dashboard';
import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TokenClaimsArchitecturePage() {
  await requireAuthorizedAdmin('economy.read');

  return (
    <main
      className="economy-page token-claim-architecture-page"
      aria-labelledby="economy-page-title"
    >
      <EconomyPageHeader
        description="Review a disabled, offline security architecture for a possible future token-claim system. This workspace cannot create eligibility, connect a treasury, sign, submit, publish, or transfer anything."
        eyebrow="Administrator-only architecture"
        title="Token claim security"
      />
      <TokenClaimArchitectureDashboard />
    </main>
  );
}
