import { randomUUID } from 'node:crypto';

import { hasAdminPermission } from '@starville/admin-auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CopyWalletButton } from '../../../../components/copy-wallet-button';
import { PlayerActionDialog } from '../../../../components/player-action-dialog';
import { AdminApiError } from '../../../../lib/admin-api';
import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { loadAdminPlayer, loadAdminPlayerActivity } from '../../../../lib/player-operations/api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function formatDate(value: string | null): string {
  if (value === null) return 'None recorded';
  return `${new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value))} UTC`;
}

function shortWallet(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-6)}`;
}

function eventLabel(value: string): string {
  return value.replaceAll('.', ' ').replaceAll('_', ' ');
}

export default async function PlayerDetailPage(props: {
  readonly params: Promise<{ readonly playerId: string }>;
}) {
  const context = await requireAuthorizedAdmin('players.read');
  const { playerId } = await props.params;

  try {
    const [player, activity] = await Promise.all([
      loadAdminPlayer(playerId),
      hasAdminPermission(context, 'player_audit.read')
        ? loadAdminPlayerActivity(playerId)
        : Promise.resolve(undefined),
    ]);
    const canReadWallet = hasAdminPermission(context, 'wallets.read');
    const moderation = player.moderation;

    return (
      <main className="operations-page player-detail" aria-labelledby="player-title">
        <header className="operations-intro">
          <div>
            <Link className="back-link" href="/players">
              ← Player directory
            </Link>
            <p className="eyebrow">Player operations</p>
            <h1 id="player-title">{player.profile.displayName}</h1>
            <p>
              Review safe stored state and application-level controls. Nothing on this page can
              transfer, freeze, burn, mint, or otherwise modify blockchain assets.
            </p>
          </div>
          <span className={`state-chip state-chip--${moderation.status}`}>{moderation.status}</span>
        </header>

        <div className="detail-grid">
          <section className="detail-card" aria-labelledby="identity-title">
            <h2 id="identity-title">Identity</h2>
            <dl className="detail-list">
              <div>
                <dt>Profile ID</dt>
                <dd>
                  <code>{player.profile.id}</code>
                </dd>
              </div>
              <div>
                <dt>Wallet</dt>
                <dd className="wallet-value">
                  <code>
                    {canReadWallet && player.profile.walletAddress !== null
                      ? player.profile.walletAddress
                      : player.profile.walletAddress === null
                        ? 'Restricted'
                        : shortWallet(player.profile.walletAddress)}
                  </code>
                  {canReadWallet && player.profile.walletAddress !== null ? (
                    <CopyWalletButton walletAddress={player.profile.walletAddress} />
                  ) : null}
                </dd>
              </div>
              <div>
                <dt>Appearance</dt>
                <dd>{player.profile.appearancePreset}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDate(player.profile.createdAt)}</dd>
              </div>
              <div>
                <dt>Last entered</dt>
                <dd>{formatDate(player.profile.lastEnteredAt)}</dd>
              </div>
            </dl>
          </section>

          <section className="detail-card" aria-labelledby="state-title">
            <h2 id="state-title">Safe game state</h2>
            <p className="card-note">
              Resume convenience only; not reward or anti-cheat authority.
            </p>
            <dl className="detail-list">
              <div>
                <dt>Map</dt>
                <dd>Lantern Square</dd>
              </div>
              <div>
                <dt>Safe position</dt>
                <dd>
                  {player.profile.x}, {player.profile.y}
                </dd>
              </div>
              <div>
                <dt>Facing</dt>
                <dd>{player.profile.facingDirection}</dd>
              </div>
              <div>
                <dt>State version</dt>
                <dd>{player.profile.gameStateVersion}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatDate(player.profile.updatedAt)}</dd>
              </div>
            </dl>
          </section>

          <section className="detail-card" aria-labelledby="moderation-title">
            <h2 id="moderation-title">Moderation</h2>
            <dl className="detail-list">
              <div>
                <dt>Status</dt>
                <dd>{moderation.status}</dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>{moderation.version}</dd>
              </div>
              <div>
                <dt>Rename required</dt>
                <dd>{moderation.renameRequired ? 'Yes' : 'No'}</dd>
              </div>
              <div>
                <dt>Suspended</dt>
                <dd>{formatDate(moderation.suspendedAt)}</dd>
              </div>
              <div>
                <dt>Restored</dt>
                <dd>{formatDate(moderation.restoredAt)}</dd>
              </div>
              {hasAdminPermission(context, 'player_audit.read') && moderation.suspensionReason ? (
                <div>
                  <dt>Suspension reason</dt>
                  <dd>{moderation.suspensionReason}</dd>
                </div>
              ) : null}
              {hasAdminPermission(context, 'player_audit.read') && moderation.restorationReason ? (
                <div>
                  <dt>Restoration reason</dt>
                  <dd>{moderation.restorationReason}</dd>
                </div>
              ) : null}
              {hasAdminPermission(context, 'player_audit.read') && moderation.renameReason ? (
                <div>
                  <dt>Rename reason</dt>
                  <dd>{moderation.renameReason}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="detail-card" aria-labelledby="access-title">
            <h2 id="access-title">Starville access</h2>
            <dl className="detail-list">
              <div>
                <dt>Active sessions</dt>
                <dd>{player.access.activeSessions}</dd>
              </div>
              <div>
                <dt>Latest effective status</dt>
                <dd>{player.access.latestSessionStatus ?? 'No session'}</dd>
              </div>
              <div>
                <dt>Latest session created</dt>
                <dd>{formatDate(player.access.latestSessionAt)}</dd>
              </div>
            </dl>
            <p className="card-note">
              Active means unexpired and valid under the current token configuration—not “online.”
            </p>
          </section>
        </div>

        <section className="player-actions" aria-labelledby="actions-title">
          <div>
            <p className="eyebrow">Permission-aware controls</p>
            <h2 id="actions-title">Player actions</h2>
            <p>
              Every enabled action requires confirmation, a reason, current version, and database
              authorization.
            </p>
          </div>
          <div className="player-actions__buttons">
            {hasAdminPermission(context, 'players.suspend') && moderation.status === 'active' ? (
              <PlayerActionDialog
                action="suspend"
                buttonLabel="Suspend player"
                dangerous
                description="Game entry will be blocked and active Starville access sessions will be revoked. Wallet assets remain untouched."
                expectedVersion={moderation.version}
                idempotencyKey={randomUUID()}
                key={`suspend-${moderation.version}`}
                playerId={player.profile.id}
                playerName={player.profile.displayName}
                title="Suspend this player?"
                walletAddress={player.profile.walletAddress}
              />
            ) : null}
            {hasAdminPermission(context, 'players.suspend') && moderation.status === 'suspended' ? (
              <PlayerActionDialog
                action="restore"
                buttonLabel="Restore player"
                description="Application access will be restored, but no wallet session will be created. The player must authenticate again."
                expectedVersion={moderation.version}
                idempotencyKey={randomUUID()}
                key={`restore-${moderation.version}`}
                playerId={player.profile.id}
                playerName={player.profile.displayName}
                title="Restore this player?"
                walletAddress={player.profile.walletAddress}
              />
            ) : null}
            {hasAdminPermission(context, 'players.reset_position') ? (
              <PlayerActionDialog
                action="reset-position"
                buttonLabel="Reset to spawn"
                description="The stored resume point will be reset only to Lantern Square’s reviewed default spawn and current access sessions will be revoked so stale state cannot overwrite it. No coordinates are accepted from this browser, and no economy or inventory data changes."
                expectedVersion={moderation.version}
                idempotencyKey={randomUUID()}
                key={`reset-position-${moderation.version}`}
                playerId={player.profile.id}
                playerName={player.profile.displayName}
                title="Reset the safe position?"
                walletAddress={player.profile.walletAddress}
              />
            ) : null}
            {hasAdminPermission(context, 'players.require_rename') && !moderation.renameRequired ? (
              <PlayerActionDialog
                action="require-rename"
                buttonLabel="Require rename"
                dangerous
                description="Normal map entry will stop and active sessions will be revoked until the player chooses a valid replacement name. Staff cannot assign the name."
                expectedVersion={moderation.version}
                idempotencyKey={randomUUID()}
                key={`require-rename-${moderation.version}`}
                playerId={player.profile.id}
                playerName={player.profile.displayName}
                title="Require a new display name?"
                walletAddress={player.profile.walletAddress}
              />
            ) : null}
            {hasAdminPermission(context, 'players.manage_sessions') &&
            player.access.activeSessions > 0 ? (
              <PlayerActionDialog
                action="revoke-sessions"
                buttonLabel="Revoke sessions"
                dangerous
                description="Current Starville access sessions will stop, and the player must reconnect and sign again. The wallet and its token balance are not changed."
                expectedVersion={moderation.version}
                idempotencyKey={randomUUID()}
                key={`revoke-sessions-${moderation.version}`}
                playerId={player.profile.id}
                playerName={player.profile.displayName}
                title="Revoke active sessions?"
                walletAddress={player.profile.walletAddress}
              />
            ) : null}
          </div>
        </section>

        <section className="audit-section" aria-labelledby="audit-title">
          <div>
            <p className="eyebrow">Append-only history</p>
            <h2 id="audit-title">Player audit</h2>
          </div>
          {activity === undefined ? (
            <p>Your role cannot read player audit reasons.</p>
          ) : activity.items.length === 0 ? (
            <p>No player operations have been recorded.</p>
          ) : (
            <ol className="audit-list">
              {activity.items.map((event) => (
                <li key={event.id}>
                  <div>
                    <strong>{eventLabel(event.event)}</strong>
                    <span className={`state-chip state-chip--${event.outcome}`}>
                      {event.outcome}
                    </span>
                  </div>
                  <p>{event.reason ?? event.reasonCode ?? 'No free-form reason recorded.'}</p>
                  <small>
                    {formatDate(event.createdAt)} · Actor: {event.actorType}
                    {event.actorAdminUserId === null
                      ? ''
                      : ` · Administrator ${event.actorAdminUserId.slice(0, 8)}…`}
                  </small>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="audit-section" aria-labelledby="access-history-title">
          <div>
            <p className="eyebrow">Safe access history</p>
            <h2 id="access-history-title">Recent wallet-access events</h2>
          </div>
          {activity === undefined ? (
            <p>Your role cannot read player access history.</p>
          ) : activity.accessEvents.length === 0 ? (
            <p>No recent access events have been recorded for this player.</p>
          ) : (
            <ol className="audit-list">
              {activity.accessEvents.map((event) => (
                <li key={event.id}>
                  <div>
                    <strong>{eventLabel(event.event)}</strong>
                    <span className={`state-chip state-chip--${event.result}`}>{event.result}</span>
                  </div>
                  <p>{event.reasonCode ?? 'No denial or error reason recorded.'}</p>
                  <small>{formatDate(event.createdAt)}</small>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    );
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 404) notFound();
    return (
      <main className="operations-page" aria-labelledby="player-title">
        <h1 id="player-title">Player unavailable</h1>
        <section className="empty-state" role="alert">
          <p>The protected player record could not be loaded. No placeholder data is shown.</p>
          <Link className="button button--secondary" href="/players">
            Return to players
          </Link>
        </section>
      </main>
    );
  }
}
