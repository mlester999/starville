'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from 'react';

import {
  resetWorldEditorGuidePreference,
  setWorldEditorGuideCompleted,
  WORLD_EDITOR_GUIDE_TITLE,
  WORLD_EDITOR_GUIDE_WARNING,
  WORLD_EDITOR_QUICK_START,
  WORLD_EDITOR_WALKTHROUGH_STEPS,
} from '../lib/worlds/editor-usability';
import { focusTrapTarget } from './dialog-focus';

export interface WorldEditorGuideProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
  /** Called when the active walkthrough step changes so the host can open panels. */
  readonly onStepChange?: (stepIndex: number) => void;
  /** When true, open in walkthrough mode; otherwise show the full quick-start help. */
  readonly walkthroughMode?: boolean;
}

interface HighlightRect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

function measureTarget(target: string): HighlightRect | null {
  if (typeof document === 'undefined') return null;
  const node = document.querySelector<HTMLElement>(`[data-tour-id="${target}"]`);
  if (node === null) return null;
  const rect = node.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return null;
  const pad = 6;
  return {
    top: Math.max(0, rect.top - pad),
    left: Math.max(0, rect.left - pad),
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
}

export function WorldEditorGuide({
  open,
  onClose,
  triggerRef,
  onStepChange,
  walkthroughMode = true,
}: WorldEditorGuideProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [stepIndex, setStepIndex] = useState(0);
  const [showChecklist, setShowChecklist] = useState(!walkthroughMode);
  const [highlight, setHighlight] = useState<HighlightRect | null>(null);
  const steps = WORLD_EDITOR_WALKTHROUGH_STEPS;
  const step = steps[stepIndex] ?? steps[0];
  const isLast = stepIndex >= steps.length - 1;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
      queueMicrotask(() => primaryActionRef.current?.focus());
      return;
    }
    if (dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    setShowChecklist(!walkthroughMode);
  }, [open, walkthroughMode]);

  useEffect(() => {
    if (!open || showChecklist || step === undefined) return;
    onStepChange?.(stepIndex);
    const update = () => setHighlight(measureTarget(step.target));
    update();
    const frame = window.requestAnimationFrame(update);
    window.addEventListener('resize', update);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
    };
  }, [open, showChecklist, step, stepIndex, onStepChange]);

  function finish(completed: boolean): void {
    if (completed) setWorldEditorGuideCompleted(true);
    onClose();
    queueMicrotask(() => triggerRef.current?.focus());
  }

  function handleSkip(): void {
    finish(true);
  }

  function handleComplete(): void {
    finish(true);
  }

  function handleReset(): void {
    resetWorldEditorGuidePreference();
    setStepIndex(0);
    setShowChecklist(false);
    primaryActionRef.current?.focus();
  }

  function goNext(): void {
    if (isLast) {
      handleComplete();
      return;
    }
    setStepIndex((value) => Math.min(steps.length - 1, value + 1));
  }

  function goPrevious(): void {
    setStepIndex((value) => Math.max(0, value - 1));
  }

  function trapFocus(event: KeyboardEvent<HTMLDialogElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleSkip();
      return;
    }
    if (event.key === 'ArrowRight' && !showChecklist) {
      event.preventDefault();
      goNext();
      return;
    }
    if (event.key === 'ArrowLeft' && !showChecklist) {
      event.preventDefault();
      goPrevious();
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

  const ringStyle: CSSProperties | undefined =
    highlight === null
      ? undefined
      : {
          top: highlight.top,
          left: highlight.left,
          width: highlight.width,
          height: highlight.height,
        };

  return (
    <>
      {open && !showChecklist && highlight !== null ? (
        <div
          aria-hidden="true"
          className="world-editor-tour-highlight"
          data-tour-highlight="true"
          style={ringStyle}
        />
      ) : null}
      <dialog
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        className="world-editor-guide"
        data-world-editor-guide="true"
        data-guide-mode={showChecklist ? 'checklist' : 'walkthrough'}
        onCancel={(event) => {
          event.preventDefault();
          handleSkip();
        }}
        onClose={() => {
          queueMicrotask(() => triggerRef.current?.focus());
        }}
        onKeyDown={trapFocus}
        ref={dialogRef}
      >
        <div className="world-editor-guide__shell">
          <header className="world-editor-guide__header">
            <div>
              <p className="eyebrow">{showChecklist ? 'Quick Start' : 'Guided tour'}</p>
              <h2 id={titleId}>
                {showChecklist
                  ? WORLD_EDITOR_GUIDE_TITLE
                  : `${stepIndex + 1}. ${step?.title ?? WORLD_EDITOR_GUIDE_TITLE}`}
              </h2>
            </div>
            <button className="button button--quiet" onClick={handleSkip} type="button">
              Exit
            </button>
          </header>

          <div className="world-editor-guide__body" id={descriptionId}>
            <p className="world-editor-guide__warning" role="note">
              <strong>Live world safety:</strong> {WORLD_EDITOR_GUIDE_WARNING}
            </p>

            {showChecklist ? (
              <>
                <h3 className="world-editor-guide__checklist-title">How to edit this world</h3>
                <ol className="world-editor-guide__checklist">
                  {WORLD_EDITOR_QUICK_START.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
                <p className="field-hint">
                  Pan: hold left mouse on empty map space and drag (or Space+drag / middle mouse).
                  Zoom with + and −. Fit shows the complete map.
                </p>
              </>
            ) : (
              <div className="world-editor-guide__walkthrough" data-tour-step={step?.id}>
                <p className="world-editor-guide__walkthrough-body">{step?.body}</p>
                <p className="world-editor-guide__progress" aria-live="polite">
                  Step {stepIndex + 1} of {steps.length}
                </p>
              </div>
            )}
          </div>

          <footer className="world-editor-guide__footer">
            {showChecklist ? (
              <>
                <button className="button button--quiet" onClick={handleReset} type="button">
                  Restart Guide
                </button>
                <button
                  className="button button--primary"
                  onClick={handleComplete}
                  ref={primaryActionRef}
                  type="button"
                >
                  Got it
                </button>
              </>
            ) : (
              <>
                <button className="button button--quiet" onClick={handleSkip} type="button">
                  Skip
                </button>
                <button
                  className="button button--quiet"
                  onClick={() => setShowChecklist(true)}
                  type="button"
                >
                  Checklist
                </button>
                <button
                  className="button button--quiet"
                  disabled={stepIndex === 0}
                  onClick={goPrevious}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="button button--primary"
                  onClick={goNext}
                  ref={primaryActionRef}
                  type="button"
                >
                  {isLast ? 'Finish' : 'Next'}
                </button>
              </>
            )}
          </footer>
        </div>
      </dialog>
    </>
  );
}
