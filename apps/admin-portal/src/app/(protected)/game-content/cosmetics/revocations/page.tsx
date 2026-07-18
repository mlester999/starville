import { CosmeticsPageHeader } from '../../../../../components/cosmetics-admin-ui';
import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';
import { loadAvatarCatalog } from '../../../../../lib/avatar-api';
import { loadAdminPlayers } from '../../../../../lib/player-operations/api';
import { revokeCosmeticAction } from '../../../../actions/cosmetics';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CosmeticRevocationsPage() {
  await requireAuthorizedAdmin('cosmetics.revoke');
  const [players, cosmetics] = await Promise.all([
    loadAdminPlayers({
      page: 1,
      pageSize: 50,
      search: '',
      status: 'all',
      rename: 'all',
      mapId: 'all',
      sort: 'display_name',
      direction: 'asc',
    }),
    loadAvatarCatalog({ page: 1, pageSize: 50 }),
  ]);

  return (
    <main className="avatar-page" aria-labelledby="cosmetics-page-title">
      <CosmeticsPageHeader
        description="Revoke one owned cosmetic for a legitimate operational reason. The server preserves an immutable receipt, removes affected equipped references, and applies a valid cosmetic-only fallback without touching inventory or DUST."
        eyebrow="Audited safe fallback"
        title="Cosmetic revocation"
      />
      <form
        action={revokeCosmeticAction}
        className="avatar-structured-form cosmetics-entitlement-form"
      >
        <label>
          Player
          <select name="playerProfileId" required>
            <option value="">Select a player</option>
            {players.items.map((player) => (
              <option key={player.id} value={player.id}>
                {player.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cosmetic definition
          <select name="cosmeticKey" required>
            <option value="">Select a cosmetic</option>
            {cosmetics.items.map((cosmetic) => (
              <option key={cosmetic.definitionId} value={cosmetic.stableKey}>
                {cosmetic.publicName} · {cosmetic.publicationState}
              </option>
            ))}
          </select>
        </label>
        <label>
          Expected state
          <input name="expectedStateDisplay" readOnly value="Owned" />
        </label>
        <label>
          Reason category
          <select name="reasonCategory" required>
            <option value="content_retired">Content retired</option>
            <option value="mistaken_administrative_grant">Mistaken administrative grant</option>
            <option value="policy_violation">Policy violation</option>
            <option value="asset_rights_issue">Asset rights issue</option>
            <option value="technical_incompatibility">Technical incompatibility</option>
            <option value="migration_correction">Migration correction</option>
          </select>
        </label>
        <label className="avatar-form-span">
          Required explanation
          <textarea maxLength={500} minLength={12} name="explanation" required rows={4} />
        </label>
        <button type="submit">Revoke and apply safe fallback</button>
      </form>
      <p className="avatar-authority-note">
        Revocation never removes ordinary inventory, DUST, wallet access, or saved loadout history.
      </p>
    </main>
  );
}
