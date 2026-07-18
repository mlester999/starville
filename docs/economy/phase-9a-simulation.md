# Phase 9A economy simulation model

The simulator is an internal deterministic planning tool, not a production forecast or financial
promise. It never reads or mutates real accounts, cooldowns, inventory, shop rows, or ledger rows.
Only a bounded aggregate report may be recorded after an authorized run.

Supported populations are 100, 1,000, and 10,000; durations are 30, 90, and 180 days. Supported
scenarios are casual-heavy, balanced, highly engaged, reward-maximizing, low-spending,
high-spending, activity event spike, shop disabled, reward source paused, and a synthetic 10%
suspicious-farming pattern. A seeded linear congruential generator makes exact input/seed replays
identical.

Reports include creation, destruction, ending supply, daily source/sink participation,
source-to-sink ratio, average, p10/p50/p90/p99 balance, top-one-percent concentration, ability to
buy a basic item, excessive unused balance, purchase and activity frequency, cap reach, inflation
trend, velocity estimate, suspicious emission contribution, correction volume, and reconciliation
mismatch count. Comparisons calculate explicit deltas between two reports.

Planning review—not code—sets acceptable bands for first-purchase time, active-player purchasing,
source-to-sink ratio, median growth, high-balance concentration, cap reach, and suspicious emission.
The report recommends investigation; it never publishes a policy.

Run the controlled local scale and workflow check with `pnpm economy:load:test`. The simulation uses
only in-memory synthetic players and prints duration and process memory for 100, 1,000, and 10,000
players. The wider command also exercises isolated Fastify economy routes and a loopback-only public
documentation server. It has no hosted service or database path and never mutates real player data.
