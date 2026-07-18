import { MetricCard, StatusChip } from './economy-admin-ui';

interface ClaimModelComparison {
  readonly model: string;
  readonly custody: string;
  readonly replayBoundary: string;
  readonly operations: string;
  readonly disposition: string;
}

interface ThreatSummary {
  readonly category: string;
  readonly examples: string;
  readonly prevention: string;
  readonly response: string;
  readonly residual: string;
}

interface TrustBoundary {
  readonly name: string;
  readonly can: string;
  readonly cannot: string;
  readonly status: string;
}

export const CLAIM_MODEL_COMPARISONS = [
  {
    model: 'Backend-controlled hot wallet',
    custody: 'Application infrastructure holds a spend-capable key.',
    replayBoundary: 'Backend and database controls only.',
    operations: 'Simple to operate, but creates concentrated compromise and rotation risk.',
    disposition: 'Rejected for the preferred direction',
  },
  {
    model: 'Multisig treasury with backend-built transactions',
    custody: 'Reviewed multisig retains treasury control.',
    replayBoundary: 'Human approval and transaction-level controls.',
    operations: 'Strong custody, but high review load and ambiguous player settlement recovery.',
    disposition: 'Useful treasury boundary, incomplete claim model',
  },
  {
    model: 'Dedicated claim program with signed authorization',
    custody:
      'Reviewed multisig funds a bounded program; application services hold no treasury key.',
    replayBoundary: 'Program-enforced nonce, recipient, amount, mint, network, policy, and expiry.',
    operations:
      'Supports replay resistance, caps, reconciliation, pause, and isolated key rotation.',
    disposition: 'Preferred future direction — pending review',
  },
  {
    model: 'Epoch Merkle distributor',
    custody: 'Treasury allocation is committed per reviewed epoch.',
    replayBoundary: 'Leaf and bitmap or receipt tracking on chain.',
    operations:
      'Scales well, but adds epoch correction, expiry, dispute, and root-governance complexity.',
    disposition: 'Alternative for later scale review',
  },
  {
    model: 'Third-party custodial payout service',
    custody: 'External provider controls payout custody and availability.',
    replayBoundary: 'Provider-specific guarantees and reconciliation.',
    operations:
      'Transfers security, geographic, continuity, and compliance dependencies to a vendor.',
    disposition: 'Not preferred',
  },
] as const satisfies readonly ClaimModelComparison[];

export const THREAT_SUMMARIES = [
  {
    category: 'Player and wallet',
    examples: 'Phishing, stolen session, replay, recipient substitution, wallet change.',
    prevention:
      'Verified session and wallet binding, domain separation, expiry, immutable recipient.',
    response: 'Cancel or quarantine mock intent; require fresh verification and review evidence.',
    residual: 'A genuinely stolen wallet remains an owner and legal policy decision.',
  },
  {
    category: 'Gameplay and eligibility',
    examples: 'Forged completion, duplicate receipt, cap bypass, multi-account farming.',
    prevention: 'Immutable source receipts, deterministic IDs, closed sources, layered caps.',
    response: 'Quarantine the eligibility lineage without changing unrelated player state.',
    residual: 'Collusion and identity attribution require reviewed signals, not automatic denial.',
  },
  {
    category: 'Application and infrastructure',
    examples: 'Compromised API, worker, administrator, deployment, or service credential.',
    prevention: 'Least privilege, immutable payloads, isolated authorization, no treasury signer.',
    response:
      'Pause authorization, rotate bounded keys, preserve evidence, reconcile all mock state.',
    residual: 'A coordinated control-plane compromise requires independent treasury governance.',
  },
  {
    category: 'Blockchain and treasury',
    examples:
      'Wrong mint, decimals, destination, extension behavior, reserve depletion, RPC ambiguity.',
    prevention:
      'Closed network and mint binding, Token-2022 review, reserves, caps, confirmation policy.',
    response: 'Emergency pause, signer isolation, provider comparison, incident reconciliation.',
    residual:
      'Chain, token-extension, and external-provider behavior cannot be eliminated off chain.',
  },
] as const satisfies readonly ThreatSummary[];

