'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, type KeyboardEvent } from 'react';

import {
  playerOperationAction,
  type PlayerOperationActionState,
} from '../app/actions/player-operations';
import type { AdminPlayerAction } from '../lib/player-operations/api';
import { focusTrapTarget } from './dialog-focus';

const INITIAL_STATE: PlayerOperationActionState = { outcome: 'idle' };

export function PlayerActionDialog(props: {
  readonly action: AdminPlayerAction;
  readonly buttonLabel: string;
  readonly title: string;
  readonly description: string;
  readonly idempotencyKey: string;
  readonly playerId: string;
  readonly playerName: string;
  readonly walletAddress: string | null;
  readonly expectedVersion: number;
  readonly dangerous?: boolean;
}) {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [state, formAction, pending] = useActionState(playerOperationAction, INITIAL_STATE);
  const walletLabel =
    props.walletAddress === null
      ? 'restricted for this role'
      : `${props.walletAddress.slice(0, 5)}…${props.walletAddress.slice(-5)}`;

  useEffect(() => {
    if (state.outcome === 'success') closeRef.current?.focus();
  }, [state.outcome]);

  function open() {
    dialogRef.current?.showModal();
    queueMicrotask(() => reasonRef.current?.focus());
  }

  function close() {
    dialogRef.current?.close();
    triggerRef.current?.focus();
    if (state.outcome === 'success') router.refresh();
  }

  function trapFocus(event: KeyboardEvent<HTMLDialogElement>) {
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
        className={props.dangerous ? 'button button--danger' : 'button button--secondary'}
        onClick={open}
        ref={triggerRef}
        type="button"
      >
        {props.buttonLabel}
      </button>
      <dialog
        aria-describedby={`${props.action}-description`}
        aria-labelledby={`${props.action}-title`}
        className="operation-dialog"
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        onClose={() => triggerRef.current?.focus()}
        onKeyDown={trapFocus}
        ref={dialogRef}
      >
        <form action={formAction} className="operation-dialog__form">
          <input name="action" type="hidden" value={props.action} />
          <input name="playerId" type="hidden" value={props.playerId} />
          <input name="expectedVersion" type="hidden" value={props.expectedVersion} />
          <input name="requestId" type="hidden" value={props.idempotencyKey} />
          <input name="confirmed" type="hidden" value="yes" />
          <header>
            <p className="eyebrow">Sensitive player operation</p>
            <h2 id={`${props.action}-title`}>{props.title}</h2>
            <p id={`${props.action}-description`}>
              {props.description} Target: <strong>{props.playerName}</strong>. Wallet:{' '}
              <code>{walletLabel}</code>.
            </p>
          </header>

          {state.outcome === 'success' ? (
            <div className="operation-dialog__result" role="status">
              <strong>Operation complete</strong>
              <p>{state.message}</p>
              {state.revokedSessionCount === undefined ? null : (
                <p>{state.revokedSessionCount} active access session(s) revoked.</p>
              )}
            </div>
          ) : (
            <>
              <label htmlFor={`${props.action}-reason`}>Reason</label>
              <textarea
                disabled={pending}
                id={`${props.action}-reason`}
                maxLength={500}
                minLength={12}
                name="reason"
                placeholder="Provide operational context (12–500 characters)."
                ref={reasonRef}
                required
                rows={5}
              />
              <p className="field-hint">
                The reason is retained in the append-only audit trail. Do not include credentials or
                secrets.
              </p>
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
                className={props.dangerous ? 'button button--danger' : 'button button--primary'}
                disabled={pending}
                type="submit"
              >
                {pending ? 'Applying…' : `Confirm ${props.buttonLabel.toLowerCase()}`}
              </button>
            )}
          </footer>
        </form>
      </dialog>
    </>
  );
}
