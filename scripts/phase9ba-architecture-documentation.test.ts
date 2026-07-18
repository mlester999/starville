// PHASE9BA_NONFUNCTIONAL_SECURITY_FIXTURE: security-shaped text is inert test evidence.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  CANONICAL_AUTHORIZATION_FIELDS,
  CLAIM_STATE_TRANSITIONS,
  PHASE_9B_A_CLAIM_STATES,
} from '@starville/token-claim-architecture';

const threatModel = readFileSync(
  new URL('../docs/security/phase-9ba-token-claim-threat-model.md', import.meta.url),
  'utf8',
);
const architectureDecision = readFileSync(
  new URL('../docs/architecture/phase-9ba-token-claim-adr.md', import.meta.url),
  'utf8',
);
const disabledFoundation = readFileSync(
  new URL('../docs/architecture/phase-9ba-disabled-claim-foundation.md', import.meta.url),
  'utf8',
);
const treasuryControls = readFileSync(
  new URL('../docs/architecture/phase-9ba-treasury-controls.md', import.meta.url),
  'utf8',
);
const incidentResponse = readFileSync(
  new URL('../docs/security/phase-9ba-incident-response.md', import.meta.url),
  'utf8',
);
const currentWalletAssessment = readFileSync(
  new URL('../docs/architecture/phase-9ba-current-solana-wallet-access.md', import.meta.url),
  'utf8',
);
const keyRotation = readFileSync(
  new URL('../docs/deployment/phase-9ba-key-rotation.md', import.meta.url),
  'utf8',
);
const legalAndEntryGate = readFileSync(
  new URL('../docs/deployment/phase-9ba-legal-compliance-and-phase-9bb-gate.md', import.meta.url),
  'utf8',
);

const REQUIRED_THREATS = [
  'Stolen wallet',
  'Compromised browser',
  'Phishing',
  'Fake Starville domain',
  'Stolen session',
  'Duplicate sessions',
  'Replayed wallet signature',
  'Wallet-address substitution',
  'Wallet change during pending claim',
  'Malicious browser payload',
  'Forged claim amount',
  'Forged recipient',
  'Forged mint',
  'Wrong network',
  'Forged activity completion',
  'Duplicate activity receipt',
  'Manipulated contribution',
  'Repeated reward request',
  'Replayed eligibility receipt',
  'Modified economy receipt',
  'Administrative correction abuse',
  'Multi-account farming',
  'Wallet rotation farming',
  'Party collusion',
  'Repeated reconnect exploitation',
  'Reward-cap bypass',
  'Compromised API',
  'Compromised realtime server',
  'Compromised worker',
  'Compromised database service account',
  'Compromised administrator',
  'Permission escalation',
  'Leaked service-role credential',
  'Insecure logs',
  'Malicious deployment',
  'Supply-chain compromise',
  'Incorrect environment configuration',
  'Treasury key compromise',
  'Signer compromise',
  'Malicious signer',
  'Wrong mint',
  'Wrong decimals',
  'Wrong destination token account',
  'Token-2022 extension incompatibility',
  'Frozen account',
  'Transfer-fee extension',
  'Transfer-hook extension',
  'Non-transferable token',
  'Insufficient SOL fees',
  'Treasury reserve depletion',
  'Stale blockhash',
  'RPC provider compromise',
  'RPC provider disagreement',
  'Duplicate transaction submission',
  'Transaction confirmation ambiguity',
  'Chain reorganization',
  'Partial outage',
] as const;

const REQUIRED_THREAT_FIELDS = [
  'Threat description',
  'Affected assets',
  'Likelihood',
  'Impact',
  'Prevention',
  'Detection',
  'Response',
  'Residual risk',
  'Owner decision required',
] as const;

const REQUIRED_INCIDENT_RUNBOOKS = [
  'Suspected treasury signer compromise',
  'Suspected authorization-key compromise',
  'Administrator compromise',
  'Duplicate claim incident',
  'Wrong recipient configuration',
  'Wrong mint configuration',
  'Wrong network configuration',
  'Token reserve depletion',
  'SOL fee depletion',
  'RPC outage',
  'RPC disagreement',
  'Claim database mismatch',
  'Replay attack',
  'Eligibility forgery',
  'Emergency pause',
  'Dispute surge',
  'Sensitive-data exposure',
  'Rollback unpublished configuration',
] as const;

