import Link from 'next/link';

import {
  BRANDING_ASSET_PROFILES,
  PLATFORM_FONT_REGISTRY,
  PLATFORM_ICON_KEYS,
  PLATFORM_MODULE_REGISTRY,
  type PlatformConfiguration,
} from '@starville/platform-configuration';

import { savePlatformSectionAction } from '../app/actions/platform-configuration';
import { PremiumSelect } from './premium-select';
import { PlatformSettingsForm } from './platform-settings-form';

export type PlatformSettingsSection =
  'branding' | 'theme' | 'typography' | 'admin-login' | 'landing' | 'navigation' | 'modules';

interface Props {
  readonly section: PlatformSettingsSection;
  readonly configuration: PlatformConfiguration;
  readonly versionId: string;
  readonly revision: number;
  readonly editable: boolean;
  readonly assetOptions?: Readonly<Record<string, readonly { value: string; label: string }[]>>;
}

function TextField({
  label,
  name,
  value,
  type = 'text',
  required = false,
  maxLength = 500,
}: {
  readonly label: string;
  readonly name: string;
  readonly value: string | null;
  readonly type?: 'text' | 'email' | 'url' | 'number' | 'color';
  readonly required?: boolean;
  readonly maxLength?: number;
}) {
  return (
    <label className="platform-field">
      <span>{label}</span>
      <input
        defaultValue={value ?? ''}
        maxLength={type === 'number' || type === 'color' ? undefined : maxLength}
        name={name}
        required={required}
        type={type}
      />
    </label>
  );
}