export const TRUST_BOUNDARIES = [
  {
    name: 'Game client',
    can: 'Display disabled status and submit a future intent request.',
    cannot: 'Choose amount, treasury, eligibility, mint, network, or authoritative state.',
    status: 'Presentation only',
  },
  {
    name: 'Wallet',
    can: 'Prove control through a transparent, bounded player action in a future phase.',
    cannot: 'Share a seed phrase or private key with Starville.',
    status: 'Not requested',
  },
  {
    name: 'API and worker',
    can: 'Validate sessions and process bounded future state transitions.',
    cannot: 'Invent eligibility, alter authorization fields, or sign treasury transactions.',
    status: 'Architecture draft',
  },
  {
    name: 'Database',
    can: 'Eventually enforce uniqueness, caps, revisions, and immutable receipts.',
    cannot: 'Sign a transaction or replace treasury governance.',
    status: 'Design only',
  },
  {
    name: 'Authorization service',
    can: 'Eventually authorize an immutable, validated, short-lived payload.',
    cannot: 'Hold treasury funds or change recipient, mint, network, or amount.',
    status: 'Disabled',
  },
  {
    name: 'Treasury signer and Solana program',
    can: 'Nothing in Phase 9B-A; no implementation or connection exists.',
    cannot: 'Receive a live plan, blockhash, signature request, or transaction submission.',
    status: 'Not connected',
  },
] as const satisfies readonly TrustBoundary[];

const MOCK_STATES = [
  'draft',
  'ineligible',
  'eligible_mock',
  'review_required_mock',
  'quarantined_mock',
  'authorized_mock',
  'expired_mock',
  'cancelled_mock',
] as const;

const ELIGIBILITY_FIELDS = [
  'Deterministic public eligibility ID and immutable source receipt',
  'Safe player identity and currently verified recipient wallet',
  'Closed source and reward categories',
  'Configured mint, Solana network, base units, and decimal interpretation',
  'Policy version, campaign or epoch, earliest time, and expiry',
  'Bounded reason, idempotency, audit correlation, and disqualification state',
] as const;

const TREASURY_POLICY_FIELDS = [
  'Feature disabled by default',
  'Closed network, mint, decimals, architecture, and signer mode',
  'Per-claim, player, wallet, source, activity, epoch, daily, and weekly caps',
  'Minimum token reserve, minimum fee reserve, and pending authorization reserve',
  'Authorization lifetime, confirmation policy, retry limit, pause, and maintenance behavior',
  'Versioned effective time with no secret, executable expression, or unbounded JSON field',
] as const;

const SECURITY_CHECKS = [
  ['Live signer provider', 'Absent'],
  ['Treasury private key or seed field', 'Prohibited'],
  ['RPC, blockhash, wallet-signature, or transaction submission', 'Absent'],
  ['Recipient, mint, network, amount, policy, nonce, and expiry binding', 'Designed'],
  ['Exactly-once intent, authorization, and settlement controls', 'Modeled offline'],
  ['Token-2022 extension compatibility', 'Owner review required'],
  ['Monitoring, incident response, rotation, and reconciliation', 'Architecture draft'],
  ['Security, treasury, legal, compliance, and geographic review', 'Unresolved gate'],
] as const;

const OWNER_DECISIONS = [
  'Approve, reject, or revise the preferred claim-program architecture.',
  'Select treasury governance, multisig participants, reserve ownership, and emergency authority.',
  'Approve exact caps, epochs, expiry, confirmation, dispute, and wallet-change policy.',
  'Complete Token-2022 mint-extension and destination-account compatibility review.',
  'Complete independent security, treasury, legal, compliance, and geographic review.',
  'Decide whether Phase 9B-B should begin only after every documented entry criterion passes.',
] as const;

function SectionHeading({
  id,
  eyebrow,
  title,
  detail,
}: {
  readonly id: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly detail?: string;
}) {
  return (
    <div className="economy-section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={id}>{title}</h2>
      </div>
      {detail === undefined ? null : <span>{detail}</span>}
    </div>
  );
}

function TextChecklist({ items }: { readonly items: readonly string[] }) {
  return (
    <ul className="economy-check-list token-claim-check-list">
      {items.map((item) => (
        <li key={item}>
          <span aria-hidden="true">✓</span>
          {item}
        </li>
      ))}
    </ul>
  );
}

