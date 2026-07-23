import Link from 'next/link';
import type { ReactNode } from 'react';

interface AdminBrandProps {
  readonly compact?: boolean;
  readonly markOnly?: boolean;
  readonly gameName?: string;
  readonly administrationName?: string;
  readonly logoUrl?: string | null;
  readonly markUrl?: string | null;
  readonly href?: string;
}

function BrandMark({
  logoUrl,
  markUrl,
}: {
  readonly logoUrl: string | null;
  readonly markUrl: string | null;
}) {
  if (markUrl !== null) {
    return <img alt="" className="brand-logo brand-logo--mark" src={markUrl} />;
  }
  if (logoUrl !== null) {
    return <img alt="" className="brand-logo" src={logoUrl} />;
  }
  return (
    <img
      alt=""
      className="brand-logo brand-logo--official"
      src="/images/starville-icon-official.png"
    />
  );
}

export function AdminBrand({
  compact = false,
  markOnly = false,
  gameName = 'STARVILLE',
  administrationName = 'ADMINISTRATION',
  logoUrl = null,
  markUrl = null,
  href,
}: AdminBrandProps) {
  const accessibleName =
    gameName === 'STARVILLE' &&
    (administrationName === 'ADMINISTRATION' ||
      administrationName === 'Starville Administration' ||
      administrationName === 'STARVILLE ADMINISTRATION')
      ? 'Starville Admin'
      : administrationName.toLocaleLowerCase().startsWith(gameName.toLocaleLowerCase())
        ? administrationName
        : `${gameName} ${administrationName}`;

  const className = ['brand', compact ? 'brand--compact' : '', markOnly ? 'brand--mark-only' : '']
    .filter(Boolean)
    .join(' ');

  const content: ReactNode = (
    <>
      <BrandMark logoUrl={logoUrl} markUrl={markUrl} />
      <span className="brand-copy">
        <strong>{gameName}</strong>
        <span>{administrationName}</span>
      </span>
    </>
  );

  if (href !== undefined) {
    return (
      <Link aria-label={accessibleName} className={className} href={href} title={accessibleName}>
        {content}
      </Link>
    );
  }

  return (
    <div aria-label={accessibleName} className={className} title={accessibleName}>
      {content}
    </div>
  );
}
