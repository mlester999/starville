'use client';

import Link from 'next/link';

import { PremiumSelect } from './premium-select';

export interface AnnouncementFilterQuery {
  readonly search: string;
  readonly status: string;
  readonly severity: string;
  readonly presentation: string;
  readonly sort: string;
  readonly direction: string;
  readonly pageSize: string;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'deactivated', label: 'Deactivated' },
  { value: 'archived', label: 'Archived' },
] as const;

const SEVERITY_OPTIONS = [
  { value: 'all', label: 'All severities' },
  { value: 'information', label: 'Information' },
  { value: 'success', label: 'Success' },
  { value: 'warning', label: 'Warning' },
  { value: 'critical', label: 'Critical' },
] as const;

const PRESENTATION_OPTIONS = [
  { value: 'all', label: 'All presentations' },
  { value: 'ticker', label: 'Ticker' },
  { value: 'banner', label: 'Banner' },
] as const;

const SORT_OPTIONS = [
  { value: 'updated_at', label: 'Updated' },
  { value: 'priority', label: 'Priority' },
  { value: 'starts_at', label: 'Start time' },
  { value: 'internal_title', label: 'Title' },
] as const;

const DIRECTION_OPTIONS = [
  { value: 'desc', label: 'Descending' },
  { value: 'asc', label: 'Ascending' },
] as const;

export function AnnouncementFilters({ query }: { readonly query: AnnouncementFilterQuery }) {
  return (
    <form className="live-ops-filters" method="get" role="search">
      <div className="field live-ops-filters__search">
        <label htmlFor="announcement-search">Search</label>
        <input
          defaultValue={query.search}
          id="announcement-search"
          maxLength={100}
          name="search"
          placeholder="Title or message"
          type="search"
        />
      </div>
      <div className="field">
        <label htmlFor="announcement-filter-status">Status</label>
        <PremiumSelect
          defaultValue={query.status}
          id="announcement-filter-status"
          name="status"
          options={STATUS_OPTIONS}
        />
      </div>
      <div className="field">
        <label htmlFor="announcement-filter-severity">Severity</label>
        <PremiumSelect
          defaultValue={query.severity}
          id="announcement-filter-severity"
          name="severity"
          options={SEVERITY_OPTIONS}
        />
      </div>
      <div className="field">
        <label htmlFor="announcement-filter-presentation">Presentation</label>
        <PremiumSelect
          defaultValue={query.presentation}
          id="announcement-filter-presentation"
          name="presentation"
          options={PRESENTATION_OPTIONS}
        />
      </div>
      <div className="field">
        <label htmlFor="announcement-filter-sort">Sort</label>
        <PremiumSelect
          defaultValue={query.sort}
          id="announcement-filter-sort"
          name="sort"
          options={SORT_OPTIONS}
        />
      </div>
      <div className="field">
        <label htmlFor="announcement-filter-direction">Direction</label>
        <PremiumSelect
          defaultValue={query.direction}
          id="announcement-filter-direction"
          name="direction"
          options={DIRECTION_OPTIONS}
        />
      </div>
      <div className="live-ops-filters__actions">
        <button className="button button--primary" type="submit">
          Apply filters
        </button>
        <Link className="button button--quiet" href="/operations/live">
          Clear
        </Link>
      </div>
    </form>
  );
}
