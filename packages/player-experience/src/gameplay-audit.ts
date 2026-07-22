export const GAMEPLAY_CAPABILITY_STATUSES = [
  'complete',
  'integrated with limitations',
  'disconnected',
  'mock-only',
  'backend-only',
  'client-only',
  'blocked',
  'disabled',
  'unreleased',
  'owner acceptance pending',
] as const;

export type GameplayCapabilityStatus = (typeof GAMEPLAY_CAPABILITY_STATUSES)[number];

export interface GameplayCapabilityAudit {
  readonly key: string;
  readonly capability: string;
  readonly playerEntry: string;
  readonly client: string;
  readonly api: string;
  readonly realtime: string;
  readonly database: string;
  readonly worker: string;
  readonly authorization: string;
  readonly rls: string;
  readonly idempotency: string;
  readonly auditEvidence: string;
  readonly loadingState: string;
  readonly errorState: string;
  readonly retry: string;
  readonly reconnect: string;
  readonly tests: readonly string[];
  readonly documentation: string;
  readonly status: GameplayCapabilityStatus;
  readonly blocker: string | null;
  readonly ownerAcceptance: 'not required' | 'pending';
}

type CapabilityInput = Pick<
  GameplayCapabilityAudit,
  | 'key'
  | 'capability'
  | 'playerEntry'
  | 'client'
  | 'api'
  | 'database'
  | 'idempotency'
  | 'auditEvidence'
  | 'tests'
  | 'documentation'
  | 'status'
> &
  Partial<
    Pick<
      GameplayCapabilityAudit,
      | 'realtime'
      | 'worker'
      | 'authorization'
      | 'rls'
      | 'loadingState'
      | 'errorState'
      | 'retry'
      | 'reconnect'
      | 'blocker'
      | 'ownerAcceptance'
    >
  >;

function capability(input: CapabilityInput): GameplayCapabilityAudit {
  return {
    realtime: 'Not applicable; HTTP reconciliation is canonical for this capability.',
    worker: 'Not applicable; settlement completes in the authoritative request transaction.',
    authorization:
      'Authenticated player identity is resolved by the API; identifiers are not trusted from the client.',
    rls: 'Player-owned rows are protected by canonical RLS and narrow server-side access.',
    loadingState:
      'Explicit loading state; prior trusted state is not presented as a new settlement.',
    errorState: 'Safe player-facing failure with no fabricated success state.',
    retry:
      'Retry reloads authoritative state and reuses an operation key when settlement may have occurred.',
    reconnect: 'Focus/reconnect reconciliation reloads the authoritative projection.',
    blocker: null,
    ownerAcceptance: 'pending',
    ...input,
  };
}

/**
 * Repository-evidence audit, not hosted health telemetry. A `complete` status means
 * the local implementation chain and automated evidence are complete; it never
 * implies hosted validation or owner acceptance.
 */
