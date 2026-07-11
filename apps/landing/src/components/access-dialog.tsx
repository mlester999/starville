'use client';

import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';

interface AccessDialogProps {
  readonly children: ReactNode;
  readonly labelledBy: string;
  readonly onClose: () => void;
  readonly open: boolean;
  readonly returnFocusRef: RefObject<HTMLButtonElement | null>;
  readonly suspended?: boolean;
}

export function AccessDialog({
  children,
  labelledBy,
  onClose,
  open,
  returnFocusRef,
  suspended = false,
}: AccessDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const returnFocusElement = returnFocusRef.current;

    return () => {
      returnFocusElement?.focus();
    };
  }, [open, returnFocusRef]);

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.currentTarget === event.target) {
      onClose();
    }
  }

  function trapDialogFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    const first = focusableElements[0];
    const last = focusableElements.at(-1);

    if (first === undefined || last === undefined) {
      event.preventDefault();
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div
      className={`access-dialog-backdrop${suspended ? ' is-suspended' : ''}`}
      aria-hidden={suspended ? true : undefined}
      inert={suspended}
      onMouseDown={handleBackdropClick}
    >
      <section
        ref={dialogRef}
        className="access-dialog"
        role="dialog"
        aria-modal={suspended ? undefined : 'true'}
        aria-labelledby={labelledBy}
        onKeyDown={trapDialogFocus}
      >
        <div className="access-dialog__surface">
          <button
            ref={closeButtonRef}
            className="access-dialog__close"
            type="button"
            aria-label="Close wallet access"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
          {children}
        </div>
      </section>
    </div>
  );
}
