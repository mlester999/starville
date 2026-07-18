'use client';

export default function EconomyError({ reset }: { readonly reset: () => void }) {
  return (
    <main className="economy-page" aria-labelledby="economy-error-title">
      <section className="economy-empty-state" role="alert">
        <span aria-hidden="true">◇</span>
        <h1 id="economy-error-title">Economy data is temporarily unavailable</h1>
        <p>
          No operation was assumed complete. Check the trusted service connection, then retry this
          read safely.
        </p>
        <button className="economy-button" onClick={reset} type="button">
          Try again
        </button>
      </section>
    </main>
  );
}
