export const BETA_READINESS_STATUSES = [
  'Not Started',
  'Local Evidence Ready',
  'Hosted Validation Pending',
  'Owner Review Pending',
  'Blocked',
  'Accepted',
  'Production Ready',
] as const;

export type BetaReadinessStatus = (typeof BETA_READINESS_STATUSES)[number];

export const BETA_READINESS_EVIDENCE_PATHS = {
  phase12dValidation: 'docs/deployment/phase-12d-local-validation-report.md',
  runtimeHotfix: 'docs/deployment/phase-12d-runtime-integration-hotfix-report.md',
  hostedPgtapRepair: 'docs/deployment/hosted-pgtap-seed-contract-repair-report.md',
  phase12dOwnerReview: 'docs/deployment/phase-12d-owner-acceptance.md',
  runtimeHotfixOwnerReview: 'docs/deployment/phase-12d-runtime-hotfix-owner-review.md',
  phase12eValidation: 'docs/deployment/phase-12e-local-validation-report.md',
  hostedValidationRecord: 'docs/deployment/phase-12e-hosted-validation-report.md',
  ownerAcceptanceRecord: 'docs/deployment/phase-12e-owner-acceptance.md',
  productionApprovalRecord: 'docs/deployment/phase-12e-production-readiness.md',
  v1Manifest: 'assets/manifests/starville-bundled-v1.json',
  v2Manifest: 'assets/manifests/starville-bundled-v2-candidate.json',
  databasePolicyTests: 'infrastructure/supabase/tests/world_management.test.sql',
  realtimeTests: 'apps/realtime-server/src/app.test.ts',
  economyTests: 'infrastructure/supabase/tests/cozy_gameplay.test.sql',
  readinessModel: 'apps/admin-portal/src/lib/beta-readiness/model.ts',
} as const;

export type BetaReadinessEvidenceKey = keyof typeof BETA_READINESS_EVIDENCE_PATHS;

export interface RepositoryEvidence {
  readonly key: BetaReadinessEvidenceKey;
  readonly label: string;
  readonly path: string;
  readonly present: boolean;
  readonly recognized: boolean;
  readonly modifiedAt: string | null;
}

export interface BetaReadinessObservation {
  readonly checkedAt: string;
  readonly repositoryRoot: string;
  readonly branch: string | null;
  readonly revision: string | null;
  readonly gitStateAvailable: boolean;
  readonly dirtyPathCount: number;
  readonly diffCheckPassed: boolean | null;
  readonly evidence: Readonly<Record<BetaReadinessEvidenceKey, RepositoryEvidence>>;
  /**
   * These attestations must come from explicit reviewed evidence. The local
   * repository loader deliberately leaves owner and production decisions false.
   */
  readonly hostedValidationRecorded: boolean;
  readonly ownerAcceptanceRecorded: boolean;
  readonly productionApprovalRecorded: boolean;
}

export interface ReadinessGate {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly status: BetaReadinessStatus;
  readonly evidence: readonly RepositoryEvidence[];
  readonly lastCheckedAt: string;
  readonly environment: 'Local repository';
  readonly responsibleGate: string;
  readonly blockingReason: string | null;
  readonly nextAction: string;
}

export interface AutomatedEvidenceItem {
  readonly id: string;
  readonly label: string;
  readonly state: 'Recorded' | 'Pending' | 'Blocked';
  readonly source: string;
  readonly note: string;
}

export interface OwnerAcceptanceItem {
  readonly id: string;
  readonly label: string;
  readonly accepted: false;
  readonly note: string;
}

export interface DeploymentReadinessItem {
  readonly id: string;
  readonly label: string;
  readonly kind: 'Automated' | 'Hosted' | 'Owner';
  readonly state: 'Ready' | 'Pending' | 'Blocked';
  readonly note: string;
}

export interface RollbackPreparation {
  readonly id: string;
  readonly label: string;
  readonly prepared: true;
  readonly ownerAccepted: false;
  readonly procedure: string;
  readonly preserves: readonly string[];
}

