'use client';

import { useEffect, useId, useRef, type KeyboardEvent, type RefObject } from 'react';

import {
  resetWorldEditorGuidePreference,
  setWorldEditorGuideCompleted,
  WORLD_EDITOR_GUIDE_STEPS,
  WORLD_EDITOR_GUIDE_TITLE,
  WORLD_EDITOR_GUIDE_WARNING,
} from '../lib/worlds/editor-usability';
import { focusTrapTarget } from './dialog-focus';

export interface WorldEditorGuideProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
}

export function WorldEditorGuide({ open, onClose, triggerRef }: WorldEditorGuideProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
      queueMicrotask(() => closeButtonRef.current?.focus());
      return;
    }
    if (dialog.open) dialog.close();
  }, [open]);

  function finish(completed: boolean): void {
    if (completed) setWorldEditorGuideCompleted(true);
    onClose();
    queueMicrotask(() => triggerRef.current?.focus());
  }

  function handleClose(): void {
    finish(true);
  }

  function handleReset(): void {
    resetWorldEditorGuidePreference();
    // Keep guide open so the user can re-read after reset.
    closeButtonRef.current?.focus();
  }

  function trapFocus(event: KeyboardEvent<HTMLDialogElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    <dialog
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className="world-editor-guide"
      data-world-editor-guide="true"
      onCancel={(event) => {
        event.preventDefault();
        handleClose();
      }}
      onClose={() => {
        // Native dialog close (e.g. form method) still returns focus.
        queueMicrotask(() => triggerRef.current?.focus());
      }}
      onKeyDown={trapFocus}
      ref={dialogRef}
    >
      <div className="world-editor-guide__shell">
        <header className="world-editor-guide__header">
          <div>
            <p className="eyebrow">Quick Start</p>
            <h2 id={titleId}>{WORLD_EDITOR_GUIDE_TITLE}</h2>
          </div>
          <button
            className="button button--quiet"
            onClick={handleClose}
            ref={closeButtonRef}
            type="button"
          >
            Close
          </button>
        </header>

        <div className="world-editor-guide__body" id={descriptionId}>
          <p className="world-editor-guide__warning" role="note">
            <strong>Live world safety:</strong> {WORLD_EDITOR_GUIDE_WARNING}
          </p>

          <ol className="world-editor-guide__steps">
            {WORLD_EDITOR_GUIDE_STEPS.map((step, index) => (
              <li className="world-editor-guide__step" key={step.title}>
                <span className="world-editor-guide__step-index" aria-hidden="true">
                  {index + 1}
                </span>
                <div>
                  <h3>
                    {index + 1}. {step.title}
                  </h3>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <footer className="world-editor-guide__footer">
          <button className="button button--quiet" onClick={handleReset} type="button">
            Reset Guide
          </button>
          <button className="button button--primary" onClick={handleClose} type="button">
            Got it
          </button>
        </footer>
      </div>
    </dialog>
  );
}
