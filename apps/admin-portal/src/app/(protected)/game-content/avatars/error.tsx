'use client';

export default function AvatarContentError({ reset }: { readonly reset: () => void }) {
  return (
    <main className="avatar-page" role="alert">
      <p className="eyebrow">Avatar content unavailable</p>
      <h1>We could not load this protected workspace.</h1>
      <p>
        No content was changed. Check the trusted API and database locally, then retry this bounded
        read.
      </p>
      <button onClick={reset} type="button">
        Try again
      </button>
    </main>
  );
}
