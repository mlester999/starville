# Phase 9A.1 balance-tuning candidates

Status: local deterministic planning only. Reviewed configuration remains unchanged and unpublished.

## Shared assumptions

All candidates begin with 250 starter DUST and three days of beginner protection. The common
baseline uses mean repeatable sources of 18 DUST at 55% daily participation and mean useful sinks of
16 DUST at 50% daily participation. The model keeps movement, chat, parties, social interaction, and
channel switching free. It does not change wallet eligibility or add fees, token rewards,
withdrawals, conversion, custody, or on-chain activity.

The controlled matrix runs every candidate across 100, 1,000, and 10,000 synthetic players; 30, 90,
and 180 days; and ten scenarios: casual-heavy, balanced, highly engaged, reward-maximizing,
low-spending, high-spending, activity-event spike, shop disabled, rewards paused, and suspicious
farming. That is 360 isolated runs plus deterministic replay of every run.

## Candidates

| Candidate                      | Planning change                                        | 180-day balanced ratio | Beginner affordability | Review                                                                 |
| ------------------------------ | ------------------------------------------------------ | ---------------------: | ---------------------: | ---------------------------------------------------------------------- |
| A — Current Baseline           | No tuning                                              |                 ~1.433 |                ~100.0% | Useful control; moderately inflationary over 180 days                  |
| B — More Useful Spending       | More frequent and slightly larger ordinary-item sinks  |                 ~1.052 |                 ~77.7% | Ratio is attractive but end-state affordability pressure is too abrupt |
| C — Lower Repeatable Emissions | Moderate repeatable-source reduction                   |                 ~1.209 |                 ~98.0% | Preserves affordability but remains above the initial planning band    |
| D — Balanced Combination       | Small emission reduction plus useful optional spending |                 ~1.094 |                 ~89.2% | Conservative recommendation for owner review                           |

Values are averages across the three tested populations using the balanced 180-day scenario. The
30-day ratios are higher because every newly modeled player receives starter DUST inside a much
shorter observation window. That onboarding effect is why no candidate is selected from one ratio or
one duration alone.

## Recommendation

Candidate D is the conservative recommendation. It reaches the suggested 0.95–1.10 planning band in
the reviewed 180-day balanced scenario while preserving starter DUST, beginner protection, the first
Moonpetal completion, free social systems, and current wallet access. Candidate B reaches a similar
ratio by leaning harder on spending and has materially lower end-state beginner affordability, so it
is not the conservative choice.

Owner review must still examine time to first purchase, median growth, p90/p99 balances, cap reach,
shop participation, top-one-percent concentration, unused balances, beginner failure, and
suspicious/reward-maximizer contribution under every scenario. A favorable simulation is not
authority to publish.

## Reproduction and limitations

Run `pnpm economy:load:test`. The command prints a machine-readable report covering the full matrix,
per-candidate summaries, deterministic replay, time, and memory. It also exercises controlled API
reads, purchases, retries, reward/correction bursts, reconciliation, risk aggregation, lifecycle
validation, documentation search, and loopback-only production documentation rendering. Individual
authorized admin runs persist only bounded aggregate reports with `playerBalancesMutated: false`;
the simulator has no path to player accounts or active pointers. The recorded local measurements and
their limits are in `docs/deployment/phase-9a1-local-load-report.md`.

This model is a planning instrument, not a production forecast, price claim, financial promise, or
capacity benchmark. Human behavior, content cadence, retention, and future inventory design can
change results. The recommendation remains unpublished until the owner explicitly accepts or rejects
it after hosted and signed-in validation.
