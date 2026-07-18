import Link from 'next/link';
import type { ReactNode } from 'react';

export function CosmeticsPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly actions?: ReactNode;
}) {
  return (
    <header className="avatar-page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="cosmetics-page-title">{title}</h1>
        <p>{description}</p>
      </div>
      {actions === undefined ? null : <div className="avatar-page-header__actions">{actions}</div>}
    </header>
  );
}

export function DisabledCosmeticShopBanner() {
  return (
    <aside className="cosmetics-disabled-banner" aria-label="Cosmetic purchase status">
      <strong>COSMETIC PURCHASES ARE DISABLED</strong>
      <span>NO OFFERS ARE PUBLISHED</span>
      <p>
        Phase 10B provides a local draft preview only. It has no Buy action, settlement route,
        wallet prompt, token path, NFT, payment, or active DUST debit.
      </p>
    </aside>
  );
}

export function CosmeticsLifecycleGuide({ kind }: { readonly kind: 'collection' | 'emote' }) {
  return (
    <section className="detail-card cosmetics-lifecycle-guide">
      <h2>{kind === 'collection' ? 'Collection' : 'Emote'} lifecycle</h2>
      <ol className="avatar-lifecycle" aria-label={`${kind} lifecycle`}>
        {['Draft', 'Validate', 'Review', 'Approve', 'Schedule', 'Activate'].map((step, index) => (
          <li className={index === 0 ? 'is-current' : undefined} key={step}>
            <span>{index + 1}</span>
            {step}
          </li>
        ))}
      </ol>
      <p>
        This workspace reuses Avatar Content and World Asset review boundaries. Structured drafts
        cannot contain arbitrary scripts, URLs, reward JSON, DUST, tokens, or gameplay effects.
      </p>
      <Link href="/game-content/avatars/catalog">Open the canonical Avatar Content catalog</Link>
    </section>
  );
}