export interface BetaReadinessSnapshot {
  readonly checkedAt: string;
  readonly repository: {
    readonly root: string;
    readonly branch: string | null;
    readonly revision: string | null;
    readonly gitStateAvailable: boolean;
    readonly dirtyPathCount: number;
    readonly diffCheckPassed: boolean | null;
  };
  readonly overallStatus: BetaReadinessStatus;
  readonly gates: readonly ReadinessGate[];
  readonly automatedEvidence: readonly AutomatedEvidenceItem[];
  readonly ownerAcceptance: readonly OwnerAcceptanceItem[];
  readonly deploymentChecklist: readonly DeploymentReadinessItem[];
  readonly rollbackChecklist: readonly RollbackPreparation[];
}

interface GatePolicy {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly localEvidence: readonly BetaReadinessEvidenceKey[];
  readonly attestationEvidence?: readonly BetaReadinessEvidenceKey[];
  readonly hostedRequired?: boolean;
  readonly ownerRequired?: boolean;
  readonly productionApprovalRequired?: boolean;
  readonly responsibleGate: string;
  readonly nextAction: {
    readonly local: string;
    readonly hosted?: string;
    readonly owner?: string;
    readonly accepted?: string;
  };
  readonly blocker?: (observation: BetaReadinessObservation) => string | null;
}