export function PlatformSettingsEditor({
  section,
  configuration,
  versionId,
  revision,
  editable,
  assetOptions = {},
}: Props) {
  return (
    <PlatformSettingsForm action={savePlatformSectionAction}>
      <input name="section" type="hidden" value={section} />
      <input name="versionId" type="hidden" value={versionId} />
      <input name="expectedRevision" type="hidden" value={revision} />
      <input name="requestId" type="hidden" value={crypto.randomUUID()} />
      <fieldset className="platform-editor-card" disabled={!editable}>
        <legend>{section.replace('-', ' ')}</legend>
        {section === 'branding' ? (
          <>
            <div className="platform-field-grid">
              <TextField
                label="Full game name"
                name="fullGameName"
                required
                value={configuration.branding.fullGameName}
              />
              <TextField
                label="Short game name"
                name="shortGameName"
                required
                value={configuration.branding.shortGameName}
              />
              <TextField
                label="Administration name"
                name="administrationName"
                required
                value={configuration.branding.administrationName}
              />
              <TextField
                label="Tagline"
                name="tagline"
                required
                value={configuration.branding.tagline}
              />
              <TextField
                label="Support email"
                name="supportEmail"
                type="email"
                value={configuration.branding.supportEmail}
              />
              <TextField
                label="Copyright text"
                name="copyrightText"
                required
                value={configuration.branding.copyrightText}
              />
            </div>
            <label className="platform-field platform-field--wide">
              <span>Short description</span>
              <textarea
                defaultValue={configuration.branding.shortDescription}
                maxLength={320}
                name="shortDescription"
                required
              />
            </label>
            <div className="platform-field-grid">
              {(
                [
                  'primaryWebsiteUrl',
                  'documentationUrl',
                  'discordUrl',
                  'xUrl',
                  'communityUrl',
                  'legalUrl',
                  'privacyUrl',
                  'termsUrl',
                ] as const
              ).map((key) => (
                <TextField
                  key={key}
                  label={key.replaceAll(/([A-Z])/gu, ' $1')}
                  name={key}
                  type="text"
                  value={configuration.branding[key]}
                />
              ))}
            </div>
            <div className="platform-assets-heading">
              <div>
                <h2>Approved branding assets</h2>
                <p>Only active, approved versions from World Assets can be published.</p>
              </div>
              <Link href="/world-assets?category=branding">Manage assets</Link>
            </div>
            <div className="platform-field-grid">
              {BRANDING_ASSET_PROFILES.map((profile) => (
                <label className="platform-field" key={profile}>
                  <span>{profile.replaceAll('_', ' ')}</span>
                  <PremiumSelect
                    name={`asset_${profile}`}
                    defaultValue={configuration.brandingAssets[profile] ?? ''}
                    options={[
                      { value: '', label: 'Use compiled Starville asset' },
                      ...(assetOptions[profile] ?? []),
                    ]}
                  />
                </label>
              ))}
            </div>
          </>
        ) : null}

        {section === 'theme' ? (
          <>
            <label className="platform-field">
              <span>Theme preset</span>
              <PremiumSelect
                name="preset"
                defaultValue={configuration.theme.preset}
                options={[
                  { value: 'starville_twilight', label: 'Starville twilight' },
                  { value: 'cozy_light', label: 'Cozy light' },
                  { value: 'custom', label: 'Custom' },
                ]}
              />
            </label>
            <div className="platform-preset-actions">
              <button data-theme-preset="starville_twilight" type="button">
                Restore Starville defaults
              </button>
              <button data-theme-preset="cozy_light" type="button">
                Apply cozy light preset
              </button>
            </div>
            <div className="platform-color-grid">
              {Object.entries(configuration.theme.tokens).map(([key, value]) => (
                <label className="platform-color" key={key}>
                  <span>{key.replaceAll(/([A-Z])/gu, ' $1')}</span>
                  <input defaultValue={value} name={`token_${key}`} type="color" />
                  <code>{value}</code>
                </label>
              ))}
            </div>
            <p className="platform-help">
              Validation reports contrast numerically and blocks unreadable primary text and
              controls.
            </p>
          </>
        ) : null}

        {section === 'typography' ? (
          <div className="platform-field-grid">
            {(['display', 'heading', 'body', 'monospace'] as const).map((role) => (
              <label className="platform-field" key={role}>
                <span>{role} font</span>
                <PremiumSelect
                  name={role}
                  defaultValue={configuration.typography[role]}
                  options={Object.entries(PLATFORM_FONT_REGISTRY).map(([value, font]) => ({
                    value,
                    label: font.label,
                    description: font.stack,
                  }))}
                />
              </label>
            ))}
            <div className="platform-type-preview">
              <h2>Headings stay warm and readable.</h2>
              <p>
                Body copy, labels, buttons, and tables use bundled or system-safe font stacks only.
              </p>
              <button type="button">Preview button</button>
            </div>
          </div>
        ) : null}

        {section === 'admin-login' ? (
          <>
            <div className="platform-field-grid">
              <TextField
                label="Eyebrow"
                name="eyebrow"
                required
                value={configuration.adminLogin.eyebrow}
              />
              <TextField
                label="Title"
                name="title"
                required
                value={configuration.adminLogin.title}
              />
              <TextField
                label="Subtitle"
                name="subtitle"
                required
                value={configuration.adminLogin.subtitle}
              />
              <TextField
                label="Support link"
                name="supportLink"
                type="url"
                value={configuration.adminLogin.supportLink}
              />
              <TextField
                label="Documentation link"
                name="documentationLink"
                type="url"
                value={configuration.adminLogin.documentationLink}
              />
              <TextField
                label="Background focal point X"
                name="backgroundFocalPointX"
                type="number"
                value={String(configuration.adminLogin.backgroundFocalPointX)}
              />
              <TextField
                label="Background focal point Y"
                name="backgroundFocalPointY"
                type="number"
                value={String(configuration.adminLogin.backgroundFocalPointY)}
              />
              <TextField
                label="Overlay strength"
                name="overlayStrength"
                type="number"
                value={String(configuration.adminLogin.overlayStrength)}
              />
            </div>
            {(['supportingDescription', 'securityNotice', 'footerCopy'] as const).map((key) => (
              <label className="platform-field platform-field--wide" key={key}>
                <span>{key.replaceAll(/([A-Z])/gu, ' $1')}</span>
                <textarea
                  defaultValue={configuration.adminLogin[key]}
                  maxLength={500}
                  name={key}
                  required
                />
              </label>
            ))}
            <p className="platform-help">
              Authentication fields, MFA, recovery controls, and security behavior cannot be removed
              here.
            </p>
          </>
        ) : null}

        {section === 'landing' ? (
          <>
            <div className="platform-landing-list">
              {[...configuration.landing.sections]
                .sort((first, second) => first.order - second.order)
                .map((landingSection) => {
                  const prefix = `landing_${landingSection.key}`;
                  return (
                    <section className="platform-landing-card" key={landingSection.key}>
                      <header>
                        <div>
                          <strong>{landingSection.key.replaceAll('_', ' ')}</strong>
                          <small>Structured section · registered type</small>
                        </div>
                        <label className="platform-toggle">
                          <input
                            defaultChecked={landingSection.enabled}
                            name={`${prefix}_enabled`}
                            type="checkbox"
                          />
                          <span>Enabled</span>
                        </label>
                      </header>
                      <div className="platform-field-grid">
                        <TextField
                          label="Display order"
                          name={`${prefix}_order`}
                          type="number"
                          value={String(landingSection.order)}
                        />
                        <TextField
                          label="Heading"
                          name={`${prefix}_heading`}
                          value={landingSection.heading}
                        />
                        <TextField
                          label="Action label"
                          name={`${prefix}_ctaLabel`}
                          value={landingSection.ctaLabel}
                        />
                        <TextField
                          label="Action destination"
                          name={`${prefix}_ctaDestination`}
                          value={landingSection.ctaDestination}
                        />
                        <label className="platform-field">
                          <span>Approved visual</span>
                          <PremiumSelect
                            name={`${prefix}_assetVersionId`}
                            defaultValue={landingSection.assetVersionId ?? ''}
                            options={[
                              { value: '', label: 'No section visual' },
                              ...(assetOptions['landing_hero_background'] ?? []),
                              ...(assetOptions['social_share_image'] ?? []),
                            ]}
                          />
                        </label>
                      </div>
                      <label className="platform-field platform-field--wide">
                        <span>Description</span>
                        <textarea
                          defaultValue={landingSection.description ?? ''}
                          maxLength={500}
                          name={`${prefix}_description`}
                        />
                      </label>
                      {[
                        ...landingSection.items,
                        ...(landingSection.items.length < 8
                          ? [{ heading: '', description: '' }]
                          : []),
                      ].map((item, index) => {
                        const existing = index < landingSection.items.length;
                        return (
                          <div className="platform-field-grid" key={index}>
                            <TextField
                              label={`${existing ? 'Supporting' : 'Add supporting'} item ${String(index + 1)} heading`}
                              name={`${prefix}_itemHeading_${String(index)}`}
                              required={existing}
                              value={item.heading}
                            />
                            <label className="platform-field platform-field--wide">
                              <span>Supporting item description</span>
                              <textarea
                                defaultValue={item.description}
                                maxLength={240}
                                name={`${prefix}_itemDescription_${String(index)}`}
                                required={existing}
                              />
                            </label>
                          </div>
                        );
                      })}
                    </section>
                  );
                })}
            </div>
            <p className="platform-help">
              Order values must be unique. Structured copy only: raw HTML, scripts, CSS, arbitrary
              embeds, and wallet-access overrides are rejected.
            </p>
          </>
        ) : null}

        {section === 'navigation' ? (
          <>
            <label className="platform-toggle">
              <input
                defaultChecked={configuration.navigation.collapsedByDefault}
                name="collapsedByDefault"
                type="checkbox"
              />
              <span>Start navigation collapsed</span>
            </label>
            <div className="platform-navigation-list">
              {configuration.navigation.items.map((item) => (
                <div className="platform-navigation-row" key={item.routeKey}>
                  <div>
                    <strong>{item.label}</strong>
                    <small>{item.group} · registered route</small>
                  </div>
                  <TextField
                    label="Display label"
                    name={`label_${item.routeKey}`}
                    required
                    value={item.label}
                  />
                  <TextField
                    label="Order"
                    name={`order_${item.routeKey}`}
                    type="number"
                    value={String(item.order)}
                  />
                  <TextField
                    label="Group"
                    name={`group_${item.routeKey}`}
                    required
                    value={item.group}
                  />
                  <TextField
                    label="Optional badge"
                    name={`badge_${item.routeKey}`}
                    value={item.badgeLabel}
                  />
                  <label className="platform-field">
                    <span>Approved icon</span>
                    <PremiumSelect
                      name={`icon_${item.routeKey}`}
                      defaultValue={item.icon}
                      options={PLATFORM_ICON_KEYS.map((icon) => ({
                        value: icon,
                        label: icon.replaceAll('_', ' '),
                      }))}
                    />
                  </label>
                </div>
              ))}
            </div>
            <p className="platform-help">
              Labels and order affect presentation only. Routes, permissions, and authorization
              remain fixed in the trusted registry.
            </p>
          </>
        ) : null}

        {section === 'modules' ? (
          <div className="platform-module-grid">
            {configuration.modules.map((module) => {
              const definition = PLATFORM_MODULE_REGISTRY[module.key];
              return (
                <div className="platform-module-card" key={module.key}>
                  <label className="platform-module-toggle">
                    <input
                      defaultChecked={module.enabled}
                      disabled={definition.required}
                      name={`module_${module.key}`}
                      type="checkbox"
                    />
                    <span>
                      <strong>{module.label}</strong>
                      <small>
                        {definition.required
                          ? 'Required security module'
                          : `Optional · ${definition.dependencies.length} dependencies`}
                      </small>
                    </span>
                  </label>
                  {definition.required ? (
                    <input name={`module_${module.key}`} type="hidden" value="on" />
                  ) : null}
                  <TextField
                    label="Module display label"
                    name={`module_label_${module.key}`}
                    required
                    value={module.label}
                  />
                </div>
              );
            })}
            <p className="platform-help">
              Disabling a module hides its navigation and blocks registered module access without
              deleting data, permissions, or audit history.
            </p>
          </div>
        ) : null}
      </fieldset>

      <div className="platform-sticky-actions">
        <label>
          <span>Reason for this draft change</span>
          <input maxLength={500} minLength={3} name="reason" required />
        </label>
        <Link href={`/platform-settings/preview?version=${versionId}`}>Preview draft</Link>
        <button disabled={!editable} type="submit">
          Save draft
        </button>
      </div>
    </PlatformSettingsForm>
  );
}
