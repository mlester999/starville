import Link from 'next/link';
import type { CSSProperties } from 'react';

import { PLATFORM_FONT_REGISTRY } from '@starville/platform-configuration';

import { AuthFrame } from '../../components/auth-frame';
import { Notice } from '../../components/notice';
import { SubmitButton } from '../../components/submit-button';
import { loginNoticeMessage } from '../../lib/auth/messages';
import { loginAction } from '../actions/auth';
import { loadPublicPlatformConfiguration } from '../../lib/platform-configuration/runtime';

interface LoginPageProps {
  readonly searchParams: Promise<{ readonly notice?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const notice = loginNoticeMessage((await searchParams).notice);
  const runtime = await loadPublicPlatformConfiguration();
  const configuration = runtime.configuration;
  const overlayAlpha = Math.round(configuration.adminLogin.overlayStrength * 255)
    .toString(16)
    .padStart(2, '0');

  return (
    <AuthFrame
      eyebrow={configuration.adminLogin.eyebrow}
      title={configuration.adminLogin.title}
      description={configuration.adminLogin.supportingDescription}
      gameName={configuration.branding.shortGameName.toUpperCase()}
      administrationName={configuration.branding.administrationName.toUpperCase()}
      contextTitle={configuration.adminLogin.subtitle}
      contextFootnote={configuration.adminLogin.footerCopy}
      logoUrl={runtime.assetUrls.branding.brand_logo}
      style={
        {
          '--admin-canvas': configuration.theme.tokens.background,
          '--admin-surface': configuration.theme.tokens.surface,
          '--admin-surface-solid': configuration.theme.tokens.elevatedSurface,
          '--admin-text': configuration.theme.tokens.textPrimary,
          '--admin-text-muted': configuration.theme.tokens.textSecondary,
          '--admin-forest': configuration.theme.tokens.primaryAction,
          '--admin-action-text': configuration.theme.tokens.primaryActionText,
          '--admin-line': configuration.theme.tokens.border,
          '--admin-focus': configuration.theme.tokens.focusRing,
          '--starville-font-display':
            PLATFORM_FONT_REGISTRY[configuration.typography.display].stack,
          '--starville-font-sans': PLATFORM_FONT_REGISTRY[configuration.typography.body].stack,
          '--auth-overlay-color': `${configuration.theme.tokens.loginPageOverlay}${overlayAlpha}`,
          '--auth-background-position': `${String(configuration.adminLogin.backgroundFocalPointX)}% ${String(configuration.adminLogin.backgroundFocalPointY)}%`,
          ...(runtime.assetUrls.branding.admin_login_background === null
            ? {}
            : {
                '--auth-background-image': `url("${runtime.assetUrls.branding.admin_login_background}")`,
              }),
        } as CSSProperties
      }
      footer={
        <div>
          <p>
            Need help? Contact your {configuration.branding.shortGameName} security administrator
            through your approved internal channel.
          </p>
          {configuration.adminLogin.supportLink !== null ? (
            <a href={configuration.adminLogin.supportLink}>Support</a>
          ) : null}
          {configuration.adminLogin.documentationLink !== null ? (
            <a href={configuration.adminLogin.documentationLink}>Administrator documentation</a>
          ) : null}
        </div>
      }
    >
      {notice ? (
        <Notice tone={notice.includes('updated') ? 'success' : 'warning'}>{notice}</Notice>
      ) : null}

      <form className="form-stack" action={loginAction}>
        <div className="field">
          <label htmlFor="email">Staff email</label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            maxLength={254}
            required
          />
        </div>

        <div className="field">
          <div className="field__heading">
            <label htmlFor="password">Password</label>
            <Link href="/forgot-password">Forgot password?</Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={1024}
            required
          />
        </div>

        <SubmitButton pendingLabel="Verifying access…">Continue securely</SubmitButton>
      </form>

      <p className="security-note">
        <span aria-hidden="true">◆</span>
        {configuration.adminLogin.securityNotice}
      </p>
    </AuthFrame>
  );
}
