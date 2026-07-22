import 'server-only';

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  BETA_READINESS_EVIDENCE_PATHS,
  buildBetaReadinessSnapshot,
  type BetaReadinessEvidenceKey,
  type BetaReadinessObservation,
  type BetaReadinessSnapshot,
  type RepositoryEvidence,
} from './model';

const EVIDENCE_LABELS: Readonly<Record<BetaReadinessEvidenceKey, string>> = {
  phase12dValidation: 'Phase 12D local validation report',
  runtimeHotfix: 'Phase 12D runtime integration hotfix report',
  hostedPgtapRepair: 'Hosted pgTAP seed-contract repair report',
  phase12dOwnerReview: 'Phase 12D owner review checklist',
  runtimeHotfixOwnerReview: 'Runtime hotfix owner review checklist',
  phase12eValidation: 'Phase 12E local validation report',
  phase13bValidation: 'Phase 13B local validation report',
  phase13bSecurityReview: 'Phase 13B closed-beta trust-boundary review',
  phase13bSecurityMigration: 'Phase 13B forward-only security hardening migration',
  phase13bSecurityFixture: 'Phase 13B applied-catalog security fixture',
  phase13bOperationalReadiness: 'Phase 13B operational readiness and recovery runbook',
  phase13aExactlyOnce: 'Phase 13A exact-once gameplay integration architecture',
  phase13bLoadHarness: 'Phase 13B bounded realtime load harness',
  audioManifest: 'Release-candidate procedural audio catalog',
  audioValidation: 'Release-candidate audio validation command',
  hostedValidationRecord: 'Phase 13B hosted validation record',
  ownerAcceptanceRecord: 'Phase 13B owner acceptance record',
  productionApprovalRecord: 'Phase 13B production approval record',
  v1Manifest: 'V1 bundled manifest',
  v2Manifest: 'V2 unpublished candidate manifest',
  databasePolicyTests: 'World-management database policy tests',
  realtimeTests: 'Realtime server tests',
  economyTests: 'Cozy gameplay and economy pgTAP tests',
  readinessModel: 'Beta Readiness computed model',
};

function findRepositoryRoot(start: string): string {
  let current = resolve(start);
  const filesystemRoot = parse(current).root;
  while (current !== filesystemRoot) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current;
    current = dirname(current);
  }
  return resolve(start);
}

function git(
  repositoryRoot: string,
  arguments_: readonly string[],
): { readonly ok: boolean; readonly output: string } {
  const result = spawnSync('git', arguments_, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    output: typeof result.stdout === 'string' ? result.stdout.trim() : '',
  };
}

function recognizedManifest(content: string, manifestVersion: string): boolean {
  const parsed: unknown = JSON.parse(content);
  return (
    typeof parsed === 'object' &&
    parsed !== null &&
    'manifestVersion' in parsed &&
    parsed.manifestVersion === manifestVersion &&
    'assets' in parsed &&
    Array.isArray(parsed.assets) &&
    parsed.assets.length > 0
  );
}