export const PHASE13A_GAMEPLAY_CAPABILITIES: readonly GameplayCapabilityAudit[] = [
  capability({
    key: 'token-access',
    capability: 'Wallet token access and session handoff',
    playerEntry: 'Landing wallet verification → game gate',
    client:
      'TokenAccessGate remounts PlayerExperience by wallet and network and reconciles every 30 seconds.',
    api: 'Trusted token-access session load, recheck, and revoke routes.',
    database: 'Wallet-access sessions and token-gate configuration.',
    idempotency:
      'Session identity is server-issued; background checks replace rather than append state.',
    auditEvidence: 'Token-access session/configuration audit and safe gate screen.',
    tests: ['TokenAccessGate.test.tsx', 'token-access-client.test.ts'],
    documentation: 'docs/architecture/phase-13a-gameplay-integration.md',
    status: 'complete',
  }),
  capability({
    key: 'profile-character',
    capability: 'Player profile and character creation',
    playerEntry: 'First eligible entry',
    client: 'PlayerExperience → CharacterSetup → CharacterCustomization.',
    api: 'Player profile create/read and avatar selection routes.',
    database: 'player_profiles and canonical avatar selection tables.',
    idempotency: 'One player profile per authenticated identity; revisioned appearance updates.',
    auditEvidence: 'Profile moderation and avatar selection audit records.',
    tests: ['PlayerExperience.test.tsx', 'avatar-client.test.ts'],
    documentation: 'docs/architecture/player-experience.md',
    status: 'complete',
  }),
  capability({
    key: 'world-entry',
    capability: 'World entry and position restoration',
    playerEntry: 'Enter Lantern Square or resume last safe location',
    client: 'GameWorld loads the authorized manifest and persisted player projection.',
    api: 'World bootstrap and player-state checkpoint routes.',
    database: 'player_game_state, world maps, immutable world versions.',
    idempotency: 'Expected game-state version rejects stale checkpoints.',
    auditEvidence: 'World version evidence and player-state version history.',
    tests: ['GameWorld.test.tsx', 'player-persistence.test.ts'],
    documentation: 'docs/architecture/world-persistence.md',
    status: 'complete',
  }),
  capability({
    key: 'onboarding',
    capability: 'Core onboarding',
    playerEntry: 'Guided objective panel and semantic world targets',
    client: 'GuidedPlayerExperience consumes the canonical workspace projection.',
    api: 'Player-experience workspace, acknowledgement, preference, and feedback routes.',
    database: 'player_onboarding_progress and append-only canonical gameplay events.',
    idempotency: 'Unique step evidence and exact-once starter recovery/settlement.',
    auditEvidence: 'Onboarding step evidence event keys and support feedback.',
    tests: ['player-experience.test.ts', 'GuidedPlayerExperience.test.tsx'],
    documentation: 'docs/architecture/phase-12a-player-experience.md',
    status: 'complete',
  }),
  capability({
    key: 'daily-rhythm',
    capability: 'Daily Rhythm objectives',
    playerEntry: 'Guided objective panel',
    client: 'Daily assignments and UTC reset are rendered from the workspace.',
    api: 'Player-experience workspace route.',
    database: 'Daily assignment, progress, and non-economic completion state.',
    idempotency: 'Unique player/day/objective assignment and event-driven progress.',
    auditEvidence: 'Assignment revision, progress evidence, and UTC reset key.',
    tests: ['player-experience.test.ts', 'player-experience integration tests'],
    documentation: 'docs/architecture/phase-12a-player-experience.md',
    status: 'integrated with limitations',
    blocker: 'Daily Rhythm v1 is intentionally non-economic and owner balancing remains pending.',
  }),
  capability({
    key: 'farming',
    capability: 'Farming plot lifecycle',
    playerEntry: 'Personal-home garden plot',
    client: 'CozyGameplay farm and starter vertical-slice actions.',
    api: 'Prepare, plant, water, inspect, and harvest routes/RPCs.',
    database: 'Canonical farm plots, crop instances, inventory mutations, and farming events.',
    worker: 'Farming reconciliation repairs time-derived crop readiness without granting twice.',
    idempotency: 'Expected tile/crop revision plus operation key; harvest output is unique.',
    auditEvidence: 'Farm action events, inventory receipts, and reconciliation evidence.',
    tests: ['cozy-gameplay farming tests', 'phase11a concurrency fixture'],
    documentation: 'docs/architecture/phase-11a-playable-vertical-slice.md',
    status: 'complete',
  }),
  capability({
    key: 'inventory',
    capability: 'Canonical inventory',
    playerEntry: 'HUD inventory and gameplay settlement panels',
    client: 'CozyGameplay reloads inventory after authoritative mutation and on focus.',
    api: 'Inventory projection and atomic gameplay settlement routes.',
    database: 'Player inventory containers, stacks, reservations, and receipts.',
    idempotency: 'Unique settlement receipts and expected inventory state version.',
    auditEvidence: 'Inventory mutation receipts and source operation references.',
    tests: ['inventory package tests', 'CozyGameplay.test.tsx'],
    documentation: 'docs/architecture/phase-11a-playable-vertical-slice.md',
    status: 'complete',
  }),
  capability({
    key: 'cooking',
    capability: 'Cooking jobs',
    playerEntry: 'Personal-home Cooking Hearth',
    client: 'WorkstationPanel starts and collects canonical jobs by server UUID.',
    api: 'Workstation workspace, start, collect, and tutorial routes.',
    database: 'Versioned recipes, jobs, ingredient settlements, and output receipts.',
    worker: 'Crafting reconciliation advances eligible jobs and repairs projections.',
    idempotency: 'Ingredients consumed once on start; output collected once by job.',
    auditEvidence: 'Job lifecycle events and inventory settlement receipts.',
    tests: ['workstation package tests', 'CozyGameplay.test.tsx'],
    documentation: 'docs/architecture/phase-11b-cooking-crafting.md',
    status: 'complete',
  }),
  capability({
    key: 'crafting',
    capability: 'Crafting jobs',
    playerEntry: 'Personal-home Craft Bench',
    client: 'WorkstationPanel shares the authoritative job lifecycle.',
    api: 'Workstation workspace, start, and collect routes.',
    database: 'Versioned recipes, jobs, ingredient settlements, and output receipts.',
    worker: 'Crafting reconciliation advances eligible jobs and repairs projections.',
    idempotency: 'Ingredients consumed once on start; output collected once by job.',
    auditEvidence: 'Job lifecycle events and inventory settlement receipts.',
    tests: ['workstation package tests', 'CozyGameplay.test.tsx'],
    documentation: 'docs/architecture/phase-11b-cooking-crafting.md',
    status: 'complete',
  }),
  capability({
    key: 'general-store',
    capability: 'General Store purchase and sale',
    playerEntry: 'Lantern Square General Store',
    client: 'GeneralStorePanel confirms trusted price/revision and reloads receipts/state.',
    api: 'Catalog, transaction, event cursor, receipt, and tutorial routes.',
    realtime: 'Bounded event cursor polling requests rehydration after gaps.',
    database: 'Catalog versions, stock, limits, DUST ledger, inventory, receipts, and events.',
    idempotency: 'Idempotency key is bound to payload and all state revisions.',
    auditEvidence: 'Public receipt, private ledger receipt, catalog and stock revision.',
    tests: ['GeneralStorePanel.test.tsx', 'economy concurrency fixtures'],
    documentation: 'docs/architecture/phase-11c-general-store.md',
    status: 'complete',
  }),
  capability({
    key: 'dust',
    capability: 'Off-chain DUST ledger',
    playerEntry: 'HUD, history, shops, quests, housing, gifts, and trades',
    client: 'Explicit loading/ready/unavailable union preserves a real zero balance.',
    api: 'DUST account, bounded history, and atomic settlement routes.',
    database: 'Immutable DUST ledger entries and derived account balance/version.',
    worker: 'Economy maintenance and reconciliation detect mismatches without minting repairs.',
    idempotency: 'Closed source/sink registry and unique source-operation receipt.',
    auditEvidence: 'Immutable ledger receipt and approved source/sink key.',
    tests: ['economy package tests', 'EconomyPanels.test.tsx'],
    documentation: 'docs/architecture/economy.md',
    status: 'complete',
  }),
  capability({
    key: 'progression',
    capability: 'XP, levels, skills, and unlocks',
    playerEntry: 'My Journey panel and HUD level',
    client: 'ProgressionPanel and HUD reload canonical workspace after settlement.',
    api: 'Progression workspace and reviewed claim routes.',
    database: 'Player XP ledger, skill totals, levels, quests, rewards, and unlocks.',
    worker: 'Player-experience and progression reconciliation repair projections.',
    idempotency: 'Unique source event grants XP and rewards once.',
    auditEvidence: 'XP event source, quest reward receipt, and level history.',
    tests: ['progression package tests', 'ProgressionPanel.test.tsx'],
    documentation: 'docs/architecture/phase-11d-player-progression.md',
    status: 'complete',
  }),
  capability({
    key: 'achievements-titles',
    capability: 'Achievements, badges, and titles',
    playerEntry: 'My Journey panel',
    client: 'ProgressionPanel renders earned/locked achievements and selected title.',
    api: 'Progression workspace and title-selection route.',
    database: 'Versioned definitions, player achievement progress, earned titles, selection.',
    idempotency: 'Unique player/achievement and player/title settlement.',
    auditEvidence: 'Achievement evidence source and title selection audit.',
    tests: ['progression achievement/title tests', 'ProgressionPanel.test.tsx'],
    documentation: 'docs/architecture/phase-11d-player-progression.md',
    status: 'complete',
  }),
  capability({
    key: 'housing',
    capability: 'Housing layout, storage, and upgrades',
    playerEntry: 'Personal-home Housing workspace',
    client: 'Local draft/undo/redo, server validation, revisioned save, storage, upgrades.',
    api: 'Housing workspace, validation, save, storage, history, and upgrade routes.',
    database: 'Immutable layout revisions, furniture instances, storage, DUST upgrade receipts.',
    worker: 'Housing maintenance reconciles sessions and derived capacity.',
    idempotency: 'Expected layout/storage/DUST revision and unique upgrade/settlement receipt.',
    auditEvidence: 'Layout revision history, storage transfer, and upgrade receipt.',
    tests: ['housing package tests', 'HousingWorkspacePanel.test.ts'],
    documentation: 'docs/architecture/phase-11e-housing.md',
    status: 'complete',
  }),
  capability({
    key: 'home-visits',
    capability: 'Home visibility, visits, guestbook, appreciation, and helper watering',
    playerEntry: 'Housing Visits tab and social home directory',
    client: 'HomeVisitsPanel uses bounded visitor modes and private-home realtime.',
    api: 'Visibility, directory, invitation, visit, guestbook, appreciation, and help routes.',
    realtime: 'Private home presence and bounded owner/visitor events.',
    database: 'Home policies, invites, visits, guestbook, appreciation, helper action receipts.',
    worker: 'Home-visit maintenance expires visits/invites and reconciles stale presence.',
    idempotency: 'Unique bounded appreciation/help windows and visit/event revisions.',
    auditEvidence: 'Visit lifecycle, guestbook moderation, appreciation/help receipt.',
    tests: ['home-visits package tests', 'home-visit concurrency fixtures'],
    documentation: 'docs/architecture/phase-11f-home-visits.md',
    status: 'integrated with limitations',
    blocker:
      'Owner-plus-ten browser/device validation and hosted reconnect testing are Phase 13B gates.',
  }),
  capability({
    key: 'friends-parties',
    capability: 'Friends and parties',
    playerEntry: 'Friends, nearby players, and party controls',
    client: 'SocialGraphPanel reconciles versioned graph and party snapshots.',
    api: 'Friend request/response/removal and party lifecycle routes.',
    realtime: 'Safe public identifiers, invite changes, party membership, and presence.',
    database: 'Friend requests/edges, parties, membership, invitations, and audit.',
    worker: 'Social graph cleanup expires requests/invitations and stale parties.',
    idempotency: 'Unique directed request/edge and revisioned party mutations.',
    auditEvidence: 'Social graph and party lifecycle audit.',
    tests: ['social graph package tests', 'realtime-client.test.ts'],
    documentation: 'docs/architecture/social-graph.md',
    status: 'integrated with limitations',
    blocker: 'Hosted multiplayer contention and abuse validation belong to Phase 13B.',
  }),
  capability({
    key: 'chat',
    capability: 'Bounded multiplayer chat',
    playerEntry: 'Channel chat panel and safe bubbles',
    client: 'ChatPanel distinguishes connecting, disconnected, limited, and available state.',
    api: 'Report and moderation routes; realtime service admits messages.',
    realtime: 'Channel-scoped messages, cooldowns, safe profile identity, reconnect snapshot.',
    database: 'Bounded message/report/moderation evidence.',
    worker: 'Chat cleanup applies retention and expires ephemeral state.',
    idempotency: 'Client message keys deduplicate reconnect/retry delivery.',
    auditEvidence: 'Safe message reference, report, and moderation audit.',
    tests: ['chat package tests', 'realtime-client.test.ts'],
    documentation: 'docs/architecture/multiplayer-chat.md',
    status: 'integrated with limitations',
    blocker: 'Moderation hardening, rate limits, and hosted abuse tests belong to Phase 13B.',
  }),
  capability({
    key: 'gifts-trades',
    capability: 'Gifting and player trading',
    playerEntry: 'Player interaction and Social Operations panels',
    client:
      'SocialInteractionPanel shows versioned offers, confirmations, receipts, and cancellation.',
    api: 'Gift and trade lifecycle routes with authoritative inventory/DUST settlement.',
    realtime: 'Versioned interaction snapshots clear changed confirmations and settled state.',
    database: 'Gift/trade offers, items, confirmations, receipts, inventory and DUST settlements.',
    worker: 'Social interaction cleanup expires and cancels abandoned interactions safely.',
    idempotency:
      'Operation key, expected revision, payload fingerprint, and unique settlement receipt.',
    auditEvidence: 'Gift/trade lifecycle and settlement audit.',
    tests: ['social interactions package tests', 'SocialInteractionPanel.test.tsx'],
    documentation: 'docs/architecture/social-interactions.md',
    status: 'integrated with limitations',
    blocker: 'Hosted contention, collusion, and abuse testing belong to Phase 13B.',
  }),
  capability({
    key: 'realtime-reconnect',
    capability: 'Realtime presence and reconnect',
    playerEntry: 'Automatic while playing; manual retry in status dock',
    client: 'Realtime client clears remote state on leave/channel change and reconciles snapshots.',
    api: 'Authenticated realtime admission and reconciliation endpoints.',
    realtime:
      'Presence, channels, chat, parties, social interactions, activities, and home visits.',
    database: 'Session/admission state and bounded lifecycle evidence.',
    worker: 'Cleanup workers expire stale sessions and interaction state.',
    idempotency: 'Snapshot versions and stable message/event keys deduplicate replay.',
    auditEvidence: 'Safe disconnect reason and reconnect summary.',
    tests: ['realtime-client.test.ts', 'realtime load test'],
    documentation: 'docs/architecture/realtime.md',
    status: 'integrated with limitations',
    blocker:
      'Physical network interruption and approximately 40-player certification are Phase 13B.',
  }),
  capability({
    key: 'animal-care',
    capability: 'Animal Care',
    playerEntry: 'None',
    client: 'No claimable or navigable player surface.',
    api: 'No mutation route.',
    realtime: 'Not implemented.',
    database: 'No released gameplay authority.',
    worker: 'No worker.',
    authorization: 'No access path exists.',
    rls: 'Not applicable.',
    idempotency: 'Not applicable.',
    auditEvidence: 'Disabled progression catalog entry only.',
    loadingState: 'Not shown.',
    errorState: 'Not shown.',
    retry: 'Not applicable.',
    reconnect: 'Not applicable.',
    tests: ['progression disabled-feature tests'],
    documentation: 'docs/STARVILLE_MASTER_SPEC.md',
    status: 'disabled',
    blocker: 'Explicitly outside Phase 13A; animals and livestock were not added.',
    ownerAcceptance: 'not required',
  }),
] as const;

