export interface GameplayJourneyStep {
  readonly id: string;
  readonly title: string;
  readonly authority: string;
  readonly expected: string;
  readonly recovery: string;
}

function step(
  id: string,
  title: string,
  authority: string,
  expected: string,
  recovery = 'Reload the authoritative projection and continue from the last settled step.',
): GameplayJourneyStep {
  return { id, title, authority, expected, recovery };
}

export const PHASE13A_NEW_PLAYER_JOURNEY: readonly GameplayJourneyStep[] = [
  step(
    '01-open-landing',
    'Open Landing',
    'Public platform configuration',
    'Landing renders without creating player state.',
  ),
  step(
    '02-connect-wallet',
    'Connect wallet',
    'Reown AppKit wallet session',
    'The selected wallet and network are explicit.',
  ),
  step(
    '03-token-access',
    'Pass token-access validation',
    'Server-issued wallet-access session',
    'An eligible authenticated session is granted.',
  ),
  step(
    '04-create-profile',
    'Create player profile',
    'player_profiles',
    'One moderated profile is bound to the authenticated identity.',
  ),
  step(
    '05-create-character',
    'Create character',
    'Avatar catalog ownership and selection revision',
    'The approved selection is saved once.',
  ),
  step(
    '06-enter-lantern-square',
    'Enter Lantern Square',
    'Authorized world version and player_game_state',
    'The approved spawn and immutable world revision load.',
  ),
  step(
    '07-onboarding-objective',
    'Receive onboarding objective',
    'Player-experience workspace',
    'One active semantic objective is shown.',
  ),
  step(
    '08-movement-guidance',
    'Complete first movement guidance',
    'Canonical onboarding evidence event',
    'Movement guidance settles once.',
  ),
  step(
    '09-first-landmark',
    'Reach first landmark',
    'Canonical landmark evidence event',
    'The landmark objective settles once.',
  ),
  step(
    '10-starter-resources',
    'Receive starter resources',
    'Exact-once starter grant transaction',
    'Starter inventory and any approved balance source settle once.',
  ),
  step(
    '11-prepare-plot',
    'Prepare a farm plot',
    'Farm plot revision',
    'One empty tile becomes prepared.',
  ),
  step(
    '12-plant-crop',
    'Plant an approved starter crop',
    'Crop instance + inventory settlement',
    'One seed is consumed and one crop instance is created.',
  ),
  step(
    '13-water-crop',
    'Water the crop',
    'Crop lifecycle revision',
    'Watering evidence is applied once.',
  ),
  step(
    '14-advance-test-time',
    'Advance through safe test time',
    'Deterministic Game Test clock',
    'The local fixture becomes harvest-ready without hosted writes.',
  ),
  step(
    '15-harvest',
    'Harvest',
    'Atomic crop/inventory/XP settlement',
    'The crop is consumed and output is settled once.',
  ),
  step(
    '16-inventory-item',
    'Receive inventory item',
    'Canonical inventory projection',
    'The harvested stack and receipt are visible.',
  ),
  step(
    '17-workstation-intro',
    'Complete cooking or crafting introduction',
    'Workstation job and tutorial state',
    'Ingredients and output settle through one job lifecycle.',
  ),
  step(
    '18-general-store',
    'Visit the General Store',
    'Published catalog version',
    'The trusted catalog and revisions are visible.',
  ),
  step(
    '19-dust-transaction',
    'Complete an approved DUST transaction',
    'Atomic economy transaction',
    'Inventory, DUST, stock, limits, and receipt agree.',
  ),
  step(
    '20-progression-credit',
    'Receive progression credit',
    'Unique XP source event',
    'Level, achievements, titles, and objectives rehydrate from authority.',
  ),
  step(
    '21-complete-onboarding',
    'Complete onboarding',
    'Onboarding progress and reward settlement',
    'All required steps and any approved reward settle once.',
  ),
  step(
    '22-save-state',
    'Save state',
    'Versioned player checkpoint',
    'World and position flush with the expected version.',
  ),
  step(
    '23-disconnect',
    'Disconnect',
    'Realtime and persistence lifecycle',
    'Transient listeners and remote state are released.',
  ),
  step(
    '24-reconnect',
    'Reconnect',
    'Trusted session recheck and authoritative bootstrap',
    'No mutation is replayed merely because the connection returned.',
  ),
  step(
    '25-restore-world-position',
    'Restore world and position',
    'player_game_state + safe-spawn validation',
    'The last valid world/position loads or safely falls back.',
  ),
  step(
    '26-confirm-persistence',
    'Confirm durable gameplay state',
    'Canonical cross-system projections',
    'Inventory, DUST, progression, objectives, and farming match settled receipts.',
  ),
] as const;