export function TokenClaimArchitectureDashboard() {
  return (
    <>
      <aside
        aria-labelledby="token-claims-disabled-heading"
        className="token-claim-disabled-banner"
        role="status"
      >
        <div>
          <p className="eyebrow">Phase 9B-A safety boundary</p>
          <strong id="token-claims-disabled-heading">TOKEN CLAIMS DISABLED</strong>
        </div>
        <ul>
          <li>PHASE 9B-A ARCHITECTURE MODE</li>
          <li>NO ON-CHAIN TRANSFERS ARE ACTIVE</li>
          <li>NO TREASURY SIGNER IS CONNECTED</li>
          <li>NO PLAYER CLAIM ACTION EXISTS</li>
        </ul>
      </aside>

      <section aria-labelledby="architecture-overview-heading">
        <SectionHeading
          detail="Architecture Draft · Disabled"
          eyebrow="Current boundary"
          id="architecture-overview-heading"
          title="Architecture Overview"
        />
        <div className="economy-metrics-grid token-claim-metrics">
          <MetricCard
            detail="Current access verification remains separate."
            label="Player claim feature"
            value="Disabled"
          />
          <MetricCard
            detail="No key, provider, multisig, or treasury account is configured."
            label="Treasury signer"
            value="Not Connected"
          />
          <MetricCard
            detail="Planning stops before blockhash, signature, serialization, or RPC."
            label="Instruction boundary"
            value="Offline Only"
          />
          <MetricCard
            detail="Recommendation pending owner, security, treasury, and legal review."
            label="Future model"
            value="Pending Review"
          />
        </div>
        <article className="economy-panel token-claim-overview-copy">
          <StatusChip value="disabled" />
          <p>
            Phase 9B-A models how a future claim system could protect eligibility, recipients, caps,
            reserves, and replay boundaries. It does not create eligibility, persist a claim,
            connect a treasury, request a wallet signature, or transfer a token.
          </p>
          <p>
            The preferred direction combines immutable off-chain eligibility, short-lived signed
            authorization, reviewed multisig treasury control, and an on-chain claim program. That
            direction is a recommendation only and has not been approved.
          </p>
        </article>
      </section>

      <section aria-labelledby="claim-model-comparison-heading">
        <SectionHeading
          detail="Recommendation pending owner, security, treasury, and legal review"
          eyebrow="Decision record"
          id="claim-model-comparison-heading"
          title="Claim Model Comparison"
        />
        <div
          aria-label="Future token claim architecture comparison"
          className="economy-table-region token-claim-table-region"
          role="region"
          tabIndex={0}
        >
          <table className="economy-table token-claim-table">
            <caption>Architecture Draft · five future models compared without approval</caption>
            <thead>
              <tr>
                <th scope="col">Model</th>
                <th scope="col">Custody boundary</th>
                <th scope="col">Replay / binding</th>
                <th scope="col">Operational profile</th>
                <th scope="col">Disposition</th>
              </tr>
            </thead>
            <tbody>
              {CLAIM_MODEL_COMPARISONS.map((entry) => (
                <tr key={entry.model}>
                  <th data-label="Model" scope="row">
                    {entry.model}
                  </th>
                  <td data-label="Custody boundary">{entry.custody}</td>
                  <td data-label="Replay / binding">{entry.replayBoundary}</td>
                  <td data-label="Operational profile">{entry.operations}</td>
                  <td data-label="Disposition">{entry.disposition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="threat-model-heading">
        <SectionHeading
          detail="Summary only · full controls remain owner-gated"
          eyebrow="Defense in depth"
          id="threat-model-heading"
          title="Threat Model Summary"
        />
        <div
          aria-label="Token claim threat model summary"
          className="economy-table-region token-claim-table-region"
          role="region"
          tabIndex={0}
        >
          <table className="economy-table token-claim-table">
            <caption>
              Architecture Draft · prevention, response, and residual risk by category
            </caption>
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Example threats</th>
                <th scope="col">Prevention</th>
                <th scope="col">Response</th>
                <th scope="col">Residual risk</th>
              </tr>
            </thead>
            <tbody>
              {THREAT_SUMMARIES.map((entry) => (
                <tr key={entry.category}>
                  <th data-label="Category" scope="row">
                    {entry.category}
                  </th>
                  <td data-label="Example threats">{entry.examples}</td>
                  <td data-label="Prevention">{entry.prevention}</td>
                  <td data-label="Response">{entry.response}</td>
                  <td data-label="Residual risk">{entry.residual}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="trust-boundaries-heading">
        <SectionHeading
          detail="No component has live transfer authority"
          eyebrow="Least authority"
          id="trust-boundaries-heading"
          title="Trust Boundaries"
        />
        <div className="token-claim-boundary-grid">
          {TRUST_BOUNDARIES.map((boundary) => (
            <article className="economy-panel" key={boundary.name}>
              <header>
                <h3>{boundary.name}</h3>
                <StatusChip value={boundary.status.toLowerCase().replaceAll(' ', '_')} />
              </header>
              <dl className="economy-detail-list economy-detail-list--compact">
                <div>
                  <dt>May eventually</dt>
                  <dd>{boundary.can}</dd>
                </div>
                <div>
                  <dt>Must never</dt>
                  <dd>{boundary.cannot}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="eligibility-model-heading">
        <SectionHeading
          detail="Typed design · no records created"
          eyebrow="Immutable provenance"
          id="eligibility-model-heading"
          title="Eligibility Model"
        />
        <div className="economy-overview-columns">
          <article className="economy-panel">
            <h3>Permitted future origins</h3>
            <TextChecklist
              items={[
                'Immutable cooperative-activity completion receipt',
                'Immutable approved economy reward receipt',
                'Approved seasonal event receipt',
                'Explicitly approved administrative reward receipt',
              ]}
            />
          </article>
          <article className="economy-panel">
            <h3>Required immutable binding</h3>
            <TextChecklist items={ELIGIBILITY_FIELDS} />
          </article>
        </div>
        <p className="economy-safety-note token-claim-inline-boundary">
          Client progress, DUST balance, inventory, token holdings, chat activity, social counts,
          free-form administrator input, and arbitrary JSON cannot create eligibility.
        </p>
      </section>

      <section aria-labelledby="claim-state-machine-heading">
        <SectionHeading
          detail="Closed registry · mock states only"
          eyebrow="Exactly-once intent"
          id="claim-state-machine-heading"
          title="Claim State Machine"
        />
        <ol className="token-claim-state-machine" aria-label="Phase 9B-A offline mock states">
          {MOCK_STATES.map((state, index) => (
            <li key={state}>
              <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <strong>{state.replaceAll('_', ' ')}</strong>
              <small>Mock state</small>
            </li>
          ))}
        </ol>
        <article className="economy-panel">
          <h3>Exactly-once design guarantees</h3>
          <TextChecklist
            items={[
              'One source receipt can produce at most one eligibility and one authoritative intent.',
              'Concurrent sessions and retries converge on one deterministic result.',
              'Recipient, amount, mint, network, policy, nonce, and expiry become immutable at authorization.',
              'Expired, cancelled, or quarantined authorization cannot silently become usable.',
              'Wallet changes cannot redirect a pending authorization.',
              'Future settlement must reconcile one off-chain receipt to at most one on-chain result.',
            ]}
          />
          <p className="economy-card-note">
            Transaction-planned, built, submitted, processed, and confirmed states are not active in
            Phase 9B-A.
          </p>
        </article>
      </section>

      <section aria-labelledby="treasury-policy-heading">
        <SectionHeading
          detail="Not Published · Not Connected"
          eyebrow="Versioned controls"
          id="treasury-policy-heading"
          title="Treasury Policy Draft"
        />
        <article className="economy-panel token-claim-policy-draft">
          <div className="economy-status-stack">
            <StatusChip value="architecture_draft" />
            <StatusChip value="disabled" />
            <StatusChip value="not_published" />
          </div>
          <TextChecklist items={TREASURY_POLICY_FIELDS} />
        </article>
      </section>

      <section aria-labelledby="reserve-simulation-heading">
        <SectionHeading
          detail="Fixture values · not a balance or financial forecast"
          eyebrow="Offline Simulation"
          id="reserve-simulation-heading"
          title="Reserve Simulation"
        />
        <div className="economy-metrics-grid token-claim-metrics">
          <MetricCard
            detail="Mock token base units"
            label="Fixture token balance"
            value="1,000,000"
          />
          <MetricCard detail="Mock protected reserve" label="Minimum reserve" value="400,000" />
          <MetricCard
            detail="Mock authorizations awaiting expiry"
            label="Pending exposure"
            value="85,000"
          />
          <MetricCard
            detail="Mock, after reserves and pending exposure"
            label="Available amount"
            value="515,000"
          />
        </div>
        <p className="economy-safety-note token-claim-inline-boundary">
          Offline Simulation · These values are deterministic fixtures. They are not a real
          treasury, wallet, token balance, fee balance, reserve, liability, or forecast. No network
          query occurs.
        </p>
      </section>

      <section aria-labelledby="claim-simulation-heading">
        <SectionHeading
          detail="Deterministic fixture summary"
          eyebrow="Offline Simulation"
          id="claim-simulation-heading"
          title="Claim Simulation"
        />
        <div className="economy-metrics-grid token-claim-metrics">
          <MetricCard detail="Mock eligible attempts" label="Fixture attempts" value="10,000" />
          <MetricCard
            detail="Duplicate and concurrent attempts converge"
            label="Duplicate settlements"
            value="0"
          />
          <MetricCard
            detail="Recipient, amount, mint, and network remain bound"
            label="Binding mismatches"
            value="0"
          />
          <MetricCard
            detail="No RPC, signature, or transaction submission"
            label="Blockchain calls"
            value="0"
          />
        </div>
        <p className="economy-card-note">
          Mock · Offline Simulation · Representative architecture evidence only. No player balance,
          eligibility, wallet, treasury, policy, or blockchain state was read or changed.
        </p>
      </section>

      <section aria-labelledby="quarantine-model-heading">
        <SectionHeading
          detail="Human review · no automatic permanent denial"
          eyebrow="Containment"
          id="quarantine-model-heading"
          title="Quarantine Model"
        />
        <div className="economy-overview-columns">
          <article className="economy-panel">
            <h3>Possible review triggers</h3>
            <TextChecklist
              items={[
                'Wallet changes during a mock intent',
                'Mint, network, amount, source, or receipt mismatch',
                'Layered cap or protected reserve conflict',
                'High-risk review threshold or replay evidence',
              ]}
            />
          </article>
          <article className="economy-panel">
            <h3>Required behavior</h3>
            <TextChecklist
              items={[
                'Freeze only the affected mock authorization path',
                'Preserve evidence and bounded reason categories',
                'Require an authorized human disposition',
                'Never treat a weak heuristic as permanent denial',
              ]}
            />
          </article>
        </div>
      </section>

      <section aria-labelledby="dispute-model-heading">
        <SectionHeading
          detail="Mock workflow only"
          eyebrow="Evidence and review"
          id="dispute-model-heading"
          title="Dispute Model"
        />
        <ol className="token-claim-review-flow">
          {[
            ['Open', 'Record a bounded category, safe mock claim ID, and claimant evidence.'],
            [
              'Investigate',
              'Compare eligibility lineage, wallet binding, state history, caps, and reserves.',
            ],
            [
              'Decide',
              'Use an authorized reviewer and separation of duties for material outcomes.',
            ],
            ['Resolve', 'Preserve the immutable decision and explain the permitted next step.'],
          ].map(([title, description], index) => (
            <li key={title}>
              <span aria-hidden="true">{index + 1}</span>
              <div>
                <strong>{title}</strong>
                <p>{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="security-checklist-heading">
        <SectionHeading
          detail="Evidence boundary · not an approval"
          eyebrow="Fail closed"
          id="security-checklist-heading"
          title="Security Checklist"
        />
        <div
          aria-label="Token claim architecture security checklist"
          className="economy-table-region token-claim-table-region"
          role="region"
          tabIndex={0}
        >
          <table className="economy-table token-claim-security-table">
            <caption>Architecture Draft · disabled security controls and unresolved gates</caption>
            <thead>
              <tr>
                <th scope="col">Control</th>
                <th scope="col">Phase 9B-A status</th>
              </tr>
            </thead>
            <tbody>
              {SECURITY_CHECKS.map(([control, status]) => (
                <tr key={control}>
                  <th data-label="Control" scope="row">
                    {control}
                  </th>
                  <td data-label="Phase 9B-A status">{status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="owner-decisions-heading">
        <SectionHeading
          detail="No recommendation is approved"
          eyebrow="Explicit gates"
          id="owner-decisions-heading"
          title="Unresolved Owner Decisions"
        />
        <article className="economy-panel token-claim-owner-decisions">
          <StatusChip value="pending_review" />
          <ol>
            {OWNER_DECISIONS.map((decision) => (
              <li key={decision}>{decision}</li>
            ))}
          </ol>
          <strong>
            Recommendation pending owner, security, treasury, and legal review. Phase 9B-B is not
            authorized by this dashboard.
          </strong>
        </article>
      </section>
    </>
  );
}
