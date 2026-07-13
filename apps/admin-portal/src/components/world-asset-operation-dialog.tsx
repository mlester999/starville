'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { worldAssetOperationAction, type WorldAssetActionState } from '../app/actions/world-assets';
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
  const [state, formAction, pending] = useActionState(worldAssetOperationAction, INITIAL_STATE);
  const severity = props.severity ?? 'caution';
  const reasonRequired = props.operation !== 'validate';
  const valid =
    (!reasonRequired || reason.trim().length >= 12) &&
    (props.typedConfirmation === undefined || confirmation === props.typedConfirmation);

  useEffect(() => {
    if (state.outcome === 'success') closeRef.current?.focus();
  }, [state.outcome]);

  function open(): void {
    dialogRef.current?.showModal();
    queueMicrotask(() => (reasonRequired ? reasonRef.current : submitRef.current)?.focus());
  }

  function close(): void {
    dialogRef.current?.close();
    triggerRef.current?.focus();
    if (state.outcome === 'success') router.refresh();
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

          {state.outcome === 'success' ? (
            <div className="operation-dialog__result" role="status">
              <strong>Operation complete</strong>
              <p>{state.message}</p>
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
                    placeholder="Explain this lifecycle decision (12–500 characters)."
                    ref={reasonRef}
                    required
                    rows={5}
                    value={reason}
                  />
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
              {state.outcome === 'error' ? <p role="alert">{state.message}</p> : null}
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
                disabled={pending || !valid}
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
