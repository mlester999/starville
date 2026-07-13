import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AnnouncementFilters } from './announcement-filters';
import { PremiumSelect } from './premium-select';

const pageSource = readFileSync(
  new URL('../app/(protected)/operations/live/page.tsx', import.meta.url),
  'utf8',
);
const maintenanceSource = readFileSync(
  new URL('./maintenance-control.tsx', import.meta.url),
  'utf8',
);
const announcementEditorSource = readFileSync(
  new URL('./announcement-editor.tsx', import.meta.url),
  'utf8',
);
const filtersSource = readFileSync(new URL('./announcement-filters.tsx', import.meta.url), 'utf8');
const premiumSelectSource = readFileSync(new URL('./premium-select.tsx', import.meta.url), 'utf8');
const globalsCss = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

function liveOpsSources(): string {
  return [pageSource, maintenanceSource, announcementEditorSource, filtersSource].join('\n');
}

describe('Live Operations premium form controls', () => {
  it('groups Enable maintenance with its label, description, and switch', () => {
    expect(maintenanceSource).toContain('field field--switch');
    expect(maintenanceSource).toContain('htmlFor="maintenance-enabled"');
    expect(maintenanceSource).toContain('id="maintenance-enabled"');
    expect(maintenanceSource).toContain('Enable maintenance');
    expect(maintenanceSource).toContain(
      'Draft only. Nothing goes live until you review and confirm',
    );
    expect(maintenanceSource).toContain('maintenance-status-banner');
    expect(maintenanceSource).toContain('className="admin-switch"');
    expect(maintenanceSource).toContain('name="enabled"');
    expect(maintenanceSource).not.toMatch(
      /<label[^>]*>\s*<input[^>]*type="checkbox"[^/]*\/>\s*Enable maintenance/u,
    );
  });

  it('groups Auto-disable and Return-to-landing controls with their labels', () => {
    expect(maintenanceSource).toContain('htmlFor="maintenance-auto-disable"');
    expect(maintenanceSource).toContain('Auto-disable at expected end');
    expect(maintenanceSource).toContain(
      'Automatically disables maintenance when the configured end time is reached.',
    );
    expect(maintenanceSource).toContain('name="autoDisableAtEnd"');

    expect(maintenanceSource).toContain('htmlFor="maintenance-return-landing"');
    expect(maintenanceSource).toContain('Show return-to-landing action');
    expect(maintenanceSource).toContain(
      'Shows a safe button that returns the player to the Starville landing page.',
    );
    expect(maintenanceSource).toContain('name="showReturnToLanding"');
  });

  it('uses shared dark field classes instead of white browser defaults', () => {
    expect(maintenanceSource).toContain('className="field"');
    expect(announcementEditorSource).toContain('className="field"');
    expect(globalsCss).toContain('background: var(--admin-surface-solid)');
    expect(globalsCss).not.toMatch(
      /\.live-operations-form input[\s\S]{0,120}background:\s*var\(--color-surface,\s*#fff\)/u,
    );
    expect(globalsCss).toContain('.admin-datetime');
    expect(globalsCss).toContain('color-scheme: light dark');
  });

  it('uses PremiumSelect with chevron and custom options popover', () => {
    const markup = renderToStaticMarkup(
      createElement(PremiumSelect, {
        id: 'demo-select',
        name: 'severity',
        defaultValue: 'warning',
        options: [
          { value: 'information', label: 'Information' },
          { value: 'warning', label: 'Warning' },
          { value: 'critical', label: 'Critical' },
        ],
      }),
    );

    expect(markup).toContain('premium-select');
    expect(markup).toContain('premium-select__trigger');
    expect(markup).toContain('premium-select__chevron');
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-haspopup="listbox"');
    expect(markup).toContain('type="hidden"');
    expect(markup).toContain('name="severity"');
    expect(markup).toContain('value="warning"');
    expect(markup).toContain('Warning');
    expect(premiumSelectSource).toContain('role="listbox"');
    expect(premiumSelectSource).toContain('role="option"');
    expect(premiumSelectSource).toContain("case 'ArrowDown'");
    expect(premiumSelectSource).toContain("case 'ArrowUp'");
    expect(premiumSelectSource).toContain("case 'Escape'");
    expect(premiumSelectSource).toContain('premium-select__list--portal');
    expect(premiumSelectSource).toContain("'above'");
    expect(premiumSelectSource).toContain('is-selected');
  });

  it('does not leave raw native selects on the Live Operations surface', () => {
    const sources = liveOpsSources();
    expect(sources).not.toMatch(/<select[\s>]/u);
    expect(sources).toContain('PremiumSelect');
    expect(announcementEditorSource).toContain('./premium-select');
    expect(filtersSource).toContain('./premium-select');
  });

  it('rebuilds announcement filters as a responsive labeled grid', () => {
    const markup = renderToStaticMarkup(
      createElement(AnnouncementFilters, {
        query: {
          search: '',
          status: 'all',
          severity: 'all',
          presentation: 'all',
          sort: 'updated_at',
          direction: 'desc',
          pageSize: '25',
        },
      }),
    );

    expect(markup).toContain('live-ops-filters');
    expect(markup).toContain('live-ops-filters__search');
    expect(markup).toContain('live-ops-filters__actions');
    expect(markup).toContain('Apply filters');
    expect(markup).toContain('Clear');
    expect(markup).toContain('button--primary');
    expect(markup).toContain('button--quiet');
    expect(filtersSource).toContain('htmlFor="announcement-filter-status"');
    expect(filtersSource).toContain('htmlFor="announcement-filter-severity"');
    expect(filtersSource).toContain('htmlFor="announcement-filter-presentation"');
    expect(filtersSource).toContain('htmlFor="announcement-filter-sort"');
    expect(filtersSource).toContain('htmlFor="announcement-filter-direction"');
    expect(globalsCss).toContain('.live-ops-filters');
    expect(globalsCss).toMatch(/@media \(max-width: 768px\)[\s\S]*\.live-ops-filters/u);
  });

  it('shows complete empty states for announcements and audit history', () => {
    expect(pageSource).toContain('No announcements yet');
    expect(pageSource).toContain(
      'Create an announcement to display a message in the Starville game client.',
    );
    expect(pageSource).toContain('Create Announcement');
    expect(pageSource).toContain('href="#create-announcement"');
    expect(pageSource).toContain('No Live Operations activity yet');
    expect(pageSource).toContain('Maintenance and announcement changes will appear here');
    expect(pageSource).toContain('authorized');
    expect(pageSource).toContain('administrator performs an action.');
    expect(pageSource).toContain('empty-state empty-state--compact');
    expect(pageSource).toContain('hasAnnouncements');
    expect(pageSource).toContain('hasAudit');
  });

  it('keeps maintenance form sections balanced and responsive', () => {
    expect(maintenanceSource).toContain('Change draft');
    expect(maintenanceSource).toContain('Player-facing message');
    expect(maintenanceSource).toContain('Schedule');
    expect(maintenanceSource).toContain('Player actions');
    expect(maintenanceSource).toContain('live-ops-form-grid');
    expect(maintenanceSource).toContain('admin-datetime');
    expect(maintenanceSource).toContain('maintenance-status-banner');
    expect(globalsCss).toContain('.live-ops-form-grid');
    expect(globalsCss).toContain('.maintenance-status-banner');
    expect(globalsCss).toMatch(
      /@media \(max-width: 768px\)[\s\S]*\.live-ops-form-grid[\s\S]*grid-template-columns: 1fr/u,
    );
    expect(globalsCss).toContain('overflow-x: clip');
  });

  it('preserves maintenance boolean field names for existing server actions', () => {
    expect(maintenanceSource).toContain('name="enabled"');
    expect(maintenanceSource).toContain('name="autoDisableAtEnd"');
    expect(maintenanceSource).toContain('name="showReturnToLanding"');
    expect(maintenanceSource).toContain('updateMaintenanceAction');
    expect(maintenanceSource).toContain('name="reason"');
    expect(maintenanceSource).toContain('MAINTENANCE');
  });

  it('improves maintenance preview hierarchy without changing content fields', () => {
    expect(pageSource).toContain('maintenance-preview__body');
    expect(pageSource).toContain('maintenance-preview__details');
    expect(pageSource).toContain('maintenance-preview__return');
    expect(pageSource).toContain('maintenance-preview__actions');
    expect(pageSource).toContain('maintenance-preview__meta');
    expect(pageSource).toContain('expectedReturnMessage');
    expect(pageSource).toContain('showReturnToLanding');
    expect(pageSource).toContain('updateDetails');
  });

  it('keeps switch touch targets practical and keyboard-focusable', () => {
    expect(globalsCss).toContain('.admin-switch');
    expect(globalsCss).toContain('min-width: 2.75rem');
    expect(globalsCss).toContain('.admin-switch:focus-visible');
    expect(globalsCss).toContain('.admin-switch:checked');
    expect(globalsCss).toContain('.field--switch');
    expect(globalsCss).toMatch(
      /\.field input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\):not\(\.admin-switch\)/u,
    );
  });
});
