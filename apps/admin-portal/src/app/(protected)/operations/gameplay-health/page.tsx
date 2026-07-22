import {
  PHASE13A_GAMEPLAY_CAPABILITIES,
  summarizePhase13aGameplayHealth,
} from '@starville/player-experience';
import Link from 'next/link';

import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function GameplayHealthPage() {
  await requireAuthorizedAdmin('operations.read');
  const health = summarizePhase13aGameplayHealth();
  const disconnected = PHASE13A_GAMEPLAY_CAPABILITIES.filter(
    ({ status }) => status === 'disconnected' || status === 'blocked',
  );
  const ownerPending = PHASE13A_GAMEPLAY_CAPABILITIES.filter(
    ({ ownerAcceptance }) => ownerAcceptance === 'pending',
  );

  const healthChecks = [
    [
      'Objectives',
      'Canonical',
      'Onboarding, Daily Rhythm, and progression projections reconcile from server evidence.',
    ],
    [
      'Settlement',
      health.settlementHealth,
      'Exact-once integration fixtures cover retries, timeout, reconnect, concurrency, and changed payloads.',
    ],
    [
      'DUST reconciliation',
      health.dustReconciliation,
      'Immutable ledger and account versions remain authoritative.',
    ],
    [
      'Inventory settlement',
      health.inventorySettlement,
      'Mutation receipts and state versions remain authoritative.',
    ],
    ['Farming', 'Canonical', 'Plot, crop, inventory, objective, and XP transitions are linked.'],
    ['Cooking', 'Canonical', 'Job start and collection settle ingredients/output once.'],
    ['Crafting', 'Canonical', 'Job start and collection settle ingredients/output once.'],
    [
      'General Store',
      'Canonical',
      'Catalog, stock, limits, inventory, DUST, and receipts settle atomically.',
    ],
    [
      'Housing',
      'Canonical',
      'Layout, storage, furniture, and upgrades use revisions and receipts.',
    ],
    [
      'Home visits',
      'Local integration evidence',
      'Hosted owner-plus-ten and network validation remain Phase 13B gates.',
    ],
    [
      'Social',
      'Local integration evidence',
      'Friends, parties, chat, gifts, and trades are wired; abuse/contention validation remains deferred.',
    ],
    [
      'Realtime',
      'Local integration evidence',
      'Reconnect snapshots are versioned; hosted interruption/load validation remains deferred.',
    ],
    [
      'Workers',
      health.workerStatus,
      'Reconciliation and cleanup workers are present; hosted contention is not claimed.',
    ],
  ] as const;

  return (
    <main className="operations-page" aria-labelledby="gameplay-health-title">
      <header className="operations-intro">
        <div>
          <p className="eyebrow">Phase 13A · read-only local evidence</p>
          <h1 id="gameplay-health-title">Gameplay Health</h1>
          <p>
            Repository-backed integration evidence for current player journeys. This page contains
            no player records, hosted health claims, mutation controls, or owner-acceptance
            controls.
          </p>
        </div>
        <span className="permission-badge">Local repository evidence</span>
      </header>

      <p>
        <Link className="button button--secondary" href="/operations">
          Back to Operations
        </Link>
      </p>

      <section aria-labelledby="gameplay-health-summary">
        <h2 id="gameplay-health-summary">Integration summary</h2>
        <dl className="metric-grid">
          <div className="metric-card">
            <dt>Audited capabilities</dt>
            <dd>{health.capabilities}</dd>
            <dd className="metric-definition">Canonical Phase 13A matrix entries.</dd>
          </div>
          <div className="metric-card">
            <dt>Complete locally</dt>
            <dd>{health.complete}</dd>
            <dd className="metric-definition">Automated local integration evidence only.</dd>
          </div>
          <div className="metric-card">
            <dt>Integrated with limitations</dt>
            <dd>{health.limitations}</dd>
            <dd className="metric-definition">Hosted, contention, abuse, or owner gates remain.</dd>
          </div>
          <div className="metric-card">
            <dt>Disconnected / failed</dt>
            <dd>{health.disconnected + health.failedIntegrations}</dd>
            <dd className="metric-definition">Confirmed local integration blockers.</dd>
          </div>
          <div className="metric-card">
            <dt>Disabled</dt>
            <dd>{health.disabled}</dd>
            <dd className="metric-definition">Animal Care remains deliberately unavailable.</dd>
          </div>
          <div className="metric-card">
            <dt>Owner gates pending</dt>
            <dd>{ownerPending.length}</dd>
            <dd className="metric-definition">Never marked by this page.</dd>
          </div>
        </dl>
      </section>

      <section className="detail-card" aria-labelledby="system-health-title">
        <h2 id="system-health-title">Cross-system health</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>System</th>
                <th>Local state</th>
                <th>Evidence boundary</th>
              </tr>
            </thead>
            <tbody>
              {healthChecks.map(([system, status, evidence]) => (
                <tr key={system}>
                  <td>{system}</td>
                  <td>{status}</td>
                  <td>{evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="detail-card" aria-labelledby="capability-matrix-title">
        <h2 id="capability-matrix-title">Capability matrix</h2>
        <p>
          “Complete” means the local implementation chain and automated evidence are complete. It
          does not mean hosted validation or owner acceptance passed.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Capability</th>
                <th>Status</th>
                <th>Entry</th>
                <th>Authority and retry</th>
                <th>Blocker / gate</th>
              </tr>
            </thead>
            <tbody>
              {PHASE13A_GAMEPLAY_CAPABILITIES.map((entry) => (
                <tr key={entry.key}>
                  <td>{entry.capability}</td>
                  <td>{entry.status}</td>
                  <td>{entry.playerEntry}</td>
                  <td>
                    {entry.database} {entry.retry}
                  </td>
                  <td>{entry.blocker ?? 'No confirmed local integration blocker.'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="operations-columns">
        <section className="detail-card" aria-labelledby="failed-integrations-title">
          <h2 id="failed-integrations-title">Disconnected capabilities and failed integrations</h2>
          {disconnected.length === 0 ? (
            <p>No confirmed local integration blocker is recorded.</p>
          ) : (
            <ul>
              {disconnected.map((entry) => (
                <li key={entry.key}>
                  <strong>{entry.capability}</strong>: {entry.blocker}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="detail-card" aria-labelledby="phase13b-handoff-title">
          <h2 id="phase13b-handoff-title">Phase 13B handoff blockers</h2>
          <ul>
            {health.phase13bBlockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="detail-card" aria-labelledby="gameplay-evidence-boundary-title">
        <h2 id="gameplay-evidence-boundary-title">Local versus hosted evidence</h2>
        <p>
          This protected page reads compiled repository data only. It does not query production
          Supabase, inspect private player data, write hosted records, publish worlds, activate
          assets, push migrations, deploy, or complete owner acceptance. Hosted and manual gates
          remain pending.
        </p>
      </section>
    </main>
  );
}
