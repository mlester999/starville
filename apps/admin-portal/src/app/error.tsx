'use client';

import { AdminBrand } from '../components/admin-brand';

interface ErrorPageProps {
  readonly reset: () => void;
}

export default function ErrorPage({ reset }: ErrorPageProps) {
  return (
    <main className="state-shell">
      <section className="state-card" aria-labelledby="error-title">
        <AdminBrand compact />
        <p className="eyebrow">Secure access unavailable</p>
        <h1 id="error-title">We could not verify access</h1>
        <p>No administrator access has been granted. Try the secure check again.</p>
        <button className="button button--primary" type="button" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