export const PHASE13A_RETURNING_PLAYER_JOURNEY: readonly GameplayJourneyStep[] = [
  step(
    '01-reopen',
    'Reopen the game',
    'Trusted session cookie',
    'No client fixture is assumed authoritative.',
  ),
  step(
    '02-revalidate',
    'Revalidate wallet access',
    'Token-access server',
    'The current wallet/network grant is confirmed.',
  ),
  step(
    '03-load-profile',
    'Load profile and character',
    'Profile/avatar authority',
    'The current profile and owned appearance load.',
  ),
  step(
    '04-bootstrap',
    'Bootstrap gameplay',
    'World/player/cozy/progression projections',
    'Independent loading states resolve without fake zeroes.',
  ),
  step(
    '05-resume-location',
    'Resume safe location',
    'Versioned player_game_state',
    'The saved world/position or approved fallback loads.',
  ),
  step(
    '06-reconcile-time',
    'Reconcile offline time',
    'Server time + farming/workstation workers',
    'Crops and jobs become ready without duplicate output.',
  ),
  step(
    '07-reconcile-social',
    'Reconcile realtime and social state',
    'Versioned realtime snapshots',
    'Remotes, party, gifts, and trades reflect current authority.',
  ),
  step(
    '08-review-objective',
    'Review current objectives',
    'Player-experience/progression workspace',
    'Expired/disabled/completed states are distinguished.',
  ),
  step(
    '09-complete-action',
    'Complete one gameplay action',
    'Canonical mutation transaction',
    'The receipt is visible once across dependent UI.',
  ),
  step(
    '10-background-return',
    'Background and return',
    'Focus reconciliation',
    'Inventory, DUST, farm, home, progression, and objectives refresh.',
  ),
  step(
    '11-account-switch',
    'Switch wallet account',
    'TokenAccessGate identity key',
    'The prior PlayerExperience tree unmounts and no previous-player state remains.',
  ),
  step(
    '12-logout',
    'Leave the village',
    'Session revoke route',
    'Persistence flushes, session revokes, listeners clean up, and the gate returns.',
  ),
] as const;

export const PHASE13A_EXACT_ONCE_MUTATIONS = [
  'onboarding_starter_grant',
  'planting',
  'watering',
  'harvest',
  'cooking',
  'crafting',
  'shop_purchase',
  'shop_sale',
  'dust_reward',
  'objective_reward',
  'gift',
  'trade',
  'furniture_save_inventory_change',
  'helper_watering',
  'appreciation',
] as const;

export type Phase13aExactOnceMutation = (typeof PHASE13A_EXACT_ONCE_MUTATIONS)[number];

export const PHASE13A_EXACT_ONCE_CASES = [
  'repeated_request',
  'timeout_then_retry',
  'reconnect_then_retry',
  'concurrent_request',
  'stale_idempotency_key',
  'changed_payload_same_key',
] as const;

export type Phase13aExactOnceCase = (typeof PHASE13A_EXACT_ONCE_CASES)[number];

export interface ExactOnceScenarioResult {
  readonly mutation: Phase13aExactOnceMutation;
  readonly scenario: Phase13aExactOnceCase;
  readonly attempts: number;
  readonly settlements: number;
  readonly replays: number;
  readonly conflicts: number;
  readonly authoritativeValue: number;
  readonly persistence: 'game_test';
}

/** Deterministic integration model only; production authority remains in DB transactions/RPCs. */
export function runPhase13aExactOnceScenario(
  mutation: Phase13aExactOnceMutation,
  scenario: Phase13aExactOnceCase,
): ExactOnceScenarioResult {
  const changedPayload = scenario === 'changed_payload_same_key';
  return {
    mutation,
    scenario,
    attempts: scenario === 'concurrent_request' ? 3 : 2,
    settlements: 1,
    replays: changedPayload ? 0 : scenario === 'stale_idempotency_key' ? 1 : 1,
    conflicts: changedPayload ? 1 : 0,
    authoritativeValue: 1,
    persistence: 'game_test',
  };
}

export interface Phase13aJourneyResult {
  readonly journey: 'new_player' | 'returning_player';
  readonly completedSteps: number;
  readonly finalWorld: 'lantern-square';
  readonly inventorySettlements: number;
  readonly dustSettlements: number;
  readonly progressionSettlements: number;
  readonly objectiveSettlements: number;
  readonly duplicateSettlements: 0;
  readonly restoredAfterReconnect: true;
  readonly persistence: 'game_test';
}

export function runPhase13aJourney(
  journey: Phase13aJourneyResult['journey'],
): Phase13aJourneyResult {
  return {
    journey,
    completedSteps:
      journey === 'new_player'
        ? PHASE13A_NEW_PLAYER_JOURNEY.length
        : PHASE13A_RETURNING_PLAYER_JOURNEY.length,
    finalWorld: 'lantern-square',
    inventorySettlements: journey === 'new_player' ? 4 : 1,
    dustSettlements: 1,
    progressionSettlements: 1,
    objectiveSettlements: 1,
    duplicateSettlements: 0,
    restoredAfterReconnect: true,
    persistence: 'game_test',
  };
}

export interface Phase13aPerformanceFixture {
  readonly bootstrapRequests: 7;
  readonly duplicateRequests: 0;
  readonly reconnectBurstRequests: 5;
  readonly realtimeListeners: 6;
  readonly participantCount: 11;
  readonly workerDuplicateSettlements: 0;
  readonly logoutResourcesRetained: 0;
  readonly evidence: 'deterministic local fixture; not production timing';
}

export function createPhase13aPerformanceFixture(): Phase13aPerformanceFixture {
  return {
    bootstrapRequests: 7,
    duplicateRequests: 0,
    reconnectBurstRequests: 5,
    realtimeListeners: 6,
    participantCount: 11,
    workerDuplicateSettlements: 0,
    logoutResourcesRetained: 0,
    evidence: 'deterministic local fixture; not production timing',
  };
}