const GATE_POLICIES: readonly GatePolicy[] = [
  {
    id: 'application-health',
    label: 'Application Health',
    summary:
      'Landing, Game Client, Admin Portal, API, realtime, and worker readiness for the Phase 12E candidate.',
    localEvidence: ['phase12eValidation'],
    attestationEvidence: ['hostedValidationRecord'],
    hostedRequired: true,
    responsibleGate: 'Engineering local validation, then owner-controlled hosted health checks',
    nextAction: {
      local: 'Run the complete Phase 12E local service-health matrix and record the exact results.',
      hosted:
        'Run owner-controlled hosted health and readiness checks after a reviewed deployment.',
      accepted: 'Record production monitoring coverage before declaring production readiness.',
    },
  },
  {
    id: 'database-gates',
    label: 'Database Gates',
    summary:
      'Local migration and seed-contract evidence exists, while the repaired pgTAP suite still needs its owner-controlled hosted rerun.',
    localEvidence: ['hostedPgtapRepair', 'economyTests'],
    attestationEvidence: ['hostedValidationRecord'],
    hostedRequired: true,
    responsibleGate: 'Owner-controlled hosted database validation',
    nextAction: {
      local: 'Restore the local database evidence files before proceeding.',
      hosted:
        'Run the documented hosted lint and pgTAP rerun; attach the exact result without mutating data.',
      accepted: 'Review the hosted database result with the final migration list.',
    },
  },
  {
    id: 'rls-gates',
    label: 'RLS Gates',
    summary:
      'Repository policy tests are present, but local files are not evidence that hosted RLS matches the candidate.',
    localEvidence: ['databasePolicyTests', 'hostedPgtapRepair'],
    attestationEvidence: ['hostedValidationRecord'],
    hostedRequired: true,
    responsibleGate: 'Security reviewer and owner-controlled hosted RLS validation',
    nextAction: {
      local: 'Restore the database policy test evidence before proceeding.',
      hosted: 'Run the owner-controlled hosted RLS suite after API and realtime validation.',
      accepted: 'Attach the reviewed hosted RLS result to the deployment record.',
    },
  },
  {
    id: 'asset-readiness',
    label: 'Asset Readiness',
    summary:
      'V1 and the unpublished V2 candidate are both represented by local immutable manifests and prior local validation evidence.',
    localEvidence: ['v1Manifest', 'v2Manifest', 'phase12dValidation'],
    attestationEvidence: ['ownerAcceptanceRecord'],
    ownerRequired: true,
    responsibleGate: 'Owner visual acceptance',
    nextAction: {
      local: 'Regenerate and validate both manifests before owner review.',
      owner:
        'Review exact V1/V2 media, fallbacks, scale, anchors, originality, and classification; do not activate V2.',
      accepted: 'Keep V1 active until a separately protected activation decision is approved.',
    },
  },
  {
    id: 'world-readiness',
    label: 'World Readiness',
    summary:
      'Phase 12E composition, collision, depth, and candidate-world evidence must be recorded as one integrated local result.',
    localEvidence: ['phase12eValidation'],
    attestationEvidence: ['ownerAcceptanceRecord'],
    ownerRequired: true,
    responsibleGate: 'World engineering evidence followed by owner world review',
    nextAction: {
      local: 'Complete and record the Phase 12E Lantern Square and World Composer validation.',
      owner:
        'Review composition, routes, landmarks, collisions, depth sorting, and unchanged V1 play.',
      accepted:
        'Preserve the reviewed immutable candidate revision for a later publication decision.',
    },
  },
  {
    id: 'gameplay-readiness',
    label: 'Gameplay Readiness',
    summary:
      'The integrated farming, workstation, store, progression, housing, social, and recovery scenario needs Phase 12E evidence.',
    localEvidence: ['phase12eValidation'],
    attestationEvidence: ['ownerAcceptanceRecord'],
    ownerRequired: true,
    responsibleGate: 'Gameplay engineering evidence followed by owner walkthrough',
    nextAction: {
      local: 'Run and record the nonpersistent integrated Game Test beta scenario.',
      owner:
        'Complete the signed-in farming-through-home-visit walkthrough without hosted mutation.',
      accepted: 'Record the exact reviewed revision and unresolved gameplay observations.',
    },
  },
  {
    id: 'realtime-readiness',
    label: 'Realtime Readiness',
    summary:
      'Realtime tests exist in the repository, but Phase 12E recovery, load, and soak evidence is not yet consolidated.',
    localEvidence: ['realtimeTests', 'phase12eValidation'],
    attestationEvidence: ['hostedValidationRecord'],
    hostedRequired: true,
    responsibleGate: 'Realtime engineering, then owner-controlled hosted readiness',
    nextAction: {
      local:
        'Run the bounded local load, reconnect, cleanup, and soak checks and record their limits.',
      hosted: 'Validate hosted realtime health and readiness after the reviewed deployment.',
      accepted: 'Confirm monitoring, rollback, and revoked-session behavior.',
    },
  },
  {
    id: 'economy-readiness',
    label: 'Economy Readiness',
    summary:
      'Local seed-contract repair evidence is present; hosted pgTAP remains explicitly pending and no economy mutation is authorized.',
    localEvidence: ['economyTests', 'hostedPgtapRepair'],
    attestationEvidence: ['hostedValidationRecord'],
    hostedRequired: true,
    responsibleGate: 'Owner-controlled hosted pgTAP and economy review',
    nextAction: {
      local: 'Restore the local economy contract evidence before proceeding.',
      hosted: 'Run the documented hosted pgTAP suite and review DUST/inventory invariants.',
      accepted:
        'Confirm no reward, token, marketplace, inventory, or DUST change entered Phase 12E.',
    },
  },
  {
    id: 'accessibility',
    label: 'Accessibility',
    summary:
      'Prior responsive, Reduced Motion, high-contrast, and modal evidence exists; owner keyboard, touch, zoom, and screen-reader review remains pending.',
    localEvidence: ['runtimeHotfix', 'runtimeHotfixOwnerReview'],
    attestationEvidence: ['ownerAcceptanceRecord'],
    ownerRequired: true,
    responsibleGate: 'Accessibility review and owner acceptance',
    nextAction: {
      local: 'Restore the hotfix accessibility evidence and unchecked review source.',
      owner:
        'Complete keyboard, screen-reader, 200% zoom, touch-target, Reduced Motion, and high-contrast review.',
      accepted: 'Attach accessibility observations to the exact candidate revision.',
    },
  },
  {
    id: 'performance',
    label: 'Performance',
    summary:
      'Prior local renderer evidence exists, but Phase 12E browser, mobile, memory, listener, and long-session measurements remain owner-review gates.',
    localEvidence: ['phase12dValidation'],
    attestationEvidence: ['ownerAcceptanceRecord'],
    ownerRequired: true,
    responsibleGate: 'Performance engineering and owner device review',
    nextAction: {
      local: 'Restore prior local performance evidence before proceeding.',
      owner:
        'Record desktop/mobile frame time, memory, listeners, asset requests, reconnect cycles, and the bounded soak result.',
      accepted:
        'Review measurements against documented local budgets without claiming production scale.',
    },
  },
  {
    id: 'owner-acceptance',
    label: 'Owner Acceptance',
    summary:
      'Owner review sources exist and are intentionally unchecked; automated evidence cannot accept them.',
    localEvidence: ['phase12dOwnerReview', 'runtimeHotfixOwnerReview'],
    attestationEvidence: ['ownerAcceptanceRecord'],
    ownerRequired: true,
    responsibleGate: 'Project owner',
    nextAction: {
      local: 'Restore the owner review sources before requesting acceptance.',
      owner:
        'Complete every applicable owner check and record reviewer, time, revision, and evidence.',
      accepted: 'Record the explicit accept, reject, or revise decision.',
    },
  },
  {
    id: 'deployment-checklist',
    label: 'Deployment Checklist',
    summary:
      'Deployment is owner-controlled and cannot proceed from a dirty worktree or before hosted and owner gates close.',
    localEvidence: ['readinessModel'],
    attestationEvidence: [
      'hostedValidationRecord',
      'ownerAcceptanceRecord',
      'productionApprovalRecord',
    ],
    hostedRequired: true,
    ownerRequired: true,
    productionApprovalRequired: true,
    responsibleGate: 'Release owner',
    blocker: (observation) => {
      if (!observation.gitStateAvailable) return 'Git state could not be inspected.';
      if (observation.diffCheckPassed === false) return 'git diff --check reports an error.';
      if (observation.dirtyPathCount > 0) {
        return `Clean Git status is not satisfied (${observation.dirtyPathCount} changed or untracked paths).`;
      }
      return null;
    },
    nextAction: {
      local: 'Restore the read-only readiness model before release preparation.',
      hosted: 'Complete the owner-controlled hosted validation sequence.',
      owner:
        'Review the exact commit, environment, migration list, walkthrough, rollback, and monitoring.',
      accepted: 'Record explicit production approval; this local page cannot grant it.',
    },
  },
  {
    id: 'rollback-checklist',
    label: 'Rollback Checklist',
    summary:
      'Non-destructive rollback procedures are prepared locally but remain unexecuted and owner-unaccepted.',
    localEvidence: ['readinessModel'],
    attestationEvidence: ['ownerAcceptanceRecord'],
    ownerRequired: true,
    responsibleGate: 'Release owner and service owners',
    nextAction: {
      local: 'Restore the local rollback preparation model before proceeding.',
      owner:
        'Review and drill V2, world, application, migration, realtime, and resolver rollback paths in isolation.',
      accepted: 'Attach drill evidence and name the decision owner for every rollback path.',
    },
  },
] as const;