export interface AuthoritativeStateAudit {
  readonly state: string;
  readonly database: string;
  readonly api: string;
  readonly realtime: string;
  readonly clientCache: string;
  readonly invalidation: string;
  readonly reconnect: string;
  readonly conflict: string;
  readonly audit: string;
}

function authority(
  state: string,
  database: string,
  api: string,
  overrides: Partial<Omit<AuthoritativeStateAudit, 'state' | 'database' | 'api'>> = {},
): AuthoritativeStateAudit {
  return {
    state,
    database,
    api,
    realtime: 'Not authoritative; HTTP projection is canonical.',
    clientCache: 'Component-scoped projection only.',
    invalidation: 'Reload after settlement and on focus/reconnect.',
    reconnect: 'Discard uncertain projection and reload from the API.',
    conflict: 'Expected revision rejects stale writes; client rehydrates.',
    audit: 'Canonical mutation/event receipt.',
    ...overrides,
  };
}

export const PHASE13A_AUTHORITATIVE_STATE_MAP: readonly AuthoritativeStateAudit[] = [
  authority('wallet identity', 'wallet access session subject', 'token-access session routes', {
    clientCache: 'TokenAccessGate trusted grant; PlayerExperience key includes wallet and network.',
    invalidation: 'Confirmed denial, revoke, or account/network change unmounts all player state.',
    audit: 'Wallet verification/session audit without exposing private credentials.',
  }),
  authority('player identity', 'player_profiles.id bound to auth subject', 'player profile routes'),
  authority('player profile', 'player_profiles', 'GET/POST player profile', {
    audit: 'Profile creation/moderation/rename audit.',
  }),
  authority(
    'character appearance',
    'avatar selections and immutable catalog versions',
    'avatar routes',
    {
      realtime: 'Compact public appearance reference only; never canonical ownership.',
      clientCache: 'Reference-counted avatar resource keyed by public profile revision.',
      invalidation: 'Own save reloads profile; public revision replaces cached selection.',
      audit: 'Avatar selection revision and ownership validation.',
    },
  ),
  authority(
    'current world',
    'player_game_state + active world version',
    'world bootstrap/checkpoint',
  ),
  authority(
    'player position',
    'versioned player_game_state checkpoint',
    'checkpoint/final-state routes',
    {
      realtime: 'Transient movement only; never persistence authority.',
      clientCache: 'Game runtime state plus bounded persistence queue.',
      invalidation: 'World transition flushes; invalid position resolves to approved spawn.',
    },
  ),
  authority(
    'channel',
    'realtime channel definitions and admitted session',
    'realtime admission/reconcile',
    {
      realtime: 'Canonical for active channel membership.',
      clientCache: 'Realtime reducer snapshot.',
      invalidation: 'Channel change clears remotes before applying the new snapshot.',
      audit: 'Admission, switch, disconnect, and capacity evidence.',
    },
  ),
  authority(
    'inventory',
    'inventory containers/stacks/reservations',
    'inventory and settlement routes',
  ),
  authority(
    'DUST',
    'immutable dust_ledger_entries + versioned account',
    'DUST account/history and settlement routes',
  ),
  authority('progression', 'XP ledger, skill totals, levels, unlocks', 'progression workspace'),
  authority(
    'objectives',
    'onboarding/daily/quest objective progress',
    'player-experience and progression workspace',
  ),
  authority(
    'achievements',
    'achievement definitions/progress/settlements',
    'progression workspace',
  ),
  authority(
    'titles',
    'earned titles and selected title revision',
    'progression workspace/title mutation',
  ),
  authority('farming plots', 'farm plots and expected tile revision', 'farm plot routes'),
  authority(
    'crops',
    'crop instances, timestamps, lifecycle events',
    'farm mutation/inspection routes',
  ),
  authority(
    'cooking jobs',
    'workstation jobs + recipe version',
    'workstation workspace/start/collect',
  ),
  authority(
    'crafting jobs',
    'workstation jobs + recipe version',
    'workstation workspace/start/collect',
  ),
  authority(
    'shop purchases',
    'economy receipts, stock, limits, ledger, inventory',
    'General Store transaction/receipt/events',
  ),
  authority(
    'housing layout',
    'immutable housing revisions + active revision',
    'housing validate/save/history',
  ),
  authority(
    'furniture inventory',
    'furniture instances, inventory, home storage',
    'housing workspace/storage transfer',
  ),
  authority('home visibility', 'home access policy revision', 'home visibility routes'),
  authority('home visitors', 'home visit sessions', 'home directory/invite/visit routes', {
    realtime: 'Private-home snapshot represents active visitors, capped owner plus ten.',
  }),
  authority('guestbook', 'moderated guestbook entries', 'guestbook routes'),
  authority('appreciation', 'bounded appreciation receipts', 'appreciation mutation'),
  authority(
    'helper watering',
    'bounded helper action receipt + owner crop transition',
    'helper watering mutation',
  ),
  authority('friends', 'friend requests and accepted edges', 'friend lifecycle routes', {
    realtime: 'Versioned graph notifications trigger reconciliation.',
  }),
  authority('parties', 'party, membership, invitation revisions', 'party lifecycle routes', {
    realtime: 'Versioned party snapshot and membership events.',
  }),
  authority('chat', 'bounded chat message/report evidence', 'moderation/report routes', {
    realtime: 'Admitted server message is the live channel representation.',
    clientCache: 'Bounded reducer list keyed by message ID.',
    invalidation: 'Reconnect replaces/merges by stable IDs; channel switch clears the list.',
  }),
  authority('gifts', 'gift lifecycle, item lines, settlement receipt', 'gift lifecycle routes', {
    realtime: 'Versioned gift state notification.',
  }),
  authority(
    'trades',
    'trade lifecycle, offers, confirmations, settlement receipt',
    'trade lifecycle routes',
    {
      realtime: 'Versioned trade snapshot; offer changes clear both confirmations.',
    },
  ),
] as const;

