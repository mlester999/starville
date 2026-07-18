import { HousingAdminDashboard } from '../../../../components/housing-admin-dashboard';
import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { loadAdminHousing } from '../../../../lib/housing-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export default async function HousingPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    wallet?: string;
    search?: string;
    notice?: string;
    offset?: string;
  }>;
}) {
  const query = await searchParams;
  const context = await requireAuthorizedAdmin(
    query.wallet === undefined ? 'housing.furniture.inspect' : 'housing.player_homes.inspect',
  );
  const workspace = await loadAdminHousing(
    query.wallet ?? null,
    query.search ?? '',
    50,
    Number(query.offset ?? 0),
  );
  return (
    <HousingAdminDashboard
      workspace={workspace}
      permissions={context.permissionKeys}
      {...(query.notice === undefined ? {} : { notice: query.notice })}
    />
  );
}