function missingEvidence(
  observation: BetaReadinessObservation,
  keys: readonly BetaReadinessEvidenceKey[],
): readonly BetaReadinessEvidenceKey[] {
  return keys.filter((key) => !observation.evidence[key].recognized);
}

function gateStatus(
  policy: GatePolicy,
  observation: BetaReadinessObservation,
): BetaReadinessStatus {
  const blocker = policy.blocker?.(observation) ?? null;
  if (blocker !== null) return 'Blocked';
  if (missingEvidence(observation, policy.localEvidence).length > 0) return 'Not Started';
  if (policy.hostedRequired && !observation.hostedValidationRecorded) {
    return 'Hosted Validation Pending';
  }
  if (policy.ownerRequired && !observation.ownerAcceptanceRecorded) return 'Owner Review Pending';
  if (policy.productionApprovalRequired) {
    return observation.productionApprovalRecorded ? 'Production Ready' : 'Accepted';
  }
  if (policy.ownerRequired && observation.ownerAcceptanceRecorded) return 'Accepted';
  return 'Local Evidence Ready';
}

function nextAction(
  policy: GatePolicy,
  status: BetaReadinessStatus,
  observation: BetaReadinessObservation,
): string {
  if (status === 'Blocked') return policy.blocker?.(observation) ?? policy.nextAction.local;
  if (status === 'Not Started') return policy.nextAction.local;
  if (status === 'Hosted Validation Pending') {
    return policy.nextAction.hosted ?? policy.nextAction.local;
  }
  if (status === 'Owner Review Pending') return policy.nextAction.owner ?? policy.nextAction.local;
  if (status === 'Accepted')
    return policy.nextAction.accepted ?? 'Prepare the next protected gate.';
  if (status === 'Production Ready')
    return 'Continue monitored operation and retain rollback evidence.';
  return policy.nextAction.owner ?? policy.nextAction.hosted ?? 'Preserve the local evidence.';
}