export interface GameplayFailureAudit {
  readonly failure: string;
  readonly authoritativeResult: string;
  readonly rollback: string;
  readonly playerMessage: string;
  readonly retry: string;
  readonly idempotency: string;
  readonly reconnect: string;
  readonly auditEvidence: string;
  readonly supportEvidence: string;
}

function failure(
  failureName: string,
  authoritativeResult: string,
  playerMessage: string,
  supportEvidence: string,
): GameplayFailureAudit {
  return {
    failure: failureName,
    authoritativeResult,
    rollback:
      'The failed transaction commits no partial settlement; a committed timeout is recovered by receipt replay.',
    playerMessage,
    retry:
      'Reload the authoritative canonical projection, then retry with the original operation key when the outcome is uncertain.',
    idempotency: 'Same key and payload replays one result; changed payload is rejected.',
    reconnect: 'Reconnect discards transient state and reconciles the authoritative projection.',
    auditEvidence: 'Safe request/error code plus canonical receipt or absence of settlement.',
    supportEvidence,
  };
}

export const PHASE13A_FAILURE_MATRIX: readonly GameplayFailureAudit[] = [
  failure(
    'wallet failure',
    'No trusted session or player bootstrap.',
    'Reconnect and verify your wallet at the village gate.',
    'Token-access gate state and verification audit.',
  ),
  failure(
    'token-access failure',
    'Gameplay unmounts after confirmed denial; transient checks retain the last trusted grant with a warning.',
    'Village access could not be verified.',
    'Session recheck result and safe denial reason.',
  ),
  failure(
    'profile failure',
    'No profile is created or replaced.',
    'Your player profile could not be loaded or saved.',
    'Profile validation/moderation evidence.',
  ),
  failure(
    'world-manifest failure',
    'No unauthorized or partial world replaces the active world.',
    'The village map could not be loaded.',
    'World/version/checksum and managed fallback evidence.',
  ),
  failure(
    'asset failure',
    'World authority is unchanged; the renderer uses an approved fallback or explicit missing state.',
    'Some village art could not be displayed.',
    'Asset key/version/checksum/fallback registry.',
  ),
  failure(
    'realtime failure',
    'Persistent state remains server-authoritative; remote presence is marked disconnected.',
    'Live village connection interrupted. Reconnecting…',
    'Safe disconnect/reconnect summaries.',
  ),
  failure(
    'inventory failure',
    'No stack delta is committed, or an existing receipt is replayed.',
    'Inventory could not settle that action safely.',
    'Inventory receipt and state version.',
  ),
  failure(
    'DUST failure',
    'No partial ledger/account change is committed.',
    'DUST balance could not be updated.',
    'Immutable ledger receipt and account version.',
  ),
  failure(
    'farming failure',
    'Tile, crop, inventory, and XP remain atomic.',
    'The garden changed elsewhere. The latest plot was loaded.',
    'Farm event, plot revision, and inventory receipt.',
  ),
  failure(
    'cooking failure',
    'Ingredients/start or output/collect remain atomic.',
    'The Cooking Hearth could not complete that request.',
    'Workstation job lifecycle and settlement receipt.',
  ),
  failure(
    'crafting failure',
    'Ingredients/start or output/collect remain atomic.',
    'The Craft Bench could not complete that request.',
    'Workstation job lifecycle and settlement receipt.',
  ),
  failure(
    'shop failure',
    'Stock, limits, DUST, inventory, objective, and receipt commit together or not at all.',
    'The offer changed or the transaction was not completed.',
    'Catalog/stock/state revisions and economy receipt.',
  ),
  failure(
    'housing failure',
    'No active layout/storage/upgrade change commits partially.',
    'Your home changed elsewhere. The latest version was restored.',
    'Housing revision, transfer, or upgrade receipt.',
  ),
  failure(
    'home-visit failure',
    'No visit or bounded social interaction is invented.',
    'That home visit is no longer available.',
    'Visit/invite/policy revision and lifecycle audit.',
  ),
  failure(
    'friend failure',
    'No request/edge transition commits without authorization.',
    'Friendship state changed. The latest list was loaded.',
    'Friend request/edge audit.',
  ),
  failure(
    'party failure',
    'No stale membership/invitation change commits.',
    'Party state changed. The latest party was loaded.',
    'Party revision and lifecycle audit.',
  ),
  failure(
    'chat failure',
    'No local message is shown as server accepted.',
    'Message was not sent. Check the connection and try again.',
    'Stable message key or safe rejection/report reference.',
  ),
  failure(
    'gift failure',
    'Offer and settlement remain atomic; uncertain completion replays the receipt.',
    'The gift changed or could not be settled.',
    'Gift revision and settlement receipt.',
  ),
  failure(
    'trade failure',
    'Offers, confirmations, inventories, DUST, and receipt settle atomically.',
    'The trade changed. Review the latest offer.',
    'Trade revision, confirmations, and settlement receipt.',
  ),
  failure(
    'worker failure',
    'Canonical committed state remains valid; due work stays retryable and duplicate-safe.',
    'Some background updates are delayed; your settled items remain safe.',
    'Worker lease, attempt, reconciliation, and dead-letter evidence.',
  ),
] as const;

