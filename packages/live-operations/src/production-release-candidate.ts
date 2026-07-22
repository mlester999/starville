export const PRODUCTION_EVIDENCE_STATUSES = [
  'passed_local',
  'passed_production',
  'accepted_owner',
  'pending_owner',
  'missing',
  'blocked',
  'not_started',
] as const;

export type ProductionEvidenceStatus = (typeof PRODUCTION_EVIDENCE_STATUSES)[number];

export interface ProductionReleaseEvidence {
  readonly id: string;
  readonly label: string;
  readonly owner: string;
  readonly status: ProductionEvidenceStatus;
  readonly evidenceClass:
    | 'repository'
    | 'local_automated'
    | 'production_automated'
    | 'owner_manual'
    | 'browser_emulated'
    | 'physical_device'
    | 'subjective';
  readonly criticalForStageA: boolean;
  readonly detail: string;
}

const evidence = (value: ProductionReleaseEvidence): ProductionReleaseEvidence => value;

/**
 * Truthful repository snapshot for Phase 13D. It is intentionally static and
 * read-only: production and owner states are never inferred from local tests.
 */
export const STARVILLE_PRODUCTION_RELEASE_EVIDENCE: readonly ProductionReleaseEvidence[] = [
  evidence({
    id: 'source-commit',
    label: 'Approved source commit',
    owner: 'release-manager',
    status: 'blocked',
    evidenceClass: 'repository',
    criticalForStageA: true,
    detail: 'Required release inputs are uncommitted in a shared dirty working tree.',
  }),
  evidence({
    id: 'environment-manifest',
    label: 'Environment manifest',
    owner: 'production-owner',
    status: 'passed_local',
    evidenceClass: 'local_automated',
    criticalForStageA: true,
    detail: 'Version 1 is deterministic and fail-closed; exact owner values are still absent.',
  }),
  evidence({
    id: 'production-target',
    label: 'starville-prod identity',
    owner: 'database-owner',
    status: 'missing',
    evidenceClass: 'production_automated',
    criticalForStageA: true,
    detail:
      'No owner-approved project reference, linked target, or masked verification output exists.',
  }),
  evidence({
    id: 'migration-manifest',
    label: 'Migration manifest',
    owner: 'database-owner',
    status: 'passed_local',
    evidenceClass: 'local_automated',
    criticalForStageA: true,
    detail: 'The 85-file ordered chain and SHA-256 values match the local candidate.',
  }),
  evidence({
    id: 'starville-dev-chain',
    label: 'starville-dev clean-chain evidence',
    owner: 'database-owner',
    status: 'missing',
    evidenceClass: 'production_automated',
    criticalForStageA: true,
    detail: 'The predecessor hosted-development gate remains pending.',
  }),
  evidence({
    id: 'reference-seeds',
    label: 'Reference seed manifest',
    owner: 'database-owner',
    status: 'passed_local',
    evidenceClass: 'local_automated',
    criticalForStageA: true,
    detail:
      'The allowlist is data-free and non-authorizing; owner installation evidence is absent.',
  }),
  evidence({
    id: 'world-revision',
    label: 'Approved production world revision',
    owner: 'product-owner',
    status: 'missing',
    evidenceClass: 'owner_manual',
    criticalForStageA: true,
    detail: 'No exact revision identifier has owner production approval.',
  }),
  evidence({
    id: 'asset-manifest',
    label: 'Production asset manifest',
    owner: 'product-owner',
    status: 'pending_owner',
    evidenceClass: 'owner_manual',
    criticalForStageA: true,
    detail: 'Bundled V1 is the accepted fallback; the Phase 13D production selection is unsigned.',
  }),
  evidence({
    id: 'audio-manifest',
    label: 'Production audio manifest',
    owner: 'product-owner',
    status: 'pending_owner',
    evidenceClass: 'subjective',
    criticalForStageA: true,
    detail: 'Provenance is unambiguous, but the procedural catalog remains development-safe.',
  }),
  evidence({
    id: 'backup',
    label: 'Backup capability',
    owner: 'database-owner',
    status: 'missing',
    evidenceClass: 'owner_manual',
    criticalForStageA: true,
    detail: 'No provider retention, PITR, or backup identifier evidence exists.',
  }),
  evidence({
    id: 'restore',
    label: 'Isolated restore verification',
    owner: 'database-owner',
    status: 'missing',
    evidenceClass: 'owner_manual',
    criticalForStageA: true,
    detail: 'No isolated restore environment or completed reconciliation exists.',
  }),
  evidence({
    id: 'observability',
    label: 'Production observability',
    owner: 'operations-owner',
    status: 'pending_owner',
    evidenceClass: 'owner_manual',
    criticalForStageA: true,
    detail: 'Local probes exist; production monitors, paging, and destinations are unconfigured.',
  }),
  evidence({
    id: 'administrator-bootstrap',
    label: 'Production administrator bootstrap',
    owner: 'security-owner',
    status: 'not_started',
    evidenceClass: 'owner_manual',
    criticalForStageA: true,
    detail:
      'Workflow exists, but identity, AAL2 enrollment, audit, and shutdown evidence are absent.',
  }),
  evidence({
    id: 'public-access-lock',
    label: 'Server-side public-access lock',
    owner: 'production-owner',
    status: 'pending_owner',
    evidenceClass: 'owner_manual',
    criticalForStageA: true,
    detail: 'The exact production maintenance, allowlist, or provider lock is not selected.',
  }),
  evidence({
    id: 'phase-12e-acceptance',
    label: 'Phase 12E visual and audio acceptance',
    owner: 'product-owner',
    status: 'pending_owner',
    evidenceClass: 'subjective',
    criticalForStageA: true,
    detail: 'The owner checklist remains entirely unchecked.',
  }),
  evidence({
    id: 'phase-13a-acceptance',
    label: 'Phase 13A gameplay acceptance',
    owner: 'product-owner',
    status: 'pending_owner',
    evidenceClass: 'owner_manual',
    criticalForStageA: true,
    detail: 'Local integration passed; the complete owner journey remains pending.',
  }),
  evidence({
    id: 'phase-13b-hosted',
    label: 'Phase 13B hosted security acceptance',
    owner: 'security-owner',
    status: 'missing',
    evidenceClass: 'production_automated',
    criticalForStageA: true,
    detail: 'Hosted pgTAP, RLS, grant, concurrency, abuse, and owner evidence remain pending.',
  }),
  evidence({
    id: 'production-commissioning',
    label: 'Stage B commissioning',
    owner: 'production-owner',
    status: 'not_started',
    evidenceClass: 'production_automated',
    criticalForStageA: false,
    detail: 'No production migration, seed, bootstrap, deployment, publication, or activation ran.',
  }),
  evidence({
    id: 'production-journeys',
    label: 'Stage C player journeys',
    owner: 'product-owner',
    status: 'not_started',
    evidenceClass: 'owner_manual',
    criticalForStageA: false,
    detail:
      'New-player, returning-player, browser, device, accessibility, visual, and audio gates are pending.',
  }),
  evidence({
    id: 'release-freeze',
    label: 'Release freeze',
    owner: 'release-manager',
    status: 'not_started',
    evidenceClass: 'repository',
    criticalForStageA: false,
    detail: 'A freeze cannot be signed before Stages A through C pass.',
  }),
  evidence({
    id: 'rollback-rehearsal',
    label: 'Rollback rehearsal',
    owner: 'operations-owner',
    status: 'not_started',
    evidenceClass: 'owner_manual',
    criticalForStageA: false,
    detail: 'Local procedures exist; production-provider and isolated-restore evidence do not.',
  }),
] as const;