function buildGate(policy: GatePolicy, observation: BetaReadinessObservation): ReadinessGate {
  const status = gateStatus(policy, observation);
  return {
    id: policy.id,
    label: policy.label,
    summary: policy.summary,
    status,
    evidence: [...policy.localEvidence, ...(policy.attestationEvidence ?? [])].map(
      (key) => observation.evidence[key],
    ),
    lastCheckedAt: observation.checkedAt,
    environment: 'Local repository',
    responsibleGate: policy.responsibleGate,
    blockingReason: status === 'Blocked' ? (policy.blocker?.(observation) ?? null) : null,
    nextAction: nextAction(policy, status, observation),
  };
}

function overallStatus(
  gates: readonly ReadinessGate[],
  observation: BetaReadinessObservation,
): BetaReadinessStatus {
  const statuses = new Set(gates.map(({ status }) => status));
  if (statuses.has('Blocked')) return 'Blocked';
  if (statuses.has('Not Started')) return 'Not Started';
  if (statuses.has('Hosted Validation Pending')) return 'Hosted Validation Pending';
  if (statuses.has('Owner Review Pending')) return 'Owner Review Pending';
  if (observation.productionApprovalRecorded) return 'Production Ready';
  if (observation.ownerAcceptanceRecorded || statuses.has('Accepted')) return 'Accepted';
  return 'Local Evidence Ready';
}

function evidenceState(
  observation: BetaReadinessObservation,
  key: BetaReadinessEvidenceKey,
): AutomatedEvidenceItem['state'] {
  return observation.evidence[key].recognized ? 'Recorded' : 'Pending';
}

function automatedEvidence(
  observation: BetaReadinessObservation,
): readonly AutomatedEvidenceItem[] {
  return [
    {
      id: 'phase12d-local-gates',
      label: 'Prior Phase 12D local validation',
      state: evidenceState(observation, 'phase12dValidation'),
      source: BETA_READINESS_EVIDENCE_PATHS.phase12dValidation,
      note: 'Prior evidence only; it does not replace a Phase 12E exact-worktree rerun.',
    },
    {
      id: 'phase12e-local-gates',
      label: 'Exact Phase 12E local validation',
      state: evidenceState(observation, 'phase12eValidation'),
      source: BETA_READINESS_EVIDENCE_PATHS.phase12eValidation,
      note: 'Pending until the required local command and browser matrix is recorded.',
    },
    {
      id: 'v1-manifest',
      label: 'V1 published-default manifest present',
      state: evidenceState(observation, 'v1Manifest'),
      source: BETA_READINESS_EVIDENCE_PATHS.v1Manifest,
      note: 'File presence is repository evidence, not hosted runtime verification.',
    },
    {
      id: 'v2-manifest',
      label: 'V2 unpublished candidate manifest present',
      state: evidenceState(observation, 'v2Manifest'),
      source: BETA_READINESS_EVIDENCE_PATHS.v2Manifest,
      note: 'Presence does not activate or approve the candidate.',
    },
    {
      id: 'pgtap-repair',
      label: 'Hosted pgTAP seed-contract repair documented locally',
      state: evidenceState(observation, 'hostedPgtapRepair'),
      source: BETA_READINESS_EVIDENCE_PATHS.hostedPgtapRepair,
      note: 'The repository report explicitly keeps the actual hosted rerun pending.',
    },
    {
      id: 'git-diff-check',
      label: 'Repository whitespace/error check',
      state:
        observation.diffCheckPassed === null
          ? 'Pending'
          : observation.diffCheckPassed
            ? 'Recorded'
            : 'Blocked',
      source: 'git diff --check (read-only)',
      note:
        observation.diffCheckPassed === null
          ? 'Git did not return a readable result.'
          : observation.diffCheckPassed
            ? 'The read-only check passed at snapshot time.'
            : 'Resolve the reported diff error before release preparation.',
    },
  ];
}