export const PHASE13A_LOCAL_FIXTURES = [
  ['brand-new-eligible-player', 'Brand-new eligible player', 1],
  ['returning-player', 'Returning player', 1],
  ['completed-onboarding-player', 'Completed onboarding player', 1],
  ['inventory-full-player', 'Inventory-full player', 1],
  ['zero-dust-player', 'Zero-DUST player', 1],
  ['high-dust-test-player', 'High-DUST test player', 1],
  ['active-crop-player', 'Active-crop player', 1],
  ['harvest-ready-player', 'Harvest-ready player', 1],
  ['cooking-ready-player', 'Cooking-ready player', 1],
  ['crafting-ready-player', 'Crafting-ready player', 1],
  ['furnished-home-player', 'Furnished-home player', 1],
  ['public-home-owner', 'Public-home owner', 1],
  ['private-home-owner', 'Private-home owner', 1],
  ['friend-pair', 'Friend pair', 2],
  ['party-group', 'Party group', 4],
  ['gift-pair', 'Gift pair', 2],
  ['trade-pair', 'Trade pair', 2],
  ['reconnecting-player', 'Reconnecting player', 1],
  ['invalid-position-player', 'Invalid-position player', 1],
  ['owner-plus-ten-visitors', 'Owner plus ten visitors', 11],
] as const;

