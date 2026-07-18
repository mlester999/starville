'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId, useRef, type KeyboardEvent } from 'react';

import {
  deriveWorldVersionAction,
  publishWorldDraftAction,
  rollbackWorldVersionAction,
  type WorldActionState,
} from '../app/actions/worlds';
import { focusTrapTarget } from './dialog-focus';

const INITIAL_STATE: WorldActionState = { outcome: 'idle' };

interface WorldVersionDialogProps {
  readonly operation: 'publish' | 'derive' | 'rollback';
  readonly mapId: string;
  readonly mapName: string;
  readonly versionId: string;
  readonly versionNumber: number;
  readonly requestId: string;
  readonly reviewRequestId: string;
  readonly expectedEditVersion: number;
  readonly expectedRecordVersion: number;
  readonly expectedActiveVersionId: string | null;
  readonly expectedChecksum: string | null;
}

export function WorldVersionDialog(props: WorldVersionDialogProps) {
  const router = useRouter();
  const id = useId().replaceAll(':', '');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const action =
    props.operation === 'publish'
      ? publishWorldDraftAction
      : props.operation === 'rollback'
        ? rollbackWorldVersionAction
        : deriveWorldVersionAction;
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  const publishing = props.operation === 'publish';
  const rollingBack = props.operation === 'rollback';
  const highImpact = publishing || rollingBack;

  useEffect(() => {
    if (state.outcome === 'success') closeRef.current?.focus();
  }, [state.outcome]);

  function open(): void {
    dialogRef.current?.showModal();
    queueMicrotask(() => reasonRef.current?.focus());
  }

  function close(): void {
    dialogRef.current?.close();
    triggerRef.current?.focus();
    if (state.outcome === 'success') router.refresh();
  }

  function trapFocus(event: KeyboardEvent<HTMLDialogElement>): void {
    if (event.key !== 'Tab') return;
    const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), a[href], input:not([disabled]):not([type="hidden"])',
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

  const title = publishing
    ? 'Review and publish this validated revision?'
    : rollingBack
      ? 'Review rollback impact?'
      : 'Restore as a new draft?';
  const description = publishing
    ? 'Publication copies the exact tested revision into a new immutable active publication. The tested draft and prior public version remain history.'
    : rollingBack
      ? 'Rollback creates a new immutable publication from this historical version. It does not reopen, edit, or delete either revision.'
      : 'The selected historical version remains immutable. A separate editable draft head will be restored from it.';

  return (
    <>
      <button
        className={highImpact ? 'button button--danger' : 'button button--secondary'}
        onClick={open}
        ref={triggerRef}
        type="button"
      >
        {publishing ? 'Review & publish' : rollingBack ? 'Review rollback' : 'Restore as draft'}
      </button>
      <dialog
        aria-describedby={`${id}-description`}
        aria-labelledby={`${id}-title`}
        className="operation-dialog"
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        onClose={() => triggerRef.current?.focus()}
        onKeyDown={trapFocus}
        ref={dialogRef}
      >
        <form action={formAction} className="operation-dialog__form">
          <input name="mapId" type="hidden" value={props.mapId} />
          <input name="versionId" type="hidden" value={props.versionId} />
          <input name="requestId" type="hidden" value={props.requestId} />
          <input name="reviewRequestId" type="hidden" value={props.reviewRequestId} />
          <input name="expectedEditVersion" type="hidden" value={props.expectedEditVersion} />
          <input name="expectedRecordVersion" type="hidden" value={props.expectedRecordVersion} />
          <input
            name="expectedActiveVersionId"
            type="hidden"
            value={props.expectedActiveVersionId ?? ''}
          />
          <input name="expectedChecksum" type="hidden" value={props.expectedChecksum ?? ''} />
          <input name="confirmed" type="hidden" value="yes" />
          <header>
            <p className="eyebrow">Versioned world operation</p>
            <h2 id={`${id}-title`}>{title}</h2>
            <p id={`${id}-description`}>
              {description} Target: <strong>{props.mapName}</strong>, version{' '}
              <strong>{props.versionNumber}</strong>.
            </p>
          </header>

          {state.outcome === 'success' ? (
            <div className="operation-dialog__result" role="status">
              <strong>Operation complete</strong>
              <p>{state.message}</p>
              {props.operation === 'derive' && state.versionId !== undefined ? (
                <Link href={`/worlds/${props.mapId}/editor?version=${state.versionId}`}>
                  Open derived draft
                </Link>
              ) : null}
            </div>
          ) : (
            <>
              <label htmlFor={`${id}-reason`}>Reason</label>
              <textarea
                disabled={pending}
                id={`${id}-reason`}
                maxLength={500}
                minLength={12}
                name="reason"
                placeholder="Provide publication or rollback context (12–500 characters)."
                ref={reasonRef}
                required
                rows={5}
              />
              <p className="field-hint">
                This reason becomes part of the append-only world audit history. Do not include
                secrets.
              </p>
              {highImpact ? (
                <label className="editor-check">
                  <input name="impactAcknowledged" required type="checkbox" value="yes" />
                  <span>
                    I reviewed the current public revision, target checksum, validation and Game
                    Test evidence, asset bindings, collision/spawn/exit impact, and reconnect
                    behavior.
                  </span>
                </label>
              ) : null}
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
                className={highImpact ? 'button button--danger' : 'button button--primary'}
                disabled={pending || (highImpact && props.expectedChecksum === null)}
                type="submit"
              >
                {pending
                  ? 'Applying…'
                  : publishing
                    ? 'Acknowledge and publish'
                    : rollingBack
                      ? 'Acknowledge and roll back'
                      : 'Confirm restoration'}
              </button>
            )}
          </footer>
        </form>
      </dialog>
    </>
  );
}
