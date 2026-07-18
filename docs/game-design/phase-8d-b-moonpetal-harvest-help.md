# Moonpetal Harvest Help

Moonpetal Harvest Help is the Phase 8D-B non-combat reference activity. An existing private party of
two to four players prepares and delivers a community harvest in an isolated eight-minute
development instance.

## Player flow

The party leader opens Activities, reviews the two-to-four-player requirement, eight-minute
estimate, level-one recommendation, reward preview, cooldown, and daily state, then starts a ready
check. Every current member must answer on the exact party revision before entry.

The shared sequence is:

1. Gather six temporary seed bundles.
2. Plant six activity-owned plots.
3. Water six activity-owned crops.
4. Wait for a 30-second server-controlled accelerated growth timer.
5. Harvest six activity-owned crops.
6. Deliver six temporary harvest bundles.
7. Ring the community completion marker.

Only the active step responds. Each prompt shows personal contribution, party total, target, and the
next friendly action. The browser never advances progress itself.

## Timers and recovery

The full run expires after 480 seconds. Players have 60 seconds to reconnect and 120 seconds to
arrive before the waiting state fails. Server timestamps drive every countdown. A reconnect restores
the exact objective, used objects, temporary items, contribution, participants, and deadline without
duplicating entities.

Moonpetal continues when at least two eligible online participants remain. A reconnect timeout
removes that player from reward eligibility. Fewer than two eligible online participants fails the
run and grants no reward.

## Content isolation

The seed bundles, plots, crops, harvest bundles, and collection station belong to the activity
instance. They are not personal inventory or farm objects, cannot be gifted, traded, sold, or
persisted outside the run, and are cleared on every terminal outcome. Development marker art is
allowed until reviewed production assets are published.

## Rewards and anti-idle policy

Each eligible participant receives an equal base reward of 15 off-chain DUST and two ordinary
Moonbeans. The reward limit is two rewarded completions per UTC day, with a 60-second entry cooldown
and 300-second reward cooldown. A contribution of two is enough; the rule prevents obvious
zero-participation farming and does not rank or reduce normal players' rewards.

If item capacity is unavailable, DUST and other eligible participants settle normally and the item
becomes a protected pending claim. Completion retries return the immutable original receipt.
Failure, cancellation, expiry, suspension removal, or leaving before completion grants no activity
completion reward.

## Success and failure presentation

Success shows completion time, objectives, equal member contributions, receipt, daily count, and
safe return. Failure shows a friendly bounded reason, completed steps, “no rewards granted,” retry
eligibility, and return action. No screen exposes an internal database ID, wallet address, email,
inventory internals, or moderation detail.
