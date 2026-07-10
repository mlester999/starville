import type { ReactNode } from 'react';

import { AdminBrand } from './admin-brand';

interface AuthFrameProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}

export function AuthFrame({ eyebrow, title, description, children, footer }: AuthFrameProps) {
  return (
    <main className="auth-shell">
      <section className="auth-context" aria-label="Starville administration">
        <AdminBrand />
        <div className="auth-context__message">
          <p className="eyebrow">Protected operations</p>
          <h2>Steward the world with care.</h2>
          <p>
            Administrator access is verified against trusted server and database records on every
            protected request.
          </p>
        </div>
        <p className="auth-context__footnote">Restricted to authorized Starville staff.</p>
      </section>

      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-panel__inner">
          <p className="eyebrow">{eyebrow}</p>
          <h1 id="auth-title">{title}</h1>
          <p className="lede">{description}</p>
          {children}
          {footer ? <div className="auth-footer">{footer}</div> : null}
        </div>
      </section>
    </main>
  );
}