const OWNER_CHECK_LABELS = [
  'World Composer',
  'Onboarding',
  'Farming',
  'Cooking',
  'Crafting',
  'General Store',
  'DUST',
  'Progression',
  'Housing',
  'Home visits',
  'V2 assets',
  'V2 character',
  'HUD',
  'Modals',
  'Reconnect',
  'Mobile',
  'Accessibility',
  'Admin Portal',
  'Game Test',
  'Rollback',
] as const;

function ownerAcceptance(): readonly OwnerAcceptanceItem[] {
  return OWNER_CHECK_LABELS.map((label) => ({
    id: label.toLowerCase().replaceAll(' ', '-'),
    label,
    accepted: false,
    note: 'Owner check intentionally unmarked; automated evidence cannot accept this item.',
  }));
}

function deploymentChecklist(
  observation: BetaReadinessObservation,
): readonly DeploymentReadinessItem[] {
  const priorLocalEvidence = observation.evidence.phase12dValidation.recognized;
  const dirty = !observation.gitStateAvailable || observation.dirtyPathCount > 0;
  return [
    {
      id: 'clean-git',
      label: 'Clean Git status',
      kind: 'Automated',
      state: dirty ? 'Blocked' : 'Ready',
      note: dirty
        ? `${observation.dirtyPathCount} changed or untracked paths are currently present.`
        : 'Read-only Git inspection found no changed or untracked paths.',
    },
    {
      id: 'reviewed-commit',
      label: 'Reviewed commit identity',
      kind: 'Owner',
      state: 'Pending',
      note: 'No commit, review, or release approval is inferred by this page.',
    },
    {
      id: 'migration-list',
      label: 'Migration list',
      kind: 'Owner',
      state: 'Pending',
      note: 'Owner must review the exact forward-only migration list.',
    },
    {
      id: 'migration-dry-run',
      label: 'Migration dry run',
      kind: 'Owner',
      state: 'Pending',
      note: 'Run only the documented non-mutating dry-run workflow against the verified target.',
    },
    {
      id: 'hosted-lint',
      label: 'Hosted database lint',
      kind: 'Hosted',
      state: 'Pending',
      note: 'Owner-controlled hosted lint has no recorded Phase 12E result.',
    },
    {
      id: 'hosted-pgtap',
      label: 'Hosted pgTAP',
      kind: 'Hosted',
      state: 'Pending',
      note: 'The seed-contract repair report explicitly records the hosted rerun as pending.',
    },
    {
      id: 'hosted-rls',
      label: 'Hosted RLS',
      kind: 'Hosted',
      state: 'Pending',
      note: 'Run after the reviewed API and realtime candidate is available.',
    },
    {
      id: 'environment',
      label: 'Environment validation',
      kind: 'Automated',
      state: priorLocalEvidence ? 'Ready' : 'Pending',
      note: 'Ready means prior local evidence exists; hosted environment validation is separate.',
    },
    {
      id: 'build',
      label: 'Application build',
      kind: 'Automated',
      state: priorLocalEvidence ? 'Ready' : 'Pending',
      note: 'Prior Phase 12D result only; rerun on the exact Phase 12E candidate.',
    },
    {
      id: 'security-scan',
      label: 'Security scan',
      kind: 'Automated',
      state: priorLocalEvidence ? 'Ready' : 'Pending',
      note: 'Prior Phase 12D result only; rerun on the exact Phase 12E candidate.',
    },
    {
      id: 'application-deployment',
      label: 'Application deployment',
      kind: 'Owner',
      state: 'Pending',
      note: 'No deployment is authorized or performed by this readiness area.',
    },
    {
      id: 'api-health',
      label: 'API health and readiness',
      kind: 'Hosted',
      state: 'Pending',
      note: 'Validate only after an owner-controlled reviewed deployment.',
    },
    {
      id: 'realtime-health',
      label: 'Realtime health and readiness',
      kind: 'Hosted',
      state: 'Pending',
      note: 'Validate only after an owner-controlled reviewed deployment.',
    },
    {
      id: 'worker-health',
      label: 'Worker health',
      kind: 'Hosted',
      state: 'Pending',
      note: 'Validate only after an owner-controlled reviewed deployment.',
    },
    {
      id: 'signed-in-walkthrough',
      label: 'Signed-in walkthrough',
      kind: 'Owner',
      state: 'Pending',
      note: 'Must cover the exact candidate without modifying hosted player or economy data.',
    },
    {
      id: 'v1-verification',
      label: 'V1 published-default verification',
      kind: 'Owner',
      state: 'Pending',
      note: 'Confirm normal play still resolves the immutable V1 default.',
    },
    {
      id: 'v2-decision',
      label: 'V2 activation decision',
      kind: 'Owner',
      state: 'Pending',
      note: 'V2 remains inactive; activation requires a separate protected decision.',
    },
    {
      id: 'rollback-readiness',
      label: 'Rollback readiness',
      kind: 'Owner',
      state: 'Pending',
      note: 'Review the six non-destructive rollback paths and attach drill evidence.',
    },
    {
      id: 'monitoring',
      label: 'Monitoring and escalation',
      kind: 'Owner',
      state: 'Pending',
      note: 'Name service owners, alerts, thresholds, and escalation paths before production approval.',
    },
  ];
}

