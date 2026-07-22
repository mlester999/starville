export const OPERATIONAL_CAPABILITY_STATUSES = [
  'ready',
  'ready_with_limitations',
  'missing',
  'blocked',
] as const;

export type OperationalCapabilityStatus = (typeof OPERATIONAL_CAPABILITY_STATUSES)[number];

export interface OperationalCapability {
  readonly id: string;
  readonly name: string;
  readonly operatorRole: string;
  readonly portalSurface: string;
  readonly apiRoute: string;
  readonly databaseFunction: string;
  readonly worker: string;
  readonly permission: string;
  readonly assurance: 'AAL2 mutation' | 'AAL2 review' | 'read only';
  readonly concurrency: string;
  readonly auditEvidence: string;
  readonly rollback: string;
  readonly runbook: string;
  readonly automatedEvidence: string;
  readonly status: OperationalCapabilityStatus;
  readonly limitation: string | null;
}

const capability = (
  value: Omit<OperationalCapability, 'worker' | 'assurance' | 'concurrency'> &
    Partial<Pick<OperationalCapability, 'worker' | 'assurance' | 'concurrency'>>,
): OperationalCapability => ({
  worker: 'Not required; request completes synchronously',
  assurance: 'AAL2 mutation',
  concurrency: 'Expected revision or database row lock',
  ...value,
});

/**
 * Repository-backed Phase 13C capability inventory. This is intentionally not
 * a claim that hosted production is configured or accepted.
 */
