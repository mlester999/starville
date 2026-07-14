'use client';

export function ConfirmedSubmitButton({
  children,
  confirmation,
}: {
  readonly children: string;
  readonly confirmation: string;
}) {
  return (
    <button
      type="submit"
      onClick={(event) => {
        if (!window.confirm(confirmation)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
