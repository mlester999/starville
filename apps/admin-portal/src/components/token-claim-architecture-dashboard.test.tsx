// PHASE9BA_NONFUNCTIONAL_SECURITY_FIXTURE: security-shaped text is inert test evidence.
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  CLAIM_MODEL_COMPARISONS,
  THREAT_SUMMARIES,
  TRUST_BOUNDARIES,
  TokenClaimArchitectureDashboard,
} from './token-claim-architecture-dashboard';

const markup = renderToStaticMarkup(createElement(TokenClaimArchitectureDashboard));
const routeSource = readFileSync(
  new URL('../app/(protected)/economy/token-claims/page.tsx', import.meta.url),
  'utf8',
);
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

describe('Phase 9B-A token claim architecture dashboard', () => {
  it('keeps every live token-claim boundary prominently disabled', () => {
    for (const boundary of [
      'TOKEN CLAIMS DISABLED',
      'PHASE 9B-A ARCHITECTURE MODE',
      'NO ON-CHAIN TRANSFERS ARE ACTIVE',
      'NO TREASURY SIGNER IS CONNECTED',
      'NO PLAYER CLAIM ACTION EXISTS',
    ]) {
      expect(markup).toContain(boundary);
    }
    expect(markup).toContain('Recommendation pending owner, security, treasury, and legal review');
  });

  it('renders every required architecture section without mutation controls', () => {
    for (const heading of [
      'Architecture Overview',
      'Claim Model Comparison',
      'Threat Model Summary',
      'Trust Boundaries',
      'Eligibility Model',
      'Claim State Machine',
      'Treasury Policy Draft',
      'Reserve Simulation',
      'Claim Simulation',
      'Quarantine Model',
      'Dispute Model',
      'Security Checklist',
      'Unresolved Owner Decisions',
    ]) {
      expect(markup).toContain(`>${heading}<`);
    }

    expect(markup).not.toMatch(/<(?:button|form|input|select|textarea)\b/iu);
    expect(markup).not.toMatch(/<(?:input|textarea)[^>]*(?:private|secret|seed)/iu);
    expect(markup).not.toMatch(/Claim Now|Earn STAR|Cash Out|Withdraw|Approve Token/iu);
  });

  it('uses only the existing read permission and has no API, action, or persistence boundary', () => {
    expect(routeSource).toContain("requireAuthorizedAdmin('economy.read')");
    expect(routeSource).not.toMatch(/fetch\(|economy-api|app\/actions|action=/u);
    expect(routeSource).not.toMatch(/signTransaction|sendTransaction|sendRawTransaction/u);
  });

  it('compares all five future models and keeps the preferred direction unapproved', () => {
    expect(CLAIM_MODEL_COMPARISONS).toHaveLength(5);
    expect(markup).toContain('Backend-controlled hot wallet');
    expect(markup).toContain('Multisig treasury with backend-built transactions');
    expect(markup).toContain('Dedicated claim program with signed authorization');
    expect(markup).toContain('Epoch Merkle distributor');
    expect(markup).toContain('Third-party custodial payout service');
    expect(markup).toContain('Preferred future direction — pending review');
    expect(markup).not.toContain('Approved future direction');
  });

  it('labels every fixture and offline result without presenting a live treasury', () => {
    expect(markup).toContain('Fixture token balance');
    expect(markup).toContain('Offline Simulation');
    expect(markup).toContain('deterministic fixtures');
    expect(markup).toContain('not a real treasury');
    expect(markup).toContain('Blockchain calls');
    expect(markup).toContain('>0<');
    expect(markup).not.toMatch(/Live treasury balance|Connected treasury wallet/iu);
  });

  it('uses semantic, mobile-adaptable tables and visible text statuses', () => {
    expect(markup.match(/<caption>/gu)).toHaveLength(3);
    expect(markup).toContain('role="region"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('scope="col"');
    expect(markup).toContain('scope="row"');
    expect(markup).toContain('data-label="Residual risk"');
    expect(markup).toContain('aria-label="Phase 9B-A offline mock states"');
    expect(markup).toContain('Mock state');
    expect(styles).toContain('.token-claim-disabled-banner');
    expect(styles).toContain('.token-claim-table-region:focus-visible');
    expect(styles).toMatch(/@media \(max-width: 820px\)[\s\S]*\.token-claim-table/u);
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('covers all threat and trust categories without granting signer authority', () => {
    expect(THREAT_SUMMARIES.map((threat) => threat.category)).toEqual([
      'Player and wallet',
      'Gameplay and eligibility',
      'Application and infrastructure',
      'Blockchain and treasury',
    ]);
    expect(TRUST_BOUNDARIES).toHaveLength(6);
    expect(markup).toContain('sign treasury transactions');
    expect(markup).toContain('no implementation or connection exists');
  });
});
