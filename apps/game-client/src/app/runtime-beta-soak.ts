import { AssetFailureRegistry } from './asset-failure-registry';
import { automaticRetryAvailable, runtimeRetryDelay } from './runtime-recovery';

export interface RuntimeBetaSoakReport {
  readonly cycles: number;
  readonly playerLoads: readonly number[];
  readonly maximumRemotePlayers: number;
  readonly duplicateRemotePlayers: number;
  readonly remainingRemotePlayers: number;
  readonly remainingListeners: number;
  readonly assetFetchAttempts: number;
  readonly retryScheduleMs: readonly number[];
}

export function runRuntimeBetaSoakFixture(
  cycles = 2_000,
  playerLoads: readonly number[] = [1, 5, 10, 20, 40],
): RuntimeBetaSoakReport {
  if (!Number.isInteger(cycles) || cycles < 1 || cycles > 100_000) {
    throw new Error('Runtime soak cycles must be between 1 and 100000.');
  }
  const remotes = new Set<string>();
  let duplicateRemotePlayers = 0;
  let maximumRemotePlayers = 0;
  let listeners = 0;
  let assetFetchAttempts = 0;
  let now = 1_000;
  const failures = new AssetFailureRegistry({
    now: () => now,
    retryAfterMs: 60_000,
    requestId: () => 'soak-asset-request',
  });

  for (let cycle = 0; cycle < cycles; cycle += 1) {
    listeners += 4;
    const playerCount = playerLoads[cycle % playerLoads.length] ?? 1;
    const next = new Set(Array.from({ length: playerCount }, (_, index) => `remote-${index}`));
    for (const presenceId of remotes) {
      if (!next.has(presenceId)) remotes.delete(presenceId);
    }
    for (const presenceId of next) {
      if (remotes.has(presenceId)) continue;
      const before = remotes.size;
      remotes.add(presenceId);
      if (remotes.size === before) duplicateRemotePlayers += 1;
    }
    maximumRemotePlayers = Math.max(maximumRemotePlayers, remotes.size);

    if (failures.begin('world.tree.oak:v1')) {
      assetFetchAttempts += 1;
      failures.fail('world.tree.oak:v1', 'world.tree.oak', 'bundled-manifest:1.0.0');
    }
    listeners -= 4;
    now += 16;
  }
  remotes.clear();

  const retryScheduleMs: number[] = [];
  let attempt = 0;
  while (automaticRetryAvailable('realtime', attempt)) {
    retryScheduleMs.push(runtimeRetryDelay('realtime', attempt, () => 0.5));
    attempt += 1;
  }
  return {
    cycles,
    playerLoads: [...playerLoads],
    maximumRemotePlayers,
    duplicateRemotePlayers,
    remainingRemotePlayers: remotes.size,
    remainingListeners: listeners,
    assetFetchAttempts,
    retryScheduleMs,
  };
}