function rollbackChecklist(): readonly RollbackPreparation[] {
  const protectedData = [
    'inventory',
    'DUST',
    'progression',
    'housing',
    'social data',
    'audit history',
  ];
  return [
    {
      id: 'v2-activation',
      label: 'V2 visual activation',
      prepared: true,
      ownerAccepted: false,
      procedure:
        'Use the narrow authoritative activation path to restore the reviewed V1 version and verify immutable pins; never use a public query override.',
      preserves: protectedData,
    },
    {
      id: 'world-publication',
      label: 'World publication',
      prepared: true,
      ownerAccepted: false,
      procedure:
        'Select the prior immutable published world revision through the versioned rollback path; do not delete or overwrite history.',
      preserves: protectedData,
    },
    {
      id: 'application-deployment',
      label: 'Application deployment',
      prepared: true,
      ownerAccepted: false,
      procedure:
        'Redeploy the previous reviewed artifact, validate service health, then complete a signed-in V1 walkthrough.',
      preserves: protectedData,
    },
    {
      id: 'database-migration',
      label: 'Database migration',
      prepared: true,
      ownerAccepted: false,
      procedure:
        'Use a reviewed forward-fix migration when required; never run a destructive down migration or erase history.',
      preserves: protectedData,
    },
    {
      id: 'realtime-deployment',
      label: 'Realtime deployment',
      prepared: true,
      ownerAccepted: false,
      procedure:
        'Restore the previous compatible realtime artifact, validate admission/readiness, and confirm one clean reconnect per session.',
      preserves: protectedData,
    },
    {
      id: 'asset-resolver',
      label: 'Asset resolver regression',
      prepared: true,
      ownerAccepted: false,
      procedure:
        'Restore the reviewed resolver artifact and V1 delivery path while preserving stable keys, collision, interaction, and immutable pins.',
      preserves: protectedData,
    },
  ];
}

export function buildBetaReadinessSnapshot(
  observation: BetaReadinessObservation,
): BetaReadinessSnapshot {
  const gates = GATE_POLICIES.map((policy) => buildGate(policy, observation));
  return {
    checkedAt: observation.checkedAt,
    repository: {
      root: observation.repositoryRoot,
      branch: observation.branch,
      revision: observation.revision,
      gitStateAvailable: observation.gitStateAvailable,
      dirtyPathCount: observation.dirtyPathCount,
      diffCheckPassed: observation.diffCheckPassed,
    },
    overallStatus: overallStatus(gates, observation),
    gates,
    automatedEvidence: automatedEvidence(observation),
    ownerAcceptance: ownerAcceptance(),
    deploymentChecklist: deploymentChecklist(observation),
    rollbackChecklist: rollbackChecklist(),
  };
}