export const STARVILLE_OPERATIONAL_CAPABILITIES: readonly OperationalCapability[] = [
  capability({
    id: 'maintenance',
    name: 'Maintenance mode',
    operatorRole: 'live_operations_manager',
    portalSurface: '/operations/live',
    apiRoute: '/api/v1/admin/live-operations/maintenance',
    databaseFunction: 'public.update_admin_maintenance',
    permission: 'live_operations.manage',
    auditEvidence: 'live_operations audit event and before/after state',
    rollback: 'Disable or reschedule with the current revision',
    runbook: 'docs/operations/live-operations.md#maintenance-mode',
    automatedEvidence: '@starville/api live-operations route tests',
    status: 'ready',
    limitation: null,
  }),
  capability({
    id: 'announcements',
    name: 'Announcements',
    operatorRole: 'live_operations_manager',
    portalSurface: '/operations/live',
    apiRoute: '/api/v1/admin/live-operations/announcements',
    databaseFunction: 'public.save_admin_announcement',
    permission: 'announcements.manage',
    auditEvidence: 'live_operations announcement revision and lifecycle audit',
    rollback: 'Deactivate or archive using the expected revision',
    runbook: 'docs/operations/live-operations.md#announcements',
    automatedEvidence: '@starville/api live-operations route tests',
    status: 'ready',
    limitation: null,
  }),
  capability({
    id: 'world-publish',
    name: 'World publish',
    operatorRole: 'world_designer',
    portalSurface: '/worlds',
    apiRoute: '/api/v1/admin/worlds/:mapId/drafts/:versionId/publish',
    databaseFunction: 'public.publish_admin_world_version',
    permission: 'maps.publish',
    auditEvidence: 'immutable world publication audit record',
    rollback: 'Publish a reviewed rollback revision',
    runbook: 'docs/operations/world-and-assets.md#world-publish-and-rollback',
    automatedEvidence: '@starville/api admin-world route tests and local PostgreSQL tests',
    status: 'ready_with_limitations',
    limitation:
      'Production world version remains an owner selection and Phase 13D acceptance gate.',
  }),
  capability({
    id: 'world-rollback',
    name: 'World rollback',
    operatorRole: 'world_designer',
    portalSurface: '/world-audit',
    apiRoute: '/api/v1/admin/worlds/:mapId/versions/:versionId/rollback',
    databaseFunction: 'public.rollback_admin_world_revision',
    permission: 'maps.rollback',
    auditEvidence: 'world rollback source, reason, actor, and revision',
    rollback: 'Restore the previously reviewed published version',
    runbook: 'docs/operations/world-and-assets.md#world-publish-and-rollback',
    automatedEvidence: 'world publication and concurrency tests',
    status: 'ready_with_limitations',
    limitation: 'Requires hosted rehearsal against starville-dev before production use.',
  }),
  capability({
    id: 'asset-activate',
    name: 'Asset version activation',
    operatorRole: 'asset_manager',
    portalSurface: '/world-assets/review',
    apiRoute: '/api/v1/admin/world-assets/:assetId/versions/:versionId/activate',
    databaseFunction: 'public.activate_admin_game_asset_version',
    permission: 'assets.activate',
    auditEvidence: 'asset activation actor, source version, target version, and reason',
    rollback: 'Restore the bundled default or reactivate an accepted version',
    runbook: 'docs/operations/world-and-assets.md#asset-activation-and-recovery',
    automatedEvidence: 'asset management tests and bundled-asset route tests',
    status: 'ready_with_limitations',
    limitation: 'V2 and V3 candidate art are not owner-accepted production defaults.',
  }),
  capability({
    id: 'asset-restore',
    name: 'Bundled asset restore',
    operatorRole: 'asset_manager',
    portalSurface: '/world-assets/audit',
    apiRoute: '/api/v1/admin/world-assets/:assetId/restore-bundled-default',
    databaseFunction: 'public.restore_admin_game_asset_bundled_default',
    permission: 'assets.activate',
    auditEvidence: 'asset restore actor, bundled key, reason, and result',
    rollback: 'Reactivate a separately accepted asset version',
    runbook: 'docs/operations/world-and-assets.md#asset-activation-and-recovery',
    automatedEvidence: 'bundled fallback and asset validation tests',
    status: 'ready',
    limitation: null,
  }),
  capability({
    id: 'player-lookup',
    name: 'Player lookup',
    operatorRole: 'customer_support',
    portalSurface: '/players',
    apiRoute: '/api/v1/admin/players',
    databaseFunction: 'public.list_admin_players',
    permission: 'players.read',
    assurance: 'read only',
    concurrency: 'Bounded, paginated database read',
    auditEvidence: 'request and admin access logs; no secret fields returned',
    rollback: 'Not applicable',
    runbook: 'docs/operations/player-support.md#player-lookup',
    automatedEvidence: '@starville/api admin-player authorization tests',
    status: 'ready',
    limitation: null,
  }),
  capability({
    id: 'player-suspend',
    name: 'Player suspend and restore',
    operatorRole: 'moderator',
    portalSurface: '/players/:playerId',
    apiRoute: '/api/v1/admin/players/:playerId/suspend and /restore',
    databaseFunction: 'public.admin_suspend_player / public.admin_restore_player',
    permission: 'players.suspend',
    auditEvidence: 'append-only player operation with reason and actor',
    rollback: 'Restore the player through the separately permissioned action',
    runbook: 'docs/operations/player-support.md#suspend-and-restore',
    automatedEvidence: 'admin-player route and RLS tests',
    status: 'ready',
    limitation: null,
  }),
  capability({
    id: 'session-revoke',
    name: 'Player session revocation',
    operatorRole: 'moderator',
    portalSurface: '/players/:playerId',
    apiRoute: '/api/v1/admin/players/:playerId/revoke-sessions',
    databaseFunction: 'public.admin_revoke_player_sessions',
    permission: 'players.manage_sessions',
    auditEvidence: 'revocation count, actor, target, reason, and request identifier',
    rollback: 'Player must authenticate again; revoked sessions are never restored',
    runbook: 'docs/operations/player-support.md#session-revocation',
    automatedEvidence: 'player operation and wallet-session tests',
    status: 'ready',
    limitation: null,
  }),
  capability({
    id: 'rename',
    name: 'Player rename intervention',
    operatorRole: 'moderator',
    portalSurface: '/players/:playerId',
    apiRoute: '/api/v1/admin/players/:playerId/rename and /require-rename',
    databaseFunction: 'public.admin_rename_player / public.admin_require_player_rename',
    permission: 'players.rename / players.require_rename',
    auditEvidence: 'old and new safe display name, actor, target, and reason',
    rollback: 'Perform a separately justified rename; no silent history rewrite',
    runbook: 'docs/operations/player-support.md#rename-intervention',
    automatedEvidence: 'admin-player validation and concurrency tests',
    status: 'ready',
    limitation: null,
  }),
  capability({
    id: 'chat-moderation',
    name: 'Chat report moderation',
    operatorRole: 'moderator',
    portalSurface: '/operations/chat',
    apiRoute: '/api/v1/admin/multiplayer-chat/reports/:reportId/actions',
    databaseFunction: 'public.admin_act_on_multiplayer_chat_report',
    permission: 'multiplayer_chat.moderate',
    auditEvidence: 'preserved report evidence and moderation action audit',
    rollback: 'Use player restoration only after independent review',
    runbook: 'docs/operations/moderation.md#chat-reports',
    automatedEvidence: 'chat report integrity, authorization, and RLS tests',
    status: 'ready',
    limitation: null,
  }),
  capability({
    id: 'social-moderation',
    name: 'Home visit and social moderation',
    operatorRole: 'moderator',
    portalSurface: '/operations/social/home-visits',
    apiRoute: '/api/v1/admin/home-visits/guestbook/:id/moderate',
    databaseFunction: 'public.moderate_admin_home_guestbook_entry',
    permission: 'home_visits.guestbooks.moderate',
    auditEvidence: 'social interaction evidence plus moderation action',
    rollback: 'Use the narrowly scoped restore action when one exists',
    runbook: 'docs/operations/moderation.md#social-and-home-visits',
    automatedEvidence: 'social graph, gift, trade, and home-visit tests',
    status: 'ready',
    limitation: null,
  }),
  capability({
    id: 'economy-inspect',
    name: 'Economy and DUST inspection',
    operatorRole: 'read_only_analyst or economy_manager',
    portalSurface: '/economy',
    apiRoute: '/api/v1/admin/economy',
    databaseFunction: 'public.get_admin_economy_overview',
    permission: 'economy.read',
    assurance: 'read only',
    concurrency: 'Bounded ledger and aggregate reads',
    auditEvidence: 'immutable ledger references and administrative access logs',
    rollback: 'Not applicable',
    runbook: 'docs/operations/economy-corrections-and-reconciliation.md#inspection',
    automatedEvidence: 'economy route, ledger, and invariant tests',
    status: 'ready',
    limitation: null,
  }),
  capability({
    id: 'dust-correction',
    name: 'DUST correction',
    operatorRole: 'economy_manager and financial_reviewer',
    portalSurface: '/economy/corrections',
    apiRoute: '/api/v1/admin/economy/corrections',
    databaseFunction:
      'public.create_admin_economy_correction / public.review_admin_economy_correction',
    permission: 'economy.correction.create / economy.correction.review',
    concurrency: 'Separation of duties, expected state, and row locks',
    auditEvidence: 'request, review, immutable ledger settlement, and reason',
    rollback: 'Create an equal-and-opposite reviewed correction',
    runbook: 'docs/operations/economy-corrections-and-reconciliation.md#dust-correction',
    automatedEvidence: 'economy correction, separation-of-duties, and race tests',
    status: 'ready',
    limitation: null,
  }),
  capability({
    id: 'inventory-correction',
    name: 'Inventory correction',
    operatorRole: 'customer_support and financial_reviewer',
    portalSurface: '/players/:playerId',
    apiRoute: '/api/v1/admin/cosmetics/grants and typed domain peers',
    databaseFunction: 'Existing grant/revoke operations by inventory domain',
    permission: 'cosmetics.grant / cosmetics.revoke and typed domain peers',
    auditEvidence: 'item identifier, delta, target, actor, reason, and resulting inventory',
    rollback: 'Apply a reviewed inverse grant or revocation',
    runbook: 'docs/operations/economy-corrections-and-reconciliation.md#inventory-correction',
    automatedEvidence: 'inventory capacity, ownership, authorization, and replay tests',
    status: 'ready_with_limitations',
    limitation:
      'There is no universal inventory mutation; operators use typed domain-specific actions.',
  }),
  capability({
    id: 'reconciliation',
    name: 'Reconciliation queues',
    operatorRole: 'economy_manager',
    portalSurface: '/economy/reconciliation',
    apiRoute: '/api/v1/admin/economy/reconciliation',
    databaseFunction: 'public.run_admin_economy_reconciliation and typed peers',
    permission: 'economy.reconciliation.manage',
    worker: '@starville/worker claims bounded reconciliation jobs',
    auditEvidence: 'queue request, claim, result, mismatch, resolution, and actor',
    rollback: 'Stop the worker; inspect before a separately reviewed correction',
    runbook: 'docs/operations/economy-corrections-and-reconciliation.md#reconciliation',
    automatedEvidence: 'worker, claim, idempotency, and reconciliation tests',
    status: 'ready',
    limitation: null,
  }),
  capability({
    id: 'service-health',
    name: 'Service health and readiness',
    operatorRole: 'read_only_analyst',
    portalSurface: '/operations',
    apiRoute: '/health and /ready',
    databaseFunction: 'Read-only bounded readiness probes',
    permission: 'operations.read',
    assurance: 'read only',
    concurrency: 'Not applicable',
    auditEvidence: 'deployment-provider health logs without credentials or player data',
    rollback: 'Roll back the affected deployment artifact',
    runbook: 'docs/operations/observability-and-health.md',
    automatedEvidence: 'API, realtime, and worker health/readiness tests',
    status: 'ready_with_limitations',
    limitation: 'Production monitors and paging destinations are Phase 13D configuration.',
  }),
  capability({
    id: 'backup-restore',
    name: 'Backup, restore, and disaster recovery',
    operatorRole: 'production_owner and database_operator',
    portalSurface: 'Supabase project controls; no application mutation surface',
    apiRoute: 'Not applicable',
    databaseFunction: 'Supabase-managed backup and point-in-time recovery',
    permission: 'External production-owner control',
    assurance: 'AAL2 review',
    concurrency: 'Maintenance window and change freeze',
    auditEvidence: 'Provider backup identifier, restore rehearsal record, and sign-off',
    rollback: 'Abort commissioning or restore the approved recovery point',
    runbook: 'docs/operations/backup-restore-and-rollback.md',
    automatedEvidence: 'Local clean-chain and deterministic migration-manifest validation',
    status: 'blocked',
    limitation: 'Hosted backup policy and restore rehearsal require Phase 13D owner access.',
  }),
  capability({
    id: 'incident-management',
    name: 'Incident management',
    operatorRole: 'incident_commander',
    portalSurface: 'Runbook and external owner-approved incident record',
    apiRoute: 'Not implemented',
    databaseFunction: 'Not implemented',
    permission: 'External incident process',
    assurance: 'AAL2 review',
    concurrency: 'Single incident commander and timestamped decision log',
    auditEvidence: 'Incident timeline, severity, decisions, evidence links, and postmortem',
    rollback: 'Use service-specific rollback runbook',
    runbook: 'docs/operations/incidents-and-outages.md',
    automatedEvidence: 'Runbook completeness validation',
    status: 'ready_with_limitations',
    limitation: 'No in-product incident ticket system; use an owner-approved external system.',
  }),
  capability({
    id: 'support-queue',
    name: 'Support case queue',
    operatorRole: 'customer_support',
    portalSurface: 'External owner-approved support system plus /players lookup',
    apiRoute: 'Not implemented',
    databaseFunction: 'Not implemented',
    permission: 'players.read for bounded lookup',
    assurance: 'AAL2 review',
    concurrency: 'External case ownership',
    auditEvidence: 'Case identifier referenced in every administrative reason',
    rollback: 'Use the affected domain rollback procedure',
    runbook: 'docs/operations/player-support.md',
    automatedEvidence: 'Player lookup and mutation authorization tests',
    status: 'missing',
    limitation:
      'A production support provider, retention policy, and escalation destination are not selected.',
  }),
] as const;

export interface ReleaseReadinessSummary {
  readonly total: number;
  readonly ready: number;
  readonly readyWithLimitations: number;
  readonly missing: number;
  readonly blocked: number;
  readonly productionReady: boolean;
}

export function summarizeOperationalCapabilities(
  capabilities: readonly OperationalCapability[],
): ReleaseReadinessSummary {
  const count = (status: OperationalCapabilityStatus) =>
    capabilities.filter((item) => item.status === status).length;
  const missing = count('missing');
  const blocked = count('blocked');
  return {
    total: capabilities.length,
    ready: count('ready'),
    readyWithLimitations: count('ready_with_limitations'),
    missing,
    blocked,
    productionReady: missing === 0 && blocked === 0,
  };
}