export type Phase13DStageStatus =
  | 'blocked'
  | 'ready_owner_approval_required'
  | 'commissioned_validation_pending'
  | 'technically_validated_owner_acceptance_pending';

export interface ProductionReleaseSummary {
  readonly total: number;
  readonly passedLocal: number;
  readonly passedProduction: number;
  readonly acceptedOwner: number;
  readonly pending: number;
  readonly missing: number;
  readonly blocked: number;
  readonly stageA: Phase13DStageStatus;
  readonly phase14Recommendation: 'NO-GO' | 'GO_WITH_ACCEPTED_LIMITATIONS' | 'GO';
}

export function summarizeProductionRelease(
  items: readonly ProductionReleaseEvidence[],
): ProductionReleaseSummary {
  const count = (status: ProductionEvidenceStatus) =>
    items.filter((item) => item.status === status).length;
  const isCompleteForClass = (item: ProductionReleaseEvidence): boolean => {
    if (item.evidenceClass === 'repository' || item.evidenceClass === 'local_automated') {
      return (
        item.status === 'passed_local' ||
        item.status === 'passed_production' ||
        item.status === 'accepted_owner'
      );
    }
    if (item.evidenceClass === 'owner_manual' || item.evidenceClass === 'subjective') {
      return item.status === 'accepted_owner';
    }
    return item.status === 'passed_production' || item.status === 'accepted_owner';
  };
  const criticalBlocked = items.some((item) => item.criticalForStageA && !isCompleteForClass(item));
  const productionComplete = items.every(isCompleteForClass);

  return {
    total: items.length,
    passedLocal: count('passed_local'),
    passedProduction: count('passed_production'),
    acceptedOwner: count('accepted_owner'),
    pending: count('pending_owner') + count('not_started'),
    missing: count('missing'),
    blocked: count('blocked'),
    stageA: criticalBlocked ? 'blocked' : 'ready_owner_approval_required',
    phase14Recommendation: productionComplete ? 'GO' : 'NO-GO',
  };
}
