'use client';

import { useFormStatus } from 'react-dom';

interface SubmitButtonProps {
  readonly children: string;
  readonly pendingLabel: string;
  readonly variant?: 'primary' | 'secondary' | 'quiet';
}

export function SubmitButton({ children, pendingLabel, variant = 'primary' }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      className={`button button--${variant}`}
      type="submit"
      aria-disabled={pending}
      disabled={pending}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
