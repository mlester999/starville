/* eslint-disable react-refresh/only-export-components */

import Link from 'next/link';
import type { ReactNode } from 'react';

export function EconomyPageHeader({
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
    <header className="economy-page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="economy-page-title">{title}</h1>
        <p>{description}</p>
      </div>
      {actions === undefined ? null : <div className="economy-page-header__actions">{actions}</div>}
    </header>
  );
}

export function EconomyNotice({ notice }: { readonly notice: string | undefined }) {
  if (notice === undefined || notice === '') return null;
  return (
    <p className="notice-banner" role="status">
      Operation recorded: {notice.replaceAll('-', ' ')}.
    </p>
  );
}

export function MetricCard({
  label,
  value,
  detail,
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly detail?: string;
}) {
  return (
    <article className="economy-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail === undefined ? null : <small>{detail}</small>}
    </article>
  );
}

export function StatusChip({ value }: { readonly value: string }) {
  return <span className={`economy-status economy-status--${value}`}>{friendlyKey(value)}</span>;
}

export function EmptyState({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="economy-empty-state">
      <span aria-hidden="true">◇</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

export function LifecycleStepper({
  status,
  kind,
}: {
  readonly status: string;
  readonly kind: 'policy' | 'shop';
}) {
  const steps = ['draft', 'validated', 'in_review', 'approved', 'scheduled', 'published'];
  const currentIndex = steps.indexOf(status);
  const terminal = status === 'disabled' || status === 'superseded' || status === 'retired';
  return (
    <ol className="economy-lifecycle" aria-label={`${kind} version lifecycle`}>
      {steps.map((step, index) => (
        <li
          className={
            terminal
              ? 'is-complete'
              : index < currentIndex
                ? 'is-complete'
                : index === currentIndex
                  ? 'is-current'
                  : undefined
          }
          key={step}
        >
          <span aria-hidden="true">{index + 1}</span>
          <strong>{friendlyKey(step)}</strong>
        </li>
      ))}
      {terminal ? (
        <li className="is-current">
          <span aria-hidden="true">7</span>
          <strong>{friendlyKey(status)}</strong>
        </li>
      ) : null}
    </ol>
  );
}

export function Pagination({
  pathname,
  page,
  totalPages,
  query,
}: {
  readonly pathname: string;
  readonly page: number;
  readonly totalPages: number;
  readonly query: Readonly<object>;
}) {
  function href(nextPage: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === 'string' && value !== '') params.set(key, value);
    }
    params.set('page', String(nextPage));
    return `${pathname}?${params.toString()}`;
  }
  return (
    <nav aria-label="Pagination" className="economy-pagination">
      {page > 1 ? <Link href={href(page - 1)}>Previous</Link> : <span>Previous</span>}
      <span aria-live="polite">
        Page {page} of {Math.max(1, totalPages)}
      </span>
      {page < totalPages ? <Link href={href(page + 1)}>Next</Link> : <span>Next</span>}
    </nav>
  );
}

export function friendlyKey(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

export function formatDust(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Unavailable' : `${value.toLocaleString()} DUST`;
}

export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Unavailable' : value.toLocaleString();
}

export function formatDate(value: string | null | undefined): string {
  if (value === null || value === undefined) return 'Not yet';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Unavailable' : `${(value * 100).toFixed(1)}%`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return 'None';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3_600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3_600)}h`;
}

export function planningLabel(ratio: number | null): string {
  if (ratio === null) return 'Not enough data yet';
  if (ratio < 0.95) return 'Sink Heavy';
  if (ratio <= 1.1) return 'Balanced Planning Range';
  if (ratio <= 1.5) return 'Moderately Inflationary';
  return 'Highly Inflationary';
}
