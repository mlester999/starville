import { HomeVisitsAdminDashboard } from '../../../../../components/home-visits-admin-dashboard';
import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';
import { loadAdminHomeVisits } from '../../../../../lib/home-visits-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HomeVisitsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ search?: string; offset?: string; notice?: string }>;
}) {
  const query = await searchParams;
  const context = await requireAuthorizedAdmin('home_visits.inspect');
  const workspace = await loadAdminHomeVisits(query.search ?? '', 50, Number(query.offset ?? 0));
  return (
    <HomeVisitsAdminDashboard
      workspace={workspace}
      permissions={context.permissionKeys}
      {...(query.notice === undefined ? {} : { notice: query.notice })}
    />
  );
}
