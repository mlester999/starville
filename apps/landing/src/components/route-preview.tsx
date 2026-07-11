import Link from 'next/link';

import { StarvilleMark } from './starville-mark';

interface RoutePreviewProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly details: readonly string[];
}

export function RoutePreview({ eyebrow, title, description, details }: RoutePreviewProps) {
  return (
    <main className="route-preview">
      <div className="route-preview__art" aria-hidden="true" />
      <div className="route-preview__veil" aria-hidden="true" />
      <header className="route-preview__header">
        <Link className="brand-link" href="/" aria-label="Return to Starville home">
          <StarvilleMark compact />
        </Link>
        <Link className="route-preview__home" href="/">
          Return home
        </Link>
      </header>
      <section className="route-preview__content" aria-labelledby="route-preview-title">
        <p className="route-preview__eyebrow">{eyebrow}</p>
        <h1 id="route-preview-title">{title}</h1>
        <p className="route-preview__description">{description}</p>
        <ul>
          {details.map((detail) => (
            <li key={detail}>
              <span aria-hidden="true">✦</span>
              {detail}
            </li>
          ))}
        </ul>
        <p className="route-preview__note">More from the village is coming soon.</p>
      </section>
    </main>
  );
}
