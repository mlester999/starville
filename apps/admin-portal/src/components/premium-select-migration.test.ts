import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LockedConfigField } from './locked-config-field';
import { PremiumSelect } from './premium-select';

function read(relativeFromComponents: string): string {
  return readFileSync(new URL(relativeFromComponents, import.meta.url), 'utf8');
}

const adminSources = {
  premiumSelect: read('./premium-select.tsx'),
  lockedField: read('./locked-config-field.tsx'),
  tokenGate: read('./token-gate-form.tsx'),
  announcementEditor: read('./announcement-editor.tsx'),
  announcementFilters: read('./announcement-filters.tsx'),
  worldEditor: read('./world-editor.tsx'),
  playersPage: read('../app/(protected)/players/page.tsx'),
  playerDetail: read('../app/(protected)/players/[playerId]/page.tsx'),
  worldsPage: read('../app/(protected)/worlds/page.tsx'),
  livePage: read('../app/(protected)/operations/live/page.tsx'),
  mfaPage: read('../app/mfa-required/page.tsx'),
  globalsCss: read('../app/globals.css'),
};

const migratedSources = [
  adminSources.tokenGate,
  adminSources.announcementEditor,
  adminSources.announcementFilters,
  adminSources.worldEditor,
  adminSources.playersPage,
  adminSources.playerDetail,
  adminSources.worldsPage,
  adminSources.livePage,
  adminSources.mfaPage,
];