export type Phase13aLocalFixtureKey = (typeof PHASE13A_LOCAL_FIXTURES)[number][0];

export interface Phase13aLocalFixture {
  readonly key: Phase13aLocalFixtureKey;
  readonly label: string;
  readonly participantCount: number;
  readonly persistence: 'game_test';
  readonly hostedWrites: false;
  readonly clock: '2026-07-22T00:00:00.000Z';
}

export function createPhase13aLocalFixture(key: Phase13aLocalFixtureKey): Phase13aLocalFixture {
  const definition = PHASE13A_LOCAL_FIXTURES.find(([candidate]) => candidate === key);
  if (definition === undefined) throw new Error(`Unknown Phase 13A fixture: ${key}`);
  return {
    key,
    label: definition[1],
    participantCount: definition[2],
    persistence: 'game_test',
    hostedWrites: false,
    clock: '2026-07-22T00:00:00.000Z',
  };
}

export interface GameplayHealthSummary {
  readonly evidenceBoundary: 'local_repository';
  readonly capabilities: number;
  readonly disconnected: number;
  readonly failedIntegrations: number;
  readonly complete: number;
  readonly limitations: number;
  readonly disabled: number;
  readonly settlementHealth: 'local automated evidence passed';
  readonly inventorySettlement: 'canonical';
  readonly dustReconciliation: 'canonical';
  readonly workerStatus: 'implemented; hosted contention pending';
  readonly deferredOwnerGates: number;
  readonly phase13bBlockers: readonly string[];
}

export function summarizePhase13aGameplayHealth(): GameplayHealthSummary {
  const count = (status: GameplayCapabilityStatus) =>
    PHASE13A_GAMEPLAY_CAPABILITIES.filter((entry) => entry.status === status).length;
  return {
    evidenceBoundary: 'local_repository',
    capabilities: PHASE13A_GAMEPLAY_CAPABILITIES.length,
    disconnected: count('disconnected'),
    failedIntegrations: count('blocked'),
    complete: count('complete'),
    limitations: count('integrated with limitations'),
    disabled: count('disabled'),
    settlementHealth: 'local automated evidence passed',
    inventorySettlement: 'canonical',
    dustReconciliation: 'canonical',
    workerStatus: 'implemented; hosted contention pending',
    deferredOwnerGates: PHASE13A_GAMEPLAY_CAPABILITIES.filter(
      (entry) => entry.ownerAcceptance === 'pending',
    ).length,
    phase13bBlockers: [
      'Hosted RLS and role-boundary validation',
      'Approximately 40-player channel and owner-plus-ten network validation',
      'Contention, abuse, moderation, backup, and recovery drills',
      'Browser, physical-device, and owner acceptance sessions',
    ],
  };
}