function recognizedEvidence(key: BetaReadinessEvidenceKey, content: string): boolean {
  if (content.trim() === '') return false;
  switch (key) {
    case 'phase12dValidation':
      return (
        content.includes('LOCAL AUTOMATED GATES PASSED') &&
        content.includes('PRODUCTION CANDIDATE, NOT FINAL')
      );
    case 'runtimeHotfix':
      return (
        content.includes('RUNTIME INTEGRATION HOTFIX LOCALLY COMPLETE') &&
        content.includes('OWNER REVIEW PENDING')
      );
    case 'hostedPgtapRepair':
      return (
        content.includes('HOSTED pgTAP SEED-CONTRACT REPAIR LOCALLY COMPLETE') &&
        content.includes('HOSTED RERUN PENDING')
      );
    case 'phase12dOwnerReview':
    case 'runtimeHotfixOwnerReview':
      return (
        content.includes('intentionally unchecked') &&
        (content.includes('Owner acceptance: pending') || content.includes('OWNER REVIEW PENDING'))
      );
    case 'phase12eValidation':
      return content.includes('PHASE 12E LOCALLY COMPLETE');
    case 'phase13bValidation':
      return content.includes('PHASE 13B LOCAL AUTOMATED VALIDATION PASSED');
    case 'phase13bSecurityReview':
      return content.includes('PHASE 13B CLOSED-BETA TRUST BOUNDARIES');
    case 'phase13bSecurityMigration':
      return (
        content.includes('force row level security') &&
        content.includes('progression_process_shop_event')
      );
    case 'phase13bSecurityFixture':
      return (
        content.includes('publicFunctionExecuteFindings') &&
        content.includes('authenticatedTableGrants')
      );
    case 'phase13bOperationalReadiness':
      return content.includes('PHASE 13B OPERATIONAL READINESS');
    case 'phase13aExactlyOnce':
      return content.includes('Exact-once') || content.includes('exact-once');
    case 'phase13bLoadHarness':
      return (
        content.includes('single-client-baseline') &&
        content.includes('split-channel-reconnect-storm') &&
        content.includes('publicCloseCheckpoints')
      );
    case 'audioManifest':
      return (
        content.includes('RELEASE_CANDIDATE_AUDIO_MANIFEST') &&
        content.includes('repository_generated_procedural_web_audio') &&
        content.includes('development_safe')
      );
    case 'audioValidation':
      return (
        content.includes('validateReleaseCandidateAudioManifest') &&
        content.includes('embeddedAudioBytes')
      );
    case 'hostedValidationRecord':
      return content.includes('PHASE 13B HOSTED VALIDATION PASSED');
    case 'ownerAcceptanceRecord':
      return content.includes('PHASE 13B OWNER ACCEPTED');
    case 'productionApprovalRecord':
      return content.includes('PHASE 13B PRODUCTION READY');
    case 'v1Manifest':
      return recognizedManifest(content, '1.0.0');
    case 'v2Manifest':
      return recognizedManifest(content, '2.0.0');
    case 'databasePolicyTests':
    case 'economyTests':
      return /select\s+plan\(\d+\)/iu.test(content);
    case 'realtimeTests':
      return content.includes("describe('real-time service foundation'");
    case 'readinessModel':
      return (
        content.includes('BETA_READINESS_STATUSES') &&
        content.includes("'Production Ready'") &&
        content.includes('ownerAccepted: false')
      );
  }
}

function repositoryEvidence(
  repositoryRoot: string,
): Readonly<Record<BetaReadinessEvidenceKey, RepositoryEvidence>> {
  return Object.fromEntries(
    Object.entries(BETA_READINESS_EVIDENCE_PATHS).map(([key, path]) => {
      const evidenceKey = key as BetaReadinessEvidenceKey;
      const absolutePath = join(repositoryRoot, path);
      const present = existsSync(absolutePath);
      let recognized = false;
      let modifiedAt: string | null = null;
      if (present) {
        try {
          modifiedAt = statSync(absolutePath).mtime.toISOString();
          recognized = recognizedEvidence(evidenceKey, readFileSync(absolutePath, 'utf8'));
        } catch {
          recognized = false;
        }
      }
      const evidence: RepositoryEvidence = {
        key: evidenceKey,
        label: EVIDENCE_LABELS[evidenceKey],
        path,
        present,
        recognized,
        modifiedAt,
      };
      return [key, evidence];
    }),
  ) as unknown as Readonly<Record<BetaReadinessEvidenceKey, RepositoryEvidence>>;
}

export function observeLocalBetaReadiness(
  startDirectory = process.cwd(),
  checkedAt = new Date().toISOString(),
): BetaReadinessObservation {
  const repositoryRoot = findRepositoryRoot(startDirectory);
  const branch = git(repositoryRoot, ['branch', '--show-current']);
  const revision = git(repositoryRoot, ['rev-parse', '--short=12', 'HEAD']);
  const status = git(repositoryRoot, ['status', '--short']);
  const diffCheck = git(repositoryRoot, ['diff', '--check']);
  const dirtyPathCount =
    status.ok && status.output !== ''
      ? status.output.split('\n').filter((line) => line.trim() !== '').length
      : 0;

  const evidence = repositoryEvidence(repositoryRoot);
  return {
    checkedAt,
    repositoryRoot,
    branch: branch.ok && branch.output !== '' ? branch.output : null,
    revision: revision.ok && revision.output !== '' ? revision.output : null,
    gitStateAvailable: branch.ok && revision.ok && status.ok,
    dirtyPathCount,
    diffCheckPassed: diffCheck.ok,
    evidence,
    hostedValidationRecorded: evidence.hostedValidationRecord.recognized,
    ownerAcceptanceRecorded: evidence.ownerAcceptanceRecord.recognized,
    productionApprovalRecorded: evidence.productionApprovalRecord.recognized,
  };
}

export function loadLocalBetaReadiness(): BetaReadinessSnapshot {
  return buildBetaReadinessSnapshot(observeLocalBetaReadiness());
}
