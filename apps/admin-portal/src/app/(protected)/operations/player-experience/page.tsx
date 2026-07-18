import { PlayerExperienceAdminDashboard } from '../../../../components/player-experience-admin-dashboard';
import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { loadAdminPlayerExperience } from '../../../../lib/player-experience-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PlayerExperiencePage({
  searchParams,
}: {
  readonly searchParams: Promise<{ search?: string; offset?: string; notice?: string }>;
}) {
  const query = await searchParams;
  const context = await requireAuthorizedAdmin('player_experience.inspect');
  const workspace = await loadAdminPlayerExperience(
    query.search ?? '',
    50,
    Number(query.offset ?? 0),
  );
  return (
    <PlayerExperienceAdminDashboard
      workspace={workspace}
      permissions={context.permissionKeys}
      {...(query.notice === undefined ? {} : { notice: query.notice })}
    />
  );
}