describe('global admin PremiumSelect migration', () => {
  it('does not leave raw native selects on migrated administrator surfaces', () => {
    for (const source of migratedSources) {
      expect(source).not.toMatch(/<select[\s>]/u);
    }
  });

  it('locks Network to Solana Mainnet without dropdown semantics or Devnet', () => {
    expect(adminSources.tokenGate).toContain('LockedConfigField');
    expect(adminSources.tokenGate).toContain('Solana Mainnet');
    expect(adminSources.tokenGate).toContain('MAINNET');
    expect(adminSources.tokenGate).toContain('Locked production network');
    expect(adminSources.tokenGate).toContain("ADMIN_UI_NETWORK = 'solana:mainnet-beta'");
    expect(adminSources.tokenGate).toContain('name="network"');
    expect(adminSources.tokenGate).not.toContain('Solana Devnet');
    expect(adminSources.tokenGate).not.toContain('solana:devnet');
    expect(adminSources.tokenGate).not.toMatch(/name=["']network["'][\s\S]{0,80}<select/u);
    expect(adminSources.tokenGate).not.toContain('aria-haspopup="listbox"');

    const markup = renderToStaticMarkup(
      createElement(LockedConfigField, {
        id: 'token-network',
        label: 'Network',
        value: 'Solana Mainnet',
        badge: 'MAINNET',
        description: 'Locked production network',
        name: 'network',
        hiddenValue: 'solana:mainnet-beta',
      }),
    );

    expect(markup).toContain('locked-config-field');
    expect(markup).toContain('Solana Mainnet');
    expect(markup).toContain('MAINNET');
    expect(markup).toContain('type="hidden"');
    expect(markup).toContain('name="network"');
    expect(markup).toContain('value="solana:mainnet-beta"');
    expect(markup).toContain('role="group"');
    expect(markup).not.toContain('combobox');
    expect(markup).not.toContain('listbox');
    expect(markup).not.toContain('chevron');
  });

  it('locks RPC commitment as system-managed with form hidden value preserved', () => {
    expect(adminSources.tokenGate).toContain('Managed by system configuration');
    expect(adminSources.tokenGate).toContain('name="commitment"');
    expect(adminSources.tokenGate).toContain('config.commitment');
    expect(adminSources.tokenGate).not.toMatch(/name=["']commitment["'][\s\S]{0,120}<select/u);
    expect(adminSources.tokenGate).not.toContain('<option value="finalized">');
  });

  it('renders PremiumSelect closed trigger with chevron and form hidden input', () => {
    const markup = renderToStaticMarkup(
      createElement(PremiumSelect, {
        id: 'demo-status',
        name: 'status',
        defaultValue: 'active',
        options: [
          { value: 'all', label: 'All states' },
          { value: 'active', label: 'Active' },
          { value: 'suspended', label: 'Suspended', description: 'Blocked profiles' },
        ],
      }),
    );

    expect(markup).toContain('premium-select');
    expect(markup).toContain('premium-select__trigger');
    expect(markup).toContain('premium-select__chevron');
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-haspopup="listbox"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('type="hidden"');
    expect(markup).toContain('name="status"');
    expect(markup).toContain('value="active"');
    expect(markup).toContain('Active');
    expect(markup).not.toContain('<select');
  });

  it('supports accessibility and viewport-safe open-list contracts in the shared component', () => {
    expect(adminSources.premiumSelect).toContain("case 'ArrowDown'");
    expect(adminSources.premiumSelect).toContain("case 'ArrowUp'");
    expect(adminSources.premiumSelect).toContain("case 'Escape'");
    expect(adminSources.premiumSelect).toContain("case 'Enter'");
    expect(adminSources.premiumSelect).toContain("case ' '");
    expect(adminSources.premiumSelect).toContain("case 'Home'");
    expect(adminSources.premiumSelect).toContain("case 'End'");
    expect(adminSources.premiumSelect).toContain("case 'Tab'");
    expect(adminSources.premiumSelect).toContain('aria-activedescendant');
    expect(adminSources.premiumSelect).toContain('role="listbox"');
    expect(adminSources.premiumSelect).toContain('role="option"');
    expect(adminSources.premiumSelect).toContain('createPortal');
    expect(adminSources.premiumSelect).toContain('premium-select__list--portal');
    expect(adminSources.premiumSelect).toContain("'above'");
    expect(adminSources.premiumSelect).toContain('measureListPosition');
    expect(adminSources.premiumSelect).toContain('is-selected');
    expect(adminSources.premiumSelect).toContain('premium-select__check');
    expect(adminSources.premiumSelect).toContain('option.description');
    expect(adminSources.premiumSelect).toContain('loading');
    expect(adminSources.premiumSelect).toContain('error');
    expect(adminSources.premiumSelect).toContain("size = 'normal'");
  });

  it('migrates player, world, MFA, and access page-size filters onto PremiumSelect', () => {
    expect(adminSources.playersPage).toContain('PremiumSelect');
    expect(adminSources.playersPage).toContain('name="status"');
    expect(adminSources.playersPage).toContain('name="rename"');
    expect(adminSources.playersPage).toContain('name="recentDays"');
    expect(adminSources.playersPage).toContain('name="mapId"');
    expect(adminSources.playersPage).toContain('name="sort"');
    expect(adminSources.playersPage).toContain('name="direction"');

    expect(adminSources.worldsPage).toContain('PremiumSelect');
    expect(adminSources.worldsPage).toContain('name="status"');
    expect(adminSources.worldsPage).toContain('name="sort"');
    expect(adminSources.worldsPage).toContain('name="direction"');

    expect(adminSources.playerDetail).toContain('PremiumSelect');
    expect(adminSources.playerDetail).toContain('name="accessPageSize"');
    expect(adminSources.playerDetail).toContain('10 per page');
    expect(adminSources.playerDetail).toContain('accessPage');

    expect(adminSources.mfaPage).toContain('PremiumSelect');
    expect(adminSources.mfaPage).toContain('name="factorId"');
    expect(adminSources.mfaPage).toContain('required');
  });

  it('migrates world editor selects onto the shared PremiumSelect', () => {
    expect(adminSources.worldEditor).toContain('PremiumSelect');
    expect(adminSources.worldEditor).toContain('Approved asset');
    expect(adminSources.worldEditor).toContain('Object kind');
    expect(adminSources.worldEditor).toContain('Facing direction');
    expect(adminSources.worldEditor).toContain('Spawn purpose');
    expect(adminSources.worldEditor).not.toMatch(/<select[\s>]/u);
  });

  it('keeps chevron and portal popover styling free of native arrows on premium selects', () => {
    expect(adminSources.globalsCss).toContain('.premium-select__chevron');
    expect(adminSources.globalsCss).toContain('.premium-select.is-open .premium-select__chevron');
    expect(adminSources.globalsCss).toContain('rotate(180deg)');
    expect(adminSources.globalsCss).toContain('.premium-select__list--portal');
    expect(adminSources.globalsCss).toContain('z-index: 80');
    expect(adminSources.globalsCss).toContain('.locked-config-field__surface');
    expect(adminSources.globalsCss).toContain('.locked-config-field__badge');
    expect(adminSources.globalsCss).toContain('padding: 0.65rem 3rem 0.65rem 0.95rem');
  });
});
