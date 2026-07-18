import { randomUUID } from 'node:crypto';

import { hasAdminPermission } from '@starville/admin-auth';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CopyWalletButton } from '../../../../components/copy-wallet-button';
import { PlayerActionDialog } from '../../../../components/player-action-dialog';
import { PremiumSelect } from '../../../../components/premium-select';
import { AdminApiError } from '../../../../lib/admin-api';
import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { loadAdminPlayer, loadAdminPlayerActivity } from '../../../../lib/player-operations/api';
import {
  loadAdminPlayerCozy,
  loadAdminPlayerEconomy,
  loadAdminPlayerFarming,
  loadAdminPlayerInventory,
} from '../../../../lib/cozy-gameplay/api';

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
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const context = await requireAuthorizedAdmin('players.read');
  const { playerId } = await props.params;
  const searchParams = await props.searchParams;
  const rawAccessPage = Number(searchParams['accessPage']);
  const rawAccessPageSize = Number(searchParams['accessPageSize']);
  const accessPage = Number.isInteger(rawAccessPage) && rawAccessPage > 0 ? rawAccessPage : 1;
  const accessPageSize = ([10, 50, 100] as const).find((size) => size === rawAccessPageSize) ?? 10;
  const rawCozyPageSize = Number(searchParams['cozyPageSize']);
  const cozyPageSize = ([10, 50, 100] as const).find((size) => size === rawCozyPageSize) ?? 10;
  const rawEconomyPage = Number(searchParams['economyPage']);
  const rawInventoryPage = Number(searchParams['inventoryPage']);
  const economyPage = Number.isInteger(rawEconomyPage) && rawEconomyPage > 0 ? rawEconomyPage : 1;
  const inventoryPage =
    Number.isInteger(rawInventoryPage) && rawInventoryPage > 0 ? rawInventoryPage : 1;

  try {
    const [player, activity, economy, inventory, cozy, farming] = await Promise.all([
      loadAdminPlayer(playerId),
      hasAdminPermission(context, 'player_audit.read')
        ? loadAdminPlayerActivity(playerId, { accessPage, accessPageSize })
        : Promise.resolve(undefined),
      hasAdminPermission(context, 'economy.read')
        ? loadAdminPlayerEconomy(playerId, { page: economyPage, pageSize: cozyPageSize })
        : Promise.resolve(undefined),
      hasAdminPermission(context, 'inventories.read')
        ? loadAdminPlayerInventory(playerId, { page: inventoryPage, pageSize: cozyPageSize })
        : Promise.resolve(undefined),
      hasAdminPermission(context, 'cozy_gameplay.read')
        ? loadAdminPlayerCozy(playerId)
        : Promise.resolve(undefined),
      hasAdminPermission(context, 'farming.player_read')
        ? loadAdminPlayerFarming(playerId)
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

        {hasAdminPermission(context, 'progression.players.inspect') &&
        player.profile.walletAddress !== null ? (
          <nav className="avatar-workflow-links detail-card" aria-label="Player progression tools">
            <Link
              href={`/game-content/progression?wallet=${encodeURIComponent(player.profile.walletAddress)}`}
            >
              Inspect authoritative progression, quests, rewards, and reconciliation
            </Link>
          </nav>
        ) : null}

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
                <dd>{player.profile.mapId}</dd>
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

        {economy !== undefined ||
        inventory !== undefined ||
        cozy !== undefined ||
        farming !== undefined ? (
          <section className="cozy-admin-section" aria-labelledby="cozy-state-title">
            <div className="cozy-admin-section__heading">
              <div>
                <p className="eyebrow">Read-only cozy systems</p>
                <h2 id="cozy-state-title">Gameplay state</h2>
              </div>
              <div>
                <p>Operational visibility only. No DUST or inventory adjustment is available.</p>
                <form className="cozy-page-size" method="get">
                  <input name="economyPage" type="hidden" value="1" />
                  <input name="inventoryPage" type="hidden" value="1" />
                  <PremiumSelect
                    aria-label="Cozy history entries per page"
                    defaultValue={String(cozyPageSize)}
                    name="cozyPageSize"
                    options={[
                      { value: '10', label: '10 entries' },
                      { value: '50', label: '50 entries' },
                      { value: '100', label: '100 entries' },
                    ]}
                    size="compact"
                  />
                  <button className="button button--secondary" type="submit">
                    Apply
                  </button>
                </form>
              </div>
            </div>
            <div className="detail-grid">
              {economy !== undefined ? (
                <section className="detail-card" aria-labelledby="dust-title">
                  <h3 id="dust-title">DUST</h3>
                  {economy.initialized && economy.account !== null ? (
                    <>
                      <p className="cozy-balance">
                        {economy.account.balance.toLocaleString()} DUST
                      </p>
                      <p className="card-note">
                        Off-chain soft currency. Not $STAR and not transferable.
                      </p>
                      <ol className="cozy-compact-list">
                        {economy.items.map((entry) => (
                          <li key={entry.id}>
                            <span>{entry.reason.replaceAll('_', ' ')}</span>
                            <strong>
                              {entry.delta > 0 ? '+' : ''}
                              {entry.delta} DUST
                            </strong>
                            <small>{formatDate(entry.createdAt)}</small>
                          </li>
                        ))}
                      </ol>
                      <div className="cozy-pagination">
                        {economyPage > 1 ? (
                          <Link
                            href={`?economyPage=${economyPage - 1}&inventoryPage=${inventoryPage}&cozyPageSize=${cozyPageSize}`}
                          >
                            Previous
                          </Link>
                        ) : (
                          <span />
                        )}
                        <span>
                          Page {economy.pagination.page} of{' '}
                          {Math.max(1, economy.pagination.totalPages)}
                        </span>
                        {economyPage < economy.pagination.totalPages ? (
                          <Link
                            href={`?economyPage=${economyPage + 1}&inventoryPage=${inventoryPage}&cozyPageSize=${cozyPageSize}`}
                          >
                            Next
                          </Link>
                        ) : (
                          <span />
                        )}
                      </div>
                    </>
                  ) : (
                    <p>Cozy gameplay has not been initialized for this player.</p>
                  )}
                </section>
              ) : null}

              {inventory !== undefined ? (
                <section className="detail-card" aria-labelledby="inventory-title">
                  <h3 id="inventory-title">Inventory</h3>
                  {inventory.initialized && inventory.inventory !== null ? (
                    <>
                      <p className="cozy-balance">
                        {inventory.inventory.capacity.usedSlots} /{' '}
                        {inventory.inventory.capacity.capacity} slots
                      </p>
                      <ul className="cozy-definition-list">
                        {inventory.inventory.stacks.map((stack) => (
                          <li key={stack.id}>
                            <strong>{stack.item.name}</strong>
                            <span>
                              × {stack.quantity} · {stack.item.category.replaceAll('_', ' ')}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="card-note">Recent movements: {inventory.pagination.total}</p>
                      <ol className="cozy-compact-list">
                        {inventory.items.map((entry) => (
                          <li key={entry.id}>
                            <span>
                              {entry.itemSlug} · {entry.reason.replaceAll('_', ' ')}
                            </span>
                            <strong>
                              {entry.delta > 0 ? '+' : ''}
                              {entry.delta}
                            </strong>
                            <small>{formatDate(entry.createdAt)}</small>
                          </li>
                        ))}
                      </ol>
                      <div className="cozy-pagination">
                        {inventoryPage > 1 ? (
                          <Link
                            href={`?economyPage=${economyPage}&inventoryPage=${inventoryPage - 1}&cozyPageSize=${cozyPageSize}`}
                          >
                            Previous
                          </Link>
                        ) : (
                          <span />
                        )}
                        <span>
                          Page {inventory.pagination.page} of{' '}
                          {Math.max(1, inventory.pagination.totalPages)}
                        </span>
                        {inventoryPage < inventory.pagination.totalPages ? (
                          <Link
                            href={`?economyPage=${economyPage}&inventoryPage=${inventoryPage + 1}&cozyPageSize=${cozyPageSize}`}
                          >
                            Next
                          </Link>
                        ) : (
                          <span />
                        )}
                      </div>
                    </>
                  ) : (
                    <p>Cozy gameplay has not been initialized for this player.</p>
                  )}
                </section>
              ) : null}

              {cozy !== undefined ? (
                <section className="detail-card" aria-labelledby="farm-home-title">
                  <h3 id="farm-home-title">Farm and home</h3>
                  <dl className="detail-list">
                    <div>
                      <dt>Farm plots</dt>
                      <dd>{cozy.farm.total}</dd>
                    </div>
                    <div>
                      <dt>Occupied</dt>
                      <dd>{cozy.farm.occupied}</dd>
                    </div>
                    <div>
                      <dt>Ready</dt>
                      <dd>{cozy.farm.ready}</dd>
                    </div>
                    <div>
                      <dt>Home</dt>
                      <dd>{cozy.home?.templateName ?? 'Not initialized'}</dd>
                    </div>
                    <div>
                      <dt>Placed furniture</dt>
                      <dd>{cozy.home?.placedFurnitureCount ?? 0}</dd>
                    </div>
                    <div>
                      <dt>Location</dt>
                      <dd>{cozy.home?.insideHome ? 'Private home' : 'Public world'}</dd>
                    </div>
                    <div>
                      <dt>Last update</dt>
                      <dd>{formatDate(cozy.lastGameplayUpdate)}</dd>
                    </div>
                  </dl>
                </section>
              ) : null}

              {farming !== undefined ? (
                <section className="detail-card" aria-labelledby="personal-farming-title">
                  <h3 id="personal-farming-title">Personal-plot farming</h3>
                  {!farming.initialized || farming.view === null ? (
                    <p>No personal plot has been provisioned for this player.</p>
                  ) : (
                    <>
                      <dl className="detail-list">
                        <div>
                          <dt>Plot lifecycle</dt>
                          <dd>{farming.view.plot.lifecycle.replaceAll('_', ' ')}</dd>
                        </div>
                        <div>
                          <dt>Private instance</dt>
                          <dd>
                            <code>{farming.view.plot.instanceKey}</code>
                          </dd>
                        </div>
                        <div>
                          <dt>Farm tiles</dt>
                          <dd>{farming.view.plot.tiles.length}</dd>
                        </div>
                        <div>
                          <dt>Active crops</dt>
                          <dd>
                            {farming.view.plot.tiles.filter((tile) => tile.crop !== null).length}
                          </dd>
                        </div>
                        <div>
                          <dt>Starter quest</dt>
                          <dd>{farming.view.quest.status.replaceAll('_', ' ')}</dd>
                        </div>
                        <div>
                          <dt>Last farming action</dt>
                          <dd>{formatDate(farming.lastFarmingAction ?? null)}</dd>
                        </div>
                        <div>
                          <dt>Pending reconciliation</dt>
                          <dd>{farming.pendingReconciliationCount ?? 0}</dd>
                        </div>
                        <div>
                          <dt>DUST receipt</dt>
                          <dd>{farming.view.quest.rewardReceiptId ?? 'Not settled'}</dd>
                        </div>
                      </dl>
                      <ul className="cozy-definition-list">
                        {farming.view.plot.tiles.map((tile) => (
                          <li key={tile.id}>
                            <strong>
                              Tile {tile.slot}: {tile.state}
                            </strong>
                            <span>
                              {tile.crop === null
                                ? 'No crop'
                                : `${tile.crop.snapshot.cropName} · ${Math.round(tile.crop.growthProgress * 100)}% · stage ${tile.crop.growthStage}`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </section>
              ) : null}
            </div>
          </section>
        ) : null}

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
                severity="critical"
                typedConfirmation="SUSPEND"
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
                severity="caution"
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
                severity="caution"
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
                severity="caution"
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
            {hasAdminPermission(context, 'players.rename') ? (
              <PlayerActionDialog
                action="rename"
                buttonLabel="Rename Player"
                description="The canonical display name will change immediately and any rename-required state will clear. Wallet identity, access eligibility, position, progress, and moderation status are preserved."
                expectedVersion={moderation.version}
                idempotencyKey={randomUUID()}
                key={`rename-${moderation.version}`}
                newNameInput
                playerId={player.profile.id}
                playerName={player.profile.displayName}
                severity="caution"
                title="Rename this player?"
                walletAddress={player.profile.walletAddress}
              />
            ) : null}
            {hasAdminPermission(context, 'players.manage_sessions') &&
            player.access.activeSessions > 0 ? (
              <PlayerActionDialog
                action="revoke-sessions"
                buttonLabel="Revoke sessions"
                dangerous
                severity="critical"
                typedConfirmation="REVOKE"
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
            <>
              <form className="access-pagination-size" method="get">
                <input name="accessPage" type="hidden" value="1" />
                <label>
                  Events per page
                  <PremiumSelect
                    aria-label="Events per page"
                    defaultValue={String(activity.accessPageSize)}
                    name="accessPageSize"
                    options={[
                      { value: '10', label: '10 per page' },
                      { value: '50', label: '50 per page' },
                      { value: '100', label: '100 per page' },
                    ]}
                    size="compact"
                  />
                </label>
                <button className="button button--secondary" type="submit">
                  Apply
                </button>
              </form>
              <p className="pagination-summary">
                Showing {(activity.accessPage - 1) * activity.accessPageSize + 1}–
                {Math.min(activity.accessPage * activity.accessPageSize, activity.accessTotal)} of{' '}
                {activity.accessTotal} events · Page {activity.accessPage} of{' '}
                {Math.max(1, activity.accessTotalPages)}
              </p>
              <ol className="audit-list audit-list--compact">
                {activity.accessEvents.map((event) => (
                  <li key={event.id}>
                    <div>
                      <strong>{eventLabel(event.event)}</strong>
                      <span className={`state-chip state-chip--${event.result}`}>
                        {event.result}
                      </span>
                    </div>
                    <p>{event.reasonCode ?? 'No denial or error reason recorded.'}</p>
                    <small>{formatDate(event.createdAt)}</small>
                  </li>
                ))}
              </ol>
              <nav className="pagination" aria-label="Safe access history pages">
                {activity.accessPage <= 1 ? (
                  <span aria-disabled="true" className="is-disabled">
                    Previous
                  </span>
                ) : (
                  <Link
                    href={`?accessPage=${activity.accessPage - 1}&accessPageSize=${activity.accessPageSize}`}
                  >
                    Previous
                  </Link>
                )}
                <span>
                  Page {activity.accessPage} of {Math.max(1, activity.accessTotalPages)}
                </span>
                {activity.accessPage >= activity.accessTotalPages ? (
                  <span aria-disabled="true" className="is-disabled">
                    Next
                  </span>
                ) : (
                  <Link
                    href={`?accessPage=${activity.accessPage + 1}&accessPageSize=${activity.accessPageSize}`}
                  >
                    Next
                  </Link>
                )}
              </nav>
            </>
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
