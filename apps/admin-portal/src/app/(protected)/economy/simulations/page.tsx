import { economySimulationAction } from '../../../actions/economy';
import {
  EconomyNotice,
  EconomyPageHeader,
  EmptyState,
  StatusChip,
  formatDate,
  formatPercent,
  planningLabel,
} from '../../../../components/economy-admin-ui';
import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { requireEnabledPlatformModule } from '../../../../lib/platform-configuration/module-access';
import {
  loadEconomySimulations,
  type EconomySimulationCandidate,
} from '../../../../lib/economy-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const candidates: readonly {
  readonly key: EconomySimulationCandidate;
  readonly short: string;
  readonly title: string;
  readonly summary: string;
}[] = [
  {
    key: 'current-baseline',
    short: 'A',
    title: 'Current Baseline',
    summary: 'The reviewed Phase 9A planning assumptions, preserved as the comparison control.',
  },
  {
    key: 'more-useful-spending',
    short: 'B',
    title: 'More Useful Spending',
    summary:
      'More participation in useful ordinary-item sinks without artificial transaction fees.',
  },
  {
    key: 'lower-repeatable-emissions',
    short: 'C',
    title: 'Lower Repeatable Emissions',
    summary: 'Moderate restraint on repeatable sources while preserving starter access.',
  },
  {
    key: 'balanced-combination',
    short: 'D',
    title: 'Balanced Combination',
    summary: 'A conservative blend of useful spending and modest emission restraint.',
  },
];

function candidateLabel(value: string | null): string {
  const candidate = candidates.find((item) => item.key === value);
  return candidate === undefined
    ? 'Custom assumptions'
    : `Candidate ${candidate.short} — ${candidate.title}`;
}

