'use client';

import { useId, useRef, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

function ConfirmButton({ label }: { readonly label: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} type="submit">
      {pending ? 'Recording…' : label}
    </button>
  );
}

export function EconomyConfirmAction({
  action,
  triggerLabel,
  title,
  description,
  confirmLabel,
  hiddenFields,
  children,
  tone = 'standard',
}: {
  readonly action: (formData: FormData) => void | Promise<void>;
  readonly triggerLabel: string;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly hiddenFields: Readonly<Record<string, string | number>>;
  readonly children?: ReactNode;
  readonly tone?: 'standard' | 'danger';
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  function close() {
    dialogRef.current?.close();
    queueMicrotask(() => triggerRef.current?.focus());
  }

  return (
    <>
      <button
        className={tone === 'danger' ? 'economy-button economy-button--danger' : 'economy-button'}
        onClick={() => dialogRef.current?.showModal()}
        ref={triggerRef}
        type="button"
      >
        {triggerLabel}
      </button>
      <dialog
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        className="economy-confirm-dialog"
        onClose={() => triggerRef.current?.focus()}
        ref={dialogRef}
      >
        <form action={action}>
          <header>
            <p className="eyebrow">Explicit administrator decision</p>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </header>
          {Object.entries(hiddenFields).map(([name, value]) => (
            <input key={name} name={name} type="hidden" value={String(value)} />
          ))}
          {children}
          <footer>
            <button className="economy-button economy-button--quiet" onClick={close} type="button">
              Cancel
            </button>
            <ConfirmButton label={confirmLabel} />
          </footer>
        </form>
      </dialog>
    </>
  );
}