interface ThreatSection {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

function normalizedProse(markdown: string): string {
  return markdown.replace(/^>\s?/gmu, '').replace(/\s+/gu, ' ').trim();
}

function markdownTableContainsFirstCell(markdown: string, expected: string): boolean {
  return markdown
    .split('\n')
    .filter((line) => line.trimStart().startsWith('|'))
    .some((line) => line.split('|')[1]?.trim() === expected);
}

function documentedMockTransitions(markdown: string): readonly string[] {
  return markdown.split('\n').flatMap((line) => {
    const match = /^\| `([^`]+)`\s+\| `([^`]+)`/u.exec(line);
    return match === null ? [] : [`${match[1]}->${match[2]}`];
  });
}

function threatSections(markdown: string): readonly ThreatSection[] {
  return markdown
    .split(/^### /mu)
    .slice(1)
    .flatMap((section) => {
      const newline = section.indexOf('\n');
      const heading = newline === -1 ? section : section.slice(0, newline);
      const match = /^(PW|GE|AI|BT)-(\d{2}) — (.+)$/u.exec(heading);
      return match === null
        ? []
        : [
            {
              id: `${match[1]}-${match[2]}`,
              title: match[3] ?? '',
              body: newline === -1 ? '' : section.slice(newline + 1),
            },
          ];
    });
}

describe('Phase 9B-A architecture documentation', () => {
  it('contains the complete closed threat inventory exactly once', () => {
    const sections = threatSections(threatModel);
    expect(sections).toHaveLength(57);
    expect(new Set(sections.map((section) => section.id)).size).toBe(57);
    expect(sections.map((section) => section.title)).toEqual(REQUIRED_THREATS);
  });

  it('documents every required treatment field for every threat', () => {
    for (const section of threatSections(threatModel)) {
      for (const field of REQUIRED_THREAT_FIELDS) {
        expect(section.body, `${section.id} is missing ${field}`).toContain(`- **${field}:**`);
      }
    }
  });

  it('keeps the threat model explicitly disabled and unapproved', () => {
    const prose = normalizedProse(threatModel);
    expect(prose).toContain('Token claims are disabled');
    expect(prose).toContain('creates no signer');
    expect(prose).toContain('or database migration');
    expect(prose).toContain('pending owner, security, treasury, and legal approval');
  });

  it('compares every required architecture criterion and leaves the recommendation unresolved', () => {
    for (const model of [
      'Backend-controlled hot-wallet transfers',
      'Multisig-controlled treasury with backend-created transactions',
      'Dedicated on-chain claim program using signed authorizations',
      'Epoch-based Merkle distributor',
      'Third-party custodial payout service',
    ]) {
      expect(architectureDecision).toContain(model);
    }
    for (const criterion of [
      'Custody risk',
      'Hot-wallet compromise',
      'Private-key exposure',
      'Application-server compromise',
      'Replay resistance',
      'Exactly-once settlement',
      'Recipient binding',
      'Amount binding',
      'Mint binding',
      'Network binding',
      'Authorization expiry',
      'Auditability',
      'Transaction cost',
      'Scalability',
      'Token-account creation',
      'Token-2022 compatibility',
      'Multisig compatibility',
      'Operational burden',
      'Signer rotation',
      'Treasury rotation',
      'Emergency pause',
      'Dispute handling',
      'Failed-transaction recovery',
      'Confirmation ambiguity',
      'Legal/compliance burden',
      'Geographic restrictions',
      'Player experience',
      'Maintenance requirements',
    ]) {
      expect(architectureDecision).toContain(criterion);
    }
    expect(architectureDecision).toContain(
      'Recommendation pending owner, security, treasury, and legal review.',
    );
    expect(architectureDecision).toContain('No recommendation in this ADR is approved');
  });

  it('documents every requested monitoring metric and alert without connecting monitoring', () => {
    for (const metric of [
      'claim_intent_attempts_total',
      'claim_duplicate_attempts_total',
      'claim_eligibility_rejections_total',
      'claim_wallet_mismatch_total',
      'claim_wrong_mint_attempts_total',
      'claim_wrong_network_attempts_total',
      'claim_quarantine_total',
      'claim_authorizations_total',
      'claim_authorization_expiry_total',
      'claim_cap_rejections_total',
      'claim_reserve_rejections_total',
      'claim_signer_disabled_attempts_total',
      'claim_disputes_total',
      'claim_simulation_duration_seconds',
      'claim_fixture_fee_units_total',
    ]) {
      expect(disabledFoundation).toContain(metric);
    }
    for (const alert of [
      'Treasury token reserve low',
      'SOL fee reserve low',
      'Duplicate spike',
      'Quarantine spike',
      'Authorization spike',
      'Wrong-network spike',
      'RPC disagreement',
      'Signer unavailable',
      'Database mismatch',
      'Audit failure',
    ]) {
      expect(disabledFoundation).toContain(alert);
    }
    expect(disabledFoundation).toContain('connects no external monitoring');
  });

  it('covers every incident runbook and keeps all exercises synthetic', () => {
    for (const runbook of REQUIRED_INCIDENT_RUNBOOKS) {
      expect(incidentResponse).toContain(`— ${runbook}`);
    }
    expect(incidentResponse.match(/^### IR-\d{2} — /gmu)).toHaveLength(18);
    const prose = normalizedProse(incidentResponse);
    expect(prose).toContain('synthetic fixtures only');
    expect(prose).toContain('creates no signer, key, transaction');
  });

  it('documents the closed epoch registry and full Token-2022 review boundary', () => {
    for (const state of [
      'draft',
      'calculating',
      'review',
      'approved',
      'active',
      'paused',
      'completed',
      'expired',
      'cancelled',
    ]) {
      expect(treasuryControls).toMatch(new RegExp(`^- ${state}(?:;(?: and)?|\\.)$`, 'mu'));
    }
    for (const compatibilityItem of [
      'Decimals',
      'Transfer fee configuration',
      'Withheld transfer fees',
      'Transfer hook',
      'Permanent delegate',
      'Confidential transfer',
      'Default account state',
      'Frozen mint or token account',
      'Non-transferable extension',
      'Interest-bearing configuration',
      'Required transfer memo',
      'Metadata pointer and metadata authority',
      'Token-account ownership',
      'Associated token account behavior',
    ]) {
      expect(markdownTableContainsFirstCell(treasuryControls, compatibilityItem)).toBe(true);
    }
  });

  it('keeps documented mock states, transitions, and canonical payload order aligned to code', () => {
    for (const state of PHASE_9B_A_CLAIM_STATES) {
      expect(disabledFoundation).toContain(`\`${state}\``);
    }
    const expectedTransitions = Object.entries(CLAIM_STATE_TRANSITIONS).flatMap(
      ([from, destinations]) => destinations.map((destination) => `${from}->${destination}`),
    );
    expect([...documentedMockTransitions(disabledFoundation)].sort()).toEqual(
      [...expectedTransitions].sort(),
    );

    const documentedCanonicalFields = disabledFoundation
      .split('\n')
      .flatMap((line) => /^\d+\. `([^`]+)`$/u.exec(line)?.[1] ?? []);
    expect(documentedCanonicalFields).toEqual(CANONICAL_AUTHORIZATION_FIELDS);
  });

  it('grounds current wallet access in the implemented server-authoritative boundaries', () => {
    for (const requiredBoundary of [
      'Reown AppKit boundary',
      'Network and genesis enforcement',
      'Mint, token program, decimals, and threshold',
      'Server-authoritative balance reads',
      'Wallet ownership message and replay resistance',
      'Session creation and wallet-to-player binding',
      'Freshness, rotation, and revocation',
      'RPC timeout and retry behavior',
    ]) {
      expect(currentWalletAssessment).toContain(requiredBoundary);
    }
    expect(normalizedProse(currentWalletAssessment)).toContain(
      'It does not perform a hosted database read, contact a Solana RPC, inspect a live mint, connect a wallet',
    );
  });

  it('covers every required rotation ceremony without creating a key', () => {
    for (const rotationBoundary of [
      'Claim authorization-key rotation',
      'Treasury-authority rotation',
      'Multisig participant rotation',
      'RPC credential rotation',
      'Program upgrade-authority rotation',
      'Revocation semantics',
      'Overlap rule',
      'Old authorization expiry',
      'Emergency compromise rotation',
      'Evidence record',
    ]) {
      expect(keyRotation).toContain(rotationBoundary);
    }
    expect(normalizedProse(keyRotation)).toContain(
      'does not generate, import, store, rotate, revoke, or use a live key or credential',
    );
  });

  it('keeps every legal area unresolved and the Phase 9B-B gate unchecked', () => {
    for (const legalArea of [
      'Jurisdiction',
      'Token reward characterization',
      'Consumer disclosures',
      'Sanctions',
      'Age restrictions',
      'Tax',
      'Contest and promotion',
      'Custody',
      'Money transmission',
      'Privacy',
      'Disputes',
      'Terms',
      'Risk disclosure',
      'Geographic restrictions',
      'Retention',
      'Treasury governance',
    ]) {
      expect(markdownTableContainsFirstCell(legalAndEntryGate, legalArea)).toBe(true);
    }
    expect(legalAndEntryGate).toContain('Qualified legal review is required before token payouts');
    expect(legalAndEntryGate).not.toContain('- [x]');
    expect(legalAndEntryGate.match(/^- \[ \] /gmu)).toHaveLength(19);
    expect(legalAndEntryGate).toContain('Phase 9B-B must not start');
  });
});