export default async function EconomySimulationsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly notice?: string }>;
}) {
  await requireAuthorizedAdmin('economy.simulation.run');
  await requireEnabledPlatformModule('economy_simulation');
  const [query, simulations] = await Promise.all([searchParams, loadEconomySimulations()]);
  const latestByCandidate = new Map<string, (typeof simulations.items)[number]>();
  for (const run of simulations.items) {
    if (run.candidate !== null && !latestByCandidate.has(run.candidate)) {
      latestByCandidate.set(run.candidate, run);
    }
  }

  return (
    <main className="economy-page" aria-labelledby="economy-page-title">
      <EconomyPageHeader
        description="Run deterministic, isolated economy models and compare conservative tuning candidates across populations, durations, and behavioral scenarios."
        eyebrow="Balance tuning"
        title="Simulations"
      />
      <EconomyNotice notice={query.notice} />

      <aside className="economy-simulation-banner" aria-label="Simulation safety boundary">
        <div>
          <span aria-hidden="true">◇</span>
          <div>
            <strong>Simulation Mode</strong>
            <p>This does not change player balances or published configuration.</p>
          </div>
        </div>
        <StatusChip value="planning_only" />
      </aside>

      <section aria-labelledby="candidate-heading">
        <div className="economy-section-heading">
          <div>
            <p className="eyebrow">Deterministic candidates</p>
            <h2 id="candidate-heading">A–D comparison</h2>
          </div>
          <span>Planning range · 0.95–1.10 source : sink</span>
        </div>
        <div className="economy-candidate-grid">
          {candidates.map((candidate) => {
            const run = latestByCandidate.get(candidate.key);
            return (
              <article
                className={
                  candidate.key === simulations.recommendation?.candidate
                    ? 'is-recommended'
                    : undefined
                }
                key={candidate.key}
              >
                <header>
                  <span>Candidate {candidate.short}</span>
                  {candidate.key === simulations.recommendation?.candidate ? (
                    <StatusChip value="recommended" />
                  ) : null}
                </header>
                <h3>{candidate.title}</h3>
                <p>{candidate.summary}</p>
                {run === undefined ? (
                  <small>No recorded run yet</small>
                ) : (
                  <dl>
                    <div>
                      <dt>Latest ratio</dt>
                      <dd>{run.sourceToSinkRatio.toFixed(2)} : 1</dd>
                    </div>
                    <div>
                      <dt>Planning label</dt>
                      <dd>{planningLabel(run.sourceToSinkRatio)}</dd>
                    </div>
                    <div>
                      <dt>Run</dt>
                      <dd>
                        {run.playerCount.toLocaleString()} players · {run.durationDays} days
                      </dd>
                    </div>
                  </dl>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="economy-panel" aria-labelledby="simulation-run-heading">
        <div className="economy-panel__heading">
          <div>
            <p className="eyebrow">Isolated execution</p>
            <h2 id="simulation-run-heading">Run simulation</h2>
          </div>
        </div>
        <p>
          The current reviewed policy and shop assumptions are copied into an isolated model. The
          shared simulation engine applies the selected candidate; no draft or published row is
          mutated.
        </p>
        <form action={economySimulationAction} className="economy-form-grid">
          <label>
            Policy version
            <select name="policySelection">
              <option value="reviewed-current">Current reviewed assumptions</option>
            </select>
          </label>
          <label>
            Shop version
            <select name="shopSelection">
              <option value="reviewed-current">Current reviewed assumptions</option>
            </select>
          </label>
          <label>
            Candidate
            <select defaultValue="balanced-combination" name="candidate">
              {candidates.map((candidate) => (
                <option key={candidate.key} value={candidate.key}>
                  Candidate {candidate.short} — {candidate.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Population
            <select defaultValue="100" name="playerCount">
              <option value="100">100 players</option>
              <option value="1000">1,000 players</option>
              <option value="10000">10,000 players</option>
            </select>
          </label>
          <label>
            Duration
            <select defaultValue="30" name="durationDays">
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="180">180 days</option>
            </select>
          </label>
          <label>
            Scenario
            <select defaultValue="balanced" name="scenario">
              <option value="casual-heavy">Casual-heavy</option>
              <option value="balanced">Balanced</option>
              <option value="highly-engaged">Highly engaged</option>
              <option value="reward-maximizing">Reward-maximizing</option>
              <option value="low-spending">Low-spending</option>
              <option value="high-spending">High-spending</option>
              <option value="activity-event-spike">Activity event spike</option>
              <option value="shop-disabled">Shop disabled</option>
              <option value="reward-source-paused">Rewards paused</option>
              <option value="suspicious-farming-10-percent">Suspicious farming pattern</option>
            </select>
          </label>
          <label>
            Deterministic seed
            <input
              defaultValue="9001"
              max="2147483647"
              min="1"
              name="seed"
              required
              type="number"
            />
          </label>
          <div className="economy-form-grid__actions">
            <button type="submit">Run Simulation</button>
          </div>
        </form>
        <p className="economy-card-note">
          Complete planning matrix: 3 populations × 3 durations × 10 scenarios × 4 candidates. Same
          inputs and seed produce the same report.
        </p>
      </section>

      {simulations.recommendation === null ? null : (
        <section className="economy-recommendation" aria-labelledby="recommendation-heading">
          <div>
            <p className="eyebrow">Conservative recommendation</p>
            <h2 id="recommendation-heading">{simulations.recommendation.title}</h2>
            <p>{simulations.recommendation.rationale}</p>
          </div>
          <div>
            <StatusChip value="unpublished" />
            <strong>
              {simulations.recommendation.planningRangeMin.toFixed(2)}–
              {simulations.recommendation.planningRangeMax.toFixed(2)}
            </strong>
            <small>Planning source-to-sink range</small>
          </div>
          <p>
            Starter DUST and beginner access remain protected. The recommendation does not add fees
            to movement, chat, parties, channel switching, or other social systems; it does not
            alter wallet access or $STAR behavior.
          </p>
        </section>
      )}

      <section aria-labelledby="simulation-results-heading">
        <div className="economy-section-heading">
          <div>
            <p className="eyebrow">Machine-readable records</p>
            <h2 id="simulation-results-heading">Comparison reports</h2>
          </div>
        </div>
        {simulations.items.length === 0 ? (
          <EmptyState
            description="Run a deterministic candidate to create the first bounded report."
            title="No simulation reports"
          />
        ) : (
          <div className="economy-table-region">
            <table className="economy-table economy-table--simulation">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Population / duration</th>
                  <th>Scenario</th>
                  <th>Ending supply</th>
                  <th>Source : sink</th>
                  <th>Daily net</th>
                  <th>Median / p90 / p99</th>
                  <th>Shop participation</th>
                  <th>Cap reach</th>
                  <th>Beginner affordability</th>
                  <th>Concentration</th>
                  <th>Suspicious contribution</th>
                </tr>
              </thead>
              <tbody>
                {simulations.items.map((run) => (
                  <tr key={run.runId}>
                    <td data-label="Run">
                      <strong>{candidateLabel(run.candidate)}</strong>
                      <small>
                        {formatDate(run.createdAt)} · seed {run.seed}
                      </small>
                    </td>
                    <td data-label="Population / duration">
                      {run.playerCount.toLocaleString()} · {run.durationDays} days
                    </td>
                    <td data-label="Scenario">{run.scenario.replaceAll('-', ' ')}</td>
                    <td data-label="Ending supply">{run.endingSupply.toLocaleString()} DUST</td>
                    <td data-label="Source : sink">
                      <strong>{run.sourceToSinkRatio.toFixed(2)} : 1</strong>
                      <small>{planningLabel(run.sourceToSinkRatio)}</small>
                    </td>
                    <td
                      className={`economy-amount economy-amount--${run.dailyNetChange > 0 ? 'warning' : 'credit'}`}
                      data-label="Daily net"
                    >
                      {run.dailyNetChange > 0 ? '+' : ''}
                      {run.dailyNetChange.toLocaleString()} DUST
                    </td>
                    <td data-label="Median / p90 / p99">
                      {run.medianBalance.toLocaleString()} / {run.p90Balance.toLocaleString()} /{' '}
                      {run.p99Balance.toLocaleString()}
                    </td>
                    <td data-label="Shop participation">
                      {formatPercent(run.shopParticipationRate)}
                    </td>
                    <td data-label="Cap reach">{formatPercent(run.capReachRate)}</td>
                    <td data-label="Beginner affordability">
                      {formatPercent(run.beginnerAffordabilityRate)}
                    </td>
                    <td data-label="Concentration">{formatPercent(run.concentration)}</td>
                    <td data-label="Suspicious contribution">
                      {formatPercent(run.suspiciousEmissionContribution)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
