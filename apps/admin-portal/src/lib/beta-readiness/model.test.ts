import { describe, expect, it } from 'vitest';

import {
  BETA_READINESS_EVIDENCE_PATHS,
  BETA_READINESS_STATUSES,
  buildBetaReadinessSnapshot,
  type BetaReadinessEvidenceKey,
  type BetaReadinessObservation,
  type RepositoryEvidence,
} from './model';

const checkedAt = '2026-07-19T03:00:00.000Z';

function observation(
  overrides: Partial<BetaReadinessObservation> = {},
  missing: readonly BetaReadinessEvidenceKey[] = [],
): BetaReadinessObservation {
  const evidence = Object.fromEntries(
    Object.entries(BETA_READINESS_EVIDENCE_PATHS).map(([key, path]) => {
      const present = !missing.includes(key as BetaReadinessEvidenceKey);
      const record: RepositoryEvidence = {
        key: key as BetaReadinessEvidenceKey,
        label: key,
        path,
        present,
        recognized: present,
        modifiedAt: present ? checkedAt : null,
      };
      return [key, record];
    }),
  ) as unknown as Readonly<Record<BetaReadinessEvidenceKey, RepositoryEvidence>>;

  return {
    checkedAt,
    repositoryRoot: '/local/starville',
    branch: 'master',
    revision: '63a7262',
    gitStateAvailable: true,
    dirtyPathCount: 0,
    diffCheckPassed: true,
    evidence,
    hostedValidationRecorded: false,
    ownerAcceptanceRecorded: false,
    productionApprovalRecorded: false,
    ...overrides,
  };
}

describe('Beta Readiness status model', () => {
  it('exposes only the approved truthful status vocabulary', () => {
    expect(BETA_READINESS_STATUSES).toEqual([
      'Not Started',
      'Local Evidence Ready',
      'Hosted Validation Pending',
      'Owner Review Pending',
      'Blocked',
      'Accepted',
      'Production Ready',
    ]);
  });

  it('distinguishes missing local, hosted, owner, and local-only gates', () => {
    const snapshot = buildBetaReadinessSnapshot(
      observation({}, ['phase12eValidation', 'runtimeHotfix']),
    );
    const statuses = Object.fromEntries(snapshot.gates.map((gate) => [gate.id, gate.status]));

    expect(statuses['application-health']).toBe('Not Started');
    expect(statuses['database-gates']).toBe('Hosted Validation Pending');
    expect(statuses['asset-readiness']).toBe('Owner Review Pending');
    expect(statuses['accessibility']).toBe('Not Started');
    expect(snapshot.gates.every((gate) => gate.environment === 'Local repository')).toBe(true);
    expect(
      snapshot.gates.every(
        (gate) =>
          gate.evidence.length > 0 &&
          gate.lastCheckedAt === checkedAt &&
          gate.responsibleGate.length > 0 &&
          gate.nextAction.length > 0,
      ),
    ).toBe(true);
  });

  it('blocks deployment on a dirty worktree without treating other local evidence as failed', () => {
    const snapshot = buildBetaReadinessSnapshot(observation({ dirtyPathCount: 17 }));
    const deployment = snapshot.gates.find((gate) => gate.id === 'deployment-checklist');

    expect(deployment).toMatchObject({
      status: 'Blocked',
      blockingReason: 'Clean Git status is not satisfied (17 changed or untracked paths).',
    });
    expect(snapshot.overallStatus).toBe('Blocked');
    expect(snapshot.deploymentChecklist[0]).toMatchObject({
      kind: 'Automated',
      state: 'Blocked',
    });
  });

  it('requires explicit attestations before Accepted or Production Ready can appear', () => {
    const accepted = buildBetaReadinessSnapshot(
      observation({
        hostedValidationRecorded: true,
        ownerAcceptanceRecorded: true,
      }),
    );
    const production = buildBetaReadinessSnapshot(
      observation({
        hostedValidationRecorded: true,
        ownerAcceptanceRecorded: true,
        productionApprovalRecorded: true,
      }),
    );

    expect(accepted.gates.find(({ id }) => id === 'deployment-checklist')?.status).toBe('Accepted');
    expect(accepted.overallStatus).toBe('Accepted');
    expect(production.gates.find(({ id }) => id === 'deployment-checklist')?.status).toBe(
      'Production Ready',
    );
    expect(production.overallStatus).toBe('Production Ready');
  });

  it('never auto-checks owner acceptance and keeps it distinct from automated evidence', () => {
    const snapshot = buildBetaReadinessSnapshot(
      observation({
        hostedValidationRecorded: true,
        ownerAcceptanceRecorded: true,
        productionApprovalRecorded: true,
      }),
    );

    expect(snapshot.ownerAcceptance).toHaveLength(20);
    expect(snapshot.ownerAcceptance.every(({ accepted }) => accepted === false)).toBe(true);
    expect(snapshot.automatedEvidence.every((item) => 'state' in item)).toBe(true);
    expect(snapshot.ownerAcceptance.every((item) => !('state' in item))).toBe(true);
    expect(snapshot.rollbackChecklist.every(({ ownerAccepted }) => ownerAccepted === false)).toBe(
      true,
    );
  });
});
