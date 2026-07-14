import type { PlatformAssetUrls, PlatformConfiguration } from '@starville/platform-configuration';
import type { CSSProperties } from 'react';

function previewStyle(configuration: PlatformConfiguration): CSSProperties {
  return {
    '--preview-background': configuration.theme.tokens.background,
    '--preview-surface': configuration.theme.tokens.surface,
    '--preview-text': configuration.theme.tokens.textPrimary,
    '--preview-primary': configuration.theme.tokens.primaryAction,
    '--preview-primary-text': configuration.theme.tokens.primaryActionText,
  } as CSSProperties;
}

function PreviewFrame({
  configuration,
  label,
  assetUrls,
}: {
  readonly configuration: PlatformConfiguration;
  readonly label: string;
  readonly assetUrls: PlatformAssetUrls;
}) {
  const hero = configuration.landing.sections.find(({ key }) => key === 'hero');
  return (
    <section
      aria-label={`${label} landing presentation`}
      className="platform-preview-frame"
      style={{
        ...previewStyle(configuration),
        ...((assetUrls.landing.hero ?? assetUrls.branding.landing_hero_background)
          ? {
              backgroundImage: `linear-gradient(${configuration.theme.tokens.landingHeroOverlay}b8, ${configuration.theme.tokens.landingHeroOverlay}b8), url("${assetUrls.landing.hero ?? assetUrls.branding.landing_hero_background}")`,
              backgroundPosition: 'center',
              backgroundSize: 'cover',
            }
          : {}),
      }}
    >
      <header>
        <strong>{configuration.branding.shortGameName}</strong>
        <nav>How to play · Docs · Community</nav>
      </header>
      <div className="platform-preview-frame__hero">
        <p>{hero?.items[0]?.heading ?? configuration.branding.tagline}</p>
        <h2>{hero?.heading ?? configuration.branding.fullGameName}</h2>
        <p>{hero?.description ?? configuration.branding.shortDescription}</p>
        <button type="button">{hero?.ctaLabel ?? 'Play now'}</button>
      </div>
      <footer>{configuration.branding.copyrightText}</footer>
    </section>
  );
}

function AdminShellPreview({ configuration }: { readonly configuration: PlatformConfiguration }) {
  const navigation = [...configuration.navigation.items]
    .filter((item) =>
      configuration.modules.some((module) => module.key === item.moduleKey && module.enabled),
    )
    .sort((first, second) => first.order - second.order);
  return (
    <section className="platform-preview-admin" style={previewStyle(configuration)}>
      <aside>
        <strong>{configuration.branding.shortGameName}</strong>
        <small>{configuration.branding.administrationName}</small>
        <nav>
          {navigation.map((item) => (
            <span key={item.routeKey}>{item.label}</span>
          ))}
        </nav>
      </aside>
      <div>
        <p className="eyebrow">Admin shell preview</p>
        <h2>Presentation workspace</h2>
        <p>Permissions and route authorization remain server-authoritative.</p>
        <button type="button">Primary action</button>
      </div>
    </section>
  );
}

function LoginPreview({
  configuration,
  assetUrls,
}: {
  readonly configuration: PlatformConfiguration;
  readonly assetUrls: PlatformAssetUrls;
}) {
  return (
    <section
      className="platform-preview-login"
      style={{
        ...previewStyle(configuration),
        ...(assetUrls.branding.admin_login_background === null
          ? {}
          : {
              backgroundImage: `linear-gradient(${configuration.theme.tokens.loginPageOverlay}c2, ${configuration.theme.tokens.loginPageOverlay}c2), url("${assetUrls.branding.admin_login_background}")`,
              backgroundPosition: 'center',
              backgroundSize: 'cover',
            }),
      }}
    >
      <div>
        <strong>{configuration.branding.administrationName}</strong>
        <p>{configuration.adminLogin.subtitle}</p>
      </div>
      <div>
        <small>{configuration.adminLogin.eyebrow}</small>
        <h2>{configuration.adminLogin.title}</h2>
        <p>{configuration.adminLogin.supportingDescription}</p>
        <label>
          Email
          <input disabled type="email" />
        </label>
        <button type="button">Continue securely</button>
        <small>{configuration.adminLogin.securityNotice}</small>
      </div>
    </section>
  );
}

export function PlatformPreview({
  current,
  draft,
  currentAssetUrls,
  draftAssetUrls,
}: {
  readonly current: PlatformConfiguration;
  readonly draft: PlatformConfiguration;
  readonly currentAssetUrls: PlatformAssetUrls;
  readonly draftAssetUrls: PlatformAssetUrls;
}) {
  return (
    <div className="platform-preview-comparison">
      <div>
        <h2>Current published</h2>
        <PreviewFrame
          assetUrls={currentAssetUrls}
          configuration={current}
          label="Current published"
        />
      </div>
      <div>
        <h2>Exact draft</h2>
        <PreviewFrame assetUrls={draftAssetUrls} configuration={draft} label="Exact draft" />
      </div>
      <div className="platform-preview-comparison__wide">
        <h2>Exact draft admin shell</h2>
        <AdminShellPreview configuration={draft} />
      </div>
      <div className="platform-preview-comparison__wide">
        <h2>Exact draft admin login</h2>
        <LoginPreview assetUrls={draftAssetUrls} configuration={draft} />
      </div>
    </div>
  );
}
