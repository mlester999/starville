'use client';

import { useActionState } from 'react';

import { updateTokenGateAction, validateTokenGateAction } from '../app/actions/token-gate';
import type { AdminTokenGateConfig, TokenGateActionState } from '../lib/token-access/contracts';

interface TokenGateFormProps {
  readonly canConfigure: boolean;
  readonly config: AdminTokenGateConfig;
}

const INITIAL_ACTION_STATE: TokenGateActionState = { outcome: 'idle' };

function formatValidationDate(value: string | null): string {
  if (value === null || Number.isNaN(new Date(value).valueOf())) {
    return 'Not yet validated';
  }

  return `${new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value))} UTC`;
}

export function TokenGateForm({ canConfigure, config }: TokenGateFormProps) {
  const [validationState, validationAction, validationPending] = useActionState(
    validateTokenGateAction,
    INITIAL_ACTION_STATE,
  );
  const [updateState, updateAction, updatePending] = useActionState(
    updateTokenGateAction,
    INITIAL_ACTION_STATE,
  );
  const busy = validationPending || updatePending;

  return (
    <div className="token-access-grid">
      <section className="token-config-card" aria-labelledby="token-config-title">
        <div className="token-config-card__header">
          <div>
            <p className="eyebrow">Trusted configuration</p>
            <h2 id="token-config-title">Player access requirement</h2>
          </div>
          <span className={`config-status config-status--${config.availability}`}>
            <span aria-hidden="true" />
            {config.availability}
          </span>
        </div>

        <form action={updateAction} className="token-config-form">
          <input type="hidden" name="expectedConfigVersion" value={config.configVersion} />
          <fieldset disabled={!canConfigure || busy}>
            <div className="field field--switch">
              <div>
                <label htmlFor="token-gate-enabled">Token gate enabled</label>
                <p>Disabled gates remain fail-closed during Phase 3.</p>
              </div>
              <input
                id="token-gate-enabled"
                name="enabled"
                type="checkbox"
                defaultChecked={config.enabled}
              />
            </div>

            <div className="token-form-columns">
              <div className="field">
                <label htmlFor="token-network">Network</label>
                <select id="token-network" name="network" defaultValue={config.network}>
                  <option value="solana:devnet">Solana Devnet</option>
                  <option value="solana:mainnet-beta">Solana Mainnet</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="token-commitment">RPC commitment</label>
                <select id="token-commitment" name="commitment" defaultValue={config.commitment}>
                  <option value="confirmed">Confirmed</option>
                  <option value="finalized">Finalized</option>
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="token-mint">Mint address</label>
              <input
                id="token-mint"
                name="mintAddress"
                type="text"
                autoComplete="off"
                spellCheck="false"
                defaultValue={config.mintAddress ?? ''}
                maxLength={44}
                required
              />
              <p className="field__guidance">
                Validation uses the server-owned RPC. No RPC URL or credential is accepted here.
              </p>
            </div>

            <div className="token-form-columns">
              <div className="field">
                <label htmlFor="token-symbol">Display symbol</label>
                <input
                  id="token-symbol"
                  name="symbol"
                  type="text"
                  autoComplete="off"
                  defaultValue={config.symbol}
                  maxLength={16}
                  pattern="[A-Za-z0-9]{1,16}"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="token-required-amount">Required amount</label>
                <input
                  id="token-required-amount"
                  name="requiredAmount"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  defaultValue={config.requiredAmount}
                  pattern="\d+(\.\d+)?"
                  required
                />
              </div>
            </div>

            <div className="token-form-columns">
              <div className="field">
                <label htmlFor="token-session-ttl">Session TTL (seconds)</label>
                <input
                  id="token-session-ttl"
                  name="sessionTtlSeconds"
                  type="number"
                  min={60}
                  max={3_600}
                  step={1}
                  defaultValue={config.sessionTtlSeconds}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="token-recheck">Recheck interval (seconds)</label>
                <input
                  id="token-recheck"
                  name="recheckIntervalSeconds"
                  type="number"
                  min={30}
                  max={1_800}
                  step={1}
                  defaultValue={config.recheckIntervalSeconds}
                  required
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="token-change-reason">Reason for change</label>
              <textarea
                id="token-change-reason"
                name="reason"
                rows={3}
                minLength={12}
                maxLength={500}
                placeholder="Explain why this access-affecting change is required."
                required
              />
            </div>

            <label className="confirmation-field">
              <input name="confirmed" type="checkbox" required />
              <span>
                I understand that an access-affecting change increments the configuration version
                and invalidates stale player sessions.
              </span>
            </label>

            {canConfigure ? (
              <div className="token-form-actions">
                <button
                  className="button button--secondary"
                  type="submit"
                  formAction={validationAction}
                  formNoValidate
                >
                  {validationPending ? 'Validating mint…' : 'Validate proposed mint'}
                </button>
                <button className="button button--primary" type="submit">
                  {updatePending ? 'Saving configuration…' : 'Save configuration'}
                </button>
              </div>
            ) : null}
          </fieldset>
        </form>

        {!canConfigure ? (
          <p className="read-only-notice">
            Your role can view token access but does not have <code>token_gate.configure</code>.
          </p>
        ) : null}

        {validationState.outcome !== 'idle' ? (
          <div
            className={`admin-action-result admin-action-result--${validationState.outcome}`}
            role="status"
          >
            <strong>
              {validationState.outcome === 'success' ? 'Mint verified' : 'Validation failed'}
            </strong>
            <p>{validationState.message}</p>
            {validationState.validation === undefined ? null : (
              <dl>
                <div>
                  <dt>Commitment</dt>
                  <dd>{validationState.validation.commitment}</dd>
                </div>
                <div>
                  <dt>Program</dt>
                  <dd>{validationState.validation.tokenProgram}</dd>
                </div>
                <div>
                  <dt>Decimals</dt>
                  <dd>{validationState.validation.decimals}</dd>
                </div>
                <div>
                  <dt>Observed slot</dt>
                  <dd>{validationState.validation.slot}</dd>
                </div>
              </dl>
            )}
          </div>
        ) : null}

        {updateState.outcome !== 'idle' ? (
          <div
            className={`admin-action-result admin-action-result--${updateState.outcome}`}
            role="status"
          >
            <strong>
              {updateState.outcome === 'success' ? 'Configuration saved' : 'Update failed'}
            </strong>
            <p>{updateState.message}</p>
          </div>
        ) : null}
      </section>

      <aside className="token-metadata" aria-labelledby="token-metadata-title">
        <div>
          <p className="eyebrow">Verified metadata</p>
          <h2 id="token-metadata-title">Current authority snapshot</h2>
          <p>These values come from the trusted administration API, never from the browser.</p>
        </div>
        <dl>
          <div>
            <dt>Token program</dt>
            <dd>{config.tokenProgram ?? 'Not validated'}</dd>
          </div>
          <div>
            <dt>Mint decimals</dt>
            <dd>{config.decimals ?? 'Not validated'}</dd>
          </div>
          <div>
            <dt>Required raw amount</dt>
            <dd>{config.requiredAmountRaw ?? 'Not available'}</dd>
          </div>
          <div>
            <dt>Configuration version</dt>
            <dd>{config.configVersion}</dd>
          </div>
          <div>
            <dt>Last validated</dt>
            <dd>{formatValidationDate(config.lastValidatedAt)}</dd>
          </div>
          <div>
            <dt>Last validated slot</dt>
            <dd>{config.lastValidatedSlot ?? 'Not available'}</dd>
          </div>
        </dl>
        <div className="token-security-note">
          <span aria-hidden="true">◇</span>
          <p>
            RPC credentials and service keys remain server-only. Every accepted change is
            permission-checked and audited.
          </p>
        </div>
      </aside>
    </div>
  );
}
