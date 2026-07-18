'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId, useState } from 'react';

import {
  restoreWorldAssetBundledDefaultAction,
  type WorldAssetActionState,
} from '../app/actions/world-assets';
import { BUNDLED_DEFAULT_RESTORE_CONFIRMATION } from '../lib/world-assets/bundled-restore';

const INITIAL_STATE: WorldAssetActionState = { outcome: 'idle' };

export function WorldAssetBundledRestore(props: {
  readonly assetId: string;
  readonly assetRevision: number;
  readonly requestId: string;
  readonly friendlyName: string;
  readonly currentActiveLabel: string;
  readonly bundledManifestVersion: string;
  readonly referenceSummary: Readonly<{
    published: number;
    drafts: number;
    activeConfiguration: number;
  }>;
}) {
  const router = useRouter();
  const id = useId().replaceAll(':', '');
  const [reason, setReason] = useState('');
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [state, formAction, pending] = useActionState(
    restoreWorldAssetBundledDefaultAction,
    INITIAL_STATE,
  );
  const ready =
    reason.trim().length >= 12 &&
    typedConfirmation === BUNDLED_DEFAULT_RESTORE_CONFIRMATION &&
    state.outcome !== 'success';

  useEffect(() => {
    if (state.outcome === 'success') router.refresh();
  }, [router, state.outcome]);

  return (
    <section className="detail-card" aria-labelledby={`${id}-title`}>
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Sensitive active-source operation</p>
          <h2 id={`${id}-title`}>Restore Bundled Default</h2>
          <p>
            Restore the repository-owned Bundled v{props.bundledManifestVersion} source for{' '}
            {props.friendlyName} and deprecate the current uploaded override.
          </p>
        </div>
        <span className="permission-badge">AAL2 required</span>
      </div>

      <div className="operation-dialog__impact" id={`${id}-impact`}>
        <h3>Review the exact impact</h3>
        <ul className="operation-dialog__checklist">
          <li data-state="manual">Current active source: {props.currentActiveLabel}</li>
          <li data-state="verified">
            New active source: repository-owned Bundled Default v{props.bundledManifestVersion}
          </li>
          <li data-state="verified">
            Existing published world pins changed: No ({props.referenceSummary.published} tracked)
          </li>
          <li data-state="verified">
            Existing draft pins changed: No ({props.referenceSummary.drafts} tracked)
          </li>
          <li data-state="verified">
            Active configuration references rewritten: No (
            {props.referenceSummary.activeConfiguration} tracked)
          </li>
          <li data-state="verified">Uploaded files or immutable version history deleted: No</li>
        </ul>
        <p className="field-hint">
          This changes only the canonical active-version pointer. Pinned worlds, draft pins,
          published maps, audit history, and immutable uploaded versions remain unchanged. A
          separate world-draft edit and publication is required to change any retained pin.
        </p>
      </div>

      {state.outcome === 'success' ? (
        <div className="operation-dialog__result" role="status">
          <strong>Bundled Default restored</strong>
          <p>{state.message}</p>
          <p>Refresh is loading the authoritative active-source state.</p>
        </div>
      ) : (
        <form action={formAction} aria-describedby={`${id}-impact`}>
          <input name="assetId" type="hidden" value={props.assetId} />
          <input name="expectedAssetRevision" type="hidden" value={props.assetRevision} />
          <input name="requestId" type="hidden" value={props.requestId} />
          <input name="confirmed" type="hidden" value="yes" />

          <label htmlFor={`${id}-reason`}>
            Restore reason
            <textarea
              aria-describedby={`${id}-reason-help ${id}-reason-count`}
              disabled={pending}
              id={`${id}-reason`}
              maxLength={500}
              minLength={12}
              name="reason"
              onChange={(event) => setReason(event.currentTarget.value)}
              placeholder="Explain why the reviewed bundled baseline should replace the current uploaded active source."
              required
              rows={4}
              value={reason}
            />
          </label>
          <small className="field-hint" id={`${id}-reason-help`}>
            Use 12–500 safe characters. The reason and administrator identity are recorded in
            append-only audit history.
          </small>
          <small aria-live="polite" id={`${id}-reason-count`}>
            {String(500 - reason.length)} characters remaining
          </small>

          <label htmlFor={`${id}-confirmation`}>
            Type {BUNDLED_DEFAULT_RESTORE_CONFIRMATION} to confirm
            <input
              autoComplete="off"
              disabled={pending}
              id={`${id}-confirmation`}
              name="typedConfirmation"
              onChange={(event) => setTypedConfirmation(event.currentTarget.value)}
              required
              value={typedConfirmation}
            />
          </label>

          {state.outcome === 'error' ? (
            <div className="operation-dialog__error" role="alert">
              <strong>Restore not confirmed</strong>
              <p>{state.message}</p>
              {state.requestId === undefined ? null : (
                <p>
                  Safe request ID: <code>{state.requestId}</code>
                </p>
              )}
            </div>
          ) : null}

          <div className="asset-form-secondary-actions">
            <button className="button button--danger" disabled={pending || !ready} type="submit">
              {pending ? 'Restoring…' : 'Restore Bundled Default'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
