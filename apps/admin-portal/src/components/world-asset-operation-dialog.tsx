'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { worldAssetOperationAction, type WorldAssetActionState } from '../app/actions/world-assets';
import type { WorldAssetVersion } from '../lib/world-assets/contracts';
import { assetArtworkLabel } from '../lib/world-assets/review-model';
import { focusTrapTarget } from './dialog-focus';

const INITIAL_STATE: WorldAssetActionState = { outcome: 'idle' };

export type WorldAssetOperation =
  | 'validate'
  | 'submit-review'
  | 'request-changes'
  | 'reject'
  | 'approve'
  | 'activate'
  | 'deprecate'
  | 'archive';

export function WorldAssetOperationDialog(props: {
  readonly operation: WorldAssetOperation;
  readonly assetId: string;
  readonly assetRevision: number;
  readonly versionId: string;
  readonly expectedRevision: number;
  readonly requestId: string;
  readonly buttonLabel: string;
  readonly title: string;
  readonly description: string;
  readonly severity?: 'neutral' | 'caution' | 'critical';
  readonly typedConfirmation?: string;
  readonly activeVersion: WorldAssetVersion | null;
  readonly candidateVersion: WorldAssetVersion;
  readonly referenceSummary: Readonly<{
    published: number;
    drafts: number;
    activeConfiguration: number;
  }>;
  readonly onRevisionConfirmed: (revision: number) => void;
}) {
  const router = useRouter();
  const id = useId().replaceAll(':', '');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const conflictRevisionRef = useRef<number | null>(null);
  const onRevisionConfirmedRef = useRef(props.onRevisionConfirmed);
  onRevisionConfirmedRef.current = props.onRevisionConfirmed;
  const [state, formAction, pending] = useActionState(worldAssetOperationAction, INITIAL_STATE);
  const severity = props.severity ?? 'caution';
  const reasonRequired = props.operation !== 'validate';
  const valid =
    (!reasonRequired || reason.trim().length >= 12) &&
    (props.typedConfirmation === undefined || confirmation === props.typedConfirmation);
  const revisionConflict =
    state.errorKind === 'actual_concurrent_change' ||
    state.errorKind === 'same_session_stale' ||
    state.errorKind === 'stale_revision';
  const conflictNeedsRefresh =
    revisionConflict && conflictRevisionRef.current === props.expectedRevision;

  useEffect(() => {
    if (state.outcome === 'success') {
      if (state.editVersion !== undefined) onRevisionConfirmedRef.current(state.editVersion);
      router.refresh();
      closeRef.current?.focus();
    }
  }, [router, state.editVersion, state.outcome]);

  useEffect(() => {
    if (state.outcome === 'error' && revisionConflict) {
      conflictRevisionRef.current = props.expectedRevision;
    }
  }, [props.expectedRevision, revisionConflict, state.outcome]);

  useEffect(() => {
    if (
      conflictRevisionRef.current !== null &&
      conflictRevisionRef.current !== props.expectedRevision
    ) {
      conflictRevisionRef.current = null;
      setRefreshing(false);
    }
  }, [props.expectedRevision]);

  function open(): void {
    dialogRef.current?.showModal();
    queueMicrotask(() => (reasonRequired ? reasonRef.current : submitRef.current)?.focus());
  }

  function close(): void {
    dialogRef.current?.close();
    triggerRef.current?.focus();
    if (state.outcome === 'success') router.refresh();
  }

  function refreshLatestState(): void {
    setRefreshing(true);
    router.refresh();
  }

  function trapFocus(event: KeyboardEvent<HTMLDialogElement>): void {
    if (event.key !== 'Tab') return;
    const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"])',
    );
    if (controls === undefined || controls.length === 0) return;
    const destination = focusTrapTarget(
      [...controls],
      document.activeElement as HTMLElement | null,
      event.shiftKey,
    );
    if (destination !== undefined) {
      event.preventDefault();
      destination.focus();
    }
  }

  return (
    <>
      <button
        className={severity === 'critical' ? 'button button--danger' : 'button button--secondary'}
        onClick={open}
        ref={triggerRef}
        type="button"
      >
        {props.buttonLabel}
      </button>
      <dialog
        aria-describedby={`${id}-description`}
        aria-labelledby={`${id}-title`}
        className={`operation-dialog operation-dialog--${severity}`}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        onClose={() => triggerRef.current?.focus()}
        onKeyDown={trapFocus}
        ref={dialogRef}
      >
        <form action={formAction} className="operation-dialog__form">
          <input name="operation" type="hidden" value={props.operation} />
          <input name="assetId" type="hidden" value={props.assetId} />
          <input name="versionId" type="hidden" value={props.versionId} />
          <input name="expectedRevision" type="hidden" value={props.expectedRevision} />
          <input name="expectedAssetRevision" type="hidden" value={props.assetRevision} />
          <input name="requestId" type="hidden" value={props.requestId} />
          <input name="confirmed" type="hidden" value="yes" />
          <header>
            <p className="eyebrow">Versioned asset operation</p>
            <h2 id={`${id}-title`}>{props.title}</h2>
            <p id={`${id}-description`}>{props.description}</p>
          </header>

          {props.operation === 'approve' ? (
            <section className="operation-dialog__impact" aria-labelledby={`${id}-approval-impact`}>
              <h3 id={`${id}-approval-impact`}>Approval is not activation</h3>
              <p>
                Approval confirms that this reviewed candidate is acceptable for activation.
                Approval does not activate the version, update World Editor placement, modify world
                drafts, or change published worlds.
              </p>
              <ol className="operation-dialog__sequence" aria-label="Safe release sequence">
                <li aria-current="step">In Review</li>
                <li>Approved</li>
                <li>Activate separately</li>
                <li>Update world draft</li>
                <li>Test in game</li>
                <li>Publish world separately</li>
              </ol>
              <dl className="operation-dialog__facts">
                <div>
                  <dt>Current active</dt>
                  <dd>
                    {props.activeVersion === null
                      ? 'None'
                      : `Version ${String(props.activeVersion.versionNumber)}`}
                  </dd>
                </div>
                <div>
                  <dt>Candidate</dt>
                  <dd>Version {props.candidateVersion.versionNumber}</dd>
                </div>
                <div>
                  <dt>Candidate revision</dt>
                  <dd>{props.candidateVersion.editVersion}</dd>
                </div>
                <div>
                  <dt>Expected revision</dt>
                  <dd>{props.expectedRevision}</dd>
                </div>
                <div>
                  <dt>Current revision</dt>
                  <dd>{props.candidateVersion.editVersion}</dd>
                </div>
                <div>
                  <dt>Active-version impact</dt>
                  <dd>None</dd>
                </div>
                <div>
                  <dt>World-reference impact</dt>
                  <dd>None</dd>
                </div>
                <div>
                  <dt>Publication impact</dt>
                  <dd>None</dd>
                </div>
              </dl>
            </section>
          ) : null}

          {props.operation === 'activate' ? (
            <section
              className="operation-dialog__impact"
              aria-labelledby={`${id}-activation-impact`}
            >
              <h3 id={`${id}-activation-impact`}>Separate activation review</h3>
              <p>
                Activation changes the canonical asset’s active-version pointer. It does not rewrite
                version-pinned published worlds, update world drafts, or publish a world. The
                previous active version remains immutable history and becomes deprecated.
              </p>
              <dl className="operation-dialog__facts">
                <div>
                  <dt>Candidate to activate</dt>
                  <dd>Version {props.candidateVersion.versionNumber}</dd>
                </div>
                <div>
                  <dt>Current active</dt>
                  <dd>
                    {props.activeVersion === null
                      ? 'None'
                      : `Version ${String(props.activeVersion.versionNumber)}`}
                  </dd>
                </div>
                <div>
                  <dt>Current artwork</dt>
                  <dd>
                    {props.activeVersion === null ? 'None' : assetArtworkLabel(props.activeVersion)}
                  </dd>
                </div>
                <div>
                  <dt>New artwork</dt>
                  <dd>{assetArtworkLabel(props.candidateVersion)}</dd>
                </div>
                <div>
                  <dt>Published references</dt>
                  <dd>{props.referenceSummary.published}</dd>
                </div>
                <div>
                  <dt>Draft references</dt>
                  <dd>{props.referenceSummary.drafts}</dd>
                </div>
              </dl>
              <h3>Activation safety checklist</h3>
              <ul className="operation-dialog__checklist">
                <li
                  data-state={
                    props.candidateVersion.lifecycleStatus === 'approved' ? 'verified' : 'blocked'
                  }
                >
                  Version is Approved —{' '}
                  {props.candidateVersion.lifecycleStatus === 'approved' ? 'verified' : 'blocked'}
                </li>
                <li
                  data-state={
                    props.candidateVersion.validationStatus === 'valid' ? 'verified' : 'blocked'
                  }
                >
                  Validation is valid —{' '}
                  {props.candidateVersion.validationStatus === 'valid' ? 'verified' : 'blocked'}
                </li>
                <li
                  data-state={props.candidateVersion.previewUrl === null ? 'blocked' : 'verified'}
                >
                  Processed preview is available —{' '}
                  {props.candidateVersion.previewUrl === null ? 'blocked' : 'verified'}
                </li>
                <li data-state="manual">
                  Foot and depth anchors reviewed — manual review required
                </li>
                <li data-state="manual">
                  Collision and player scale reviewed — manual review required
                </li>
                <li data-state="manual">Mobile readability reviewed — manual review required</li>
                <li data-state="verified">
                  Activation permission — verified by server authorization
                </li>
                <li data-state="verified">
                  Active version identified —{' '}
                  {props.activeVersion === null
                    ? 'none currently active'
                    : `Version ${String(props.activeVersion.versionNumber)}`}
                </li>
                <li data-state="manual">
                  Reference impact reviewed — {props.referenceSummary.published} published,{' '}
                  {props.referenceSummary.drafts} draft
                </li>
              </ul>
            </section>
          ) : null}

          {state.outcome === 'success' ? (
            <div className="operation-dialog__result" role="status">
              <strong>Operation complete</strong>
              <p>{state.message}</p>
              {props.operation === 'approve' ? (
                <>
                  <p>
                    <strong>Version {props.candidateVersion.versionNumber}: Approved</strong>
                  </p>
                  <p>
                    Active version remains:{' '}
                    {props.activeVersion === null
                      ? 'None'
                      : `Version ${String(props.activeVersion.versionNumber)}`}
                  </p>
                  <p>World references changed: No · World publication changed: No</p>
                  <p>Next safe action: review activation requirements separately.</p>
                </>
              ) : null}
              {props.operation === 'activate' ? (
                <>
                  <p>
                    <strong>Active Version: Version {props.candidateVersion.versionNumber}</strong>
                  </p>
                  <p>
                    Previous Active Version:{' '}
                    {props.activeVersion === null
                      ? 'None'
                      : `Version ${String(props.activeVersion.versionNumber)}`}
                  </p>
                  <p>World references automatically changed: No · Published worlds updated: No</p>
                  <p>Next safe action: open a development world draft and test this version.</p>
                </>
              ) : null}
            </div>
          ) : (
            <>
              {reasonRequired ? (
                <label htmlFor={`${id}-reason`}>
                  Reason
                  <textarea
                    disabled={pending}
                    id={`${id}-reason`}
                    maxLength={500}
                    minLength={12}
                    name="reason"
                    onChange={(event) => setReason(event.currentTarget.value)}
                    aria-describedby={`${id}-reason-help ${id}-reason-count`}
                    placeholder={
                      props.operation === 'approve'
                        ? 'Reviewed artwork, transparency, source validation, player scale, anchors, and collision. Approved for activation and world-draft testing.'
                        : props.operation === 'activate'
                          ? 'Approved production candidate selected as the new active version for world-draft testing. Existing published references remain unchanged.'
                          : 'Explain this lifecycle decision (12–500 characters).'
                    }
                    ref={reasonRef}
                    required
                    rows={5}
                    value={reason}
                  />
                  <small className="field-hint" id={`${id}-reason-help`}>
                    {props.operation === 'approve'
                      ? 'Describe what was reviewed: artwork, transparency, anchors, collision, scale, and validation results.'
                      : 'Use 12–500 safe characters. This administrator-only reason is stored in append-only audit history.'}
                  </small>
                  <small aria-live="polite" id={`${id}-reason-count`}>
                    {String(500 - reason.length)} characters remaining
                  </small>
                </label>
              ) : null}
              <p className="field-hint">
                Lifecycle decisions are recorded in append-only asset audit history. Never include
                credentials or private paths.
              </p>
              {props.typedConfirmation === undefined ? null : (
                <label htmlFor={`${id}-confirmation`}>
                  Type {props.typedConfirmation} to confirm
                  <input
                    autoComplete="off"
                    disabled={pending}
                    id={`${id}-confirmation`}
                    name="typedConfirmation"
                    onChange={(event) => setConfirmation(event.currentTarget.value)}
                    required
                    value={confirmation}
                  />
                </label>
              )}
              {state.outcome === 'error' ? (
                <div className="operation-dialog__error" role="alert">
                  <strong>Operation not confirmed</strong>
                  <p>{state.message}</p>
                  {state.requestId === undefined ? null : (
                    <p>
                      Safe request ID: <code>{state.requestId}</code>
                    </p>
                  )}
                  {revisionConflict ? (
                    <button
                      className="button button--secondary"
                      disabled={refreshing}
                      onClick={refreshLatestState}
                      type="button"
                    >
                      {refreshing ? 'Refreshing…' : 'Refresh latest state'}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          )}

          <footer>
            <button
              className="button button--quiet"
              disabled={pending}
              onClick={close}
              ref={closeRef}
              type="button"
            >
              {state.outcome === 'success' ? 'Close and refresh' : 'Cancel'}
            </button>
            {state.outcome === 'success' ? null : (
              <button
                className={
                  severity === 'critical' ? 'button button--danger' : 'button button--primary'
                }
                disabled={pending || !valid || conflictNeedsRefresh || refreshing}
                ref={submitRef}
                type="submit"
              >
                {pending ? 'Applying…' : props.buttonLabel}
              </button>
            )}
          </footer>
        </form>
      </dialog>
    </>
  );
}
