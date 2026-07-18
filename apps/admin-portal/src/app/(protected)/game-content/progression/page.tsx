import { ProgressionAdminDashboard } from '../../../../components/progression-admin-dashboard';
import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { loadAdminProgression } from '../../../../lib/progression-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ProgressionPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ wallet?: string; search?: string; notice?: string }>;
}) {
  const context = await requireAuthorizedAdmin('progression.skills.inspect');
  const query = await searchParams;
  const workspace = await loadAdminProgression(query.wallet ?? null, query.search ?? '');
  return (
    <ProgressionAdminDashboard
      permissions={context.permissionKeys}
      workspace={workspace}
      {...(query.notice === undefined ? {} : { notice: query.notice })}
    />
  );
}
