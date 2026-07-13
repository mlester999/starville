'use client';

import { AdminBrand } from '../components/admin-brand';

interface ErrorPageProps {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const isAuthRelated =
    /auth|session|unauthorized|permission|administrator access/iu.test(error.message) ||
    error.name === 'AdminAuthorizationUnavailableError';

  return (
    <main className="state-shell">
      <section className="state-card" aria-labelledby="error-title">
        <AdminBrand compact />
        <p className="eyebrow">
          {isAuthRelated ? 'Secure access unavailable' : 'Something went wrong'}
        </p>
        <h1 id="error-title">
          {isAuthRelated ? 'We could not verify access' : 'This page could not finish loading'}
        </h1>
        <p>
          {isAuthRelated
            ? 'No administrator access has been granted. Try the secure check again.'
            : 'An unexpected error interrupted this administrator page. Your session may still be valid. Try again, or return to the overview.'}
        </p>
        <div className="action-stack action-stack--compact">
          <button className="button button--primary" type="button" onClick={reset}>
            Try again
          </button>
          <a className="button button--secondary" href="/overview">
            Go to overview
          </a>
        </div>
      </section>
    </main>
  );
}
