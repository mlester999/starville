import type { CSSProperties, ReactNode } from 'react';

import { AdminBrand } from './admin-brand';

interface AuthFrameProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly gameName?: string;
  readonly administrationName?: string;
  readonly contextTitle?: string;
  readonly contextFootnote?: string;
  readonly style?: CSSProperties;
  readonly logoUrl?: string | null;
}

export function AuthFrame({
  eyebrow,
  title,
  description,
  children,
  footer,
  gameName,
  administrationName,
  contextTitle = 'Steward the world with care.',
  contextFootnote = 'Restricted to authorized Starville staff.',
  style,
  logoUrl,
}: AuthFrameProps) {
  return (
    <main className="auth-shell" style={style}>
      <section className="auth-context" aria-label="Starville administration">
        <AdminBrand
          {...(gameName === undefined ? {} : { gameName })}
          {...(administrationName === undefined ? {} : { administrationName })}
          {...(logoUrl === undefined ? {} : { logoUrl })}
        />
        <div className="auth-context__message">
          <p className="eyebrow">Protected operations</p>
          <h2>{contextTitle}</h2>
          <p>
            Administrator access is verified against trusted server and database records on every
            protected request.
          </p>
        </div>
        <p className="auth-context__footnote">{contextFootnote}</p>
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
