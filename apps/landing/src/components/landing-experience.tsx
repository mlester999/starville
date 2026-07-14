'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent } from 'react';

import type { WalletNetwork } from '@starville/wallet-access';
import {
  PLATFORM_FONT_REGISTRY,
  type PlatformAssetUrls,
  type PlatformConfiguration,
} from '@starville/platform-configuration';

import { initializeStarvilleAppKit } from '../lib/reown';
import {
  fetchPublicTokenAccessConfig,
  formatTokenAmount,
  shortenWalletAddress,
  type PublicTokenAccessConfig,
} from '../lib/token-access/client';
import { AccessDialog } from './access-dialog';
import { CopyIcon, EyeIcon, MenuIcon } from './icons';
import { StarvilleMark } from './starville-mark';
import { WalletAccessFlow } from './wallet-access-flow';

interface LandingExperienceProps {
  readonly apiUrl: string;
  readonly gameUrl: string;
  readonly landingUrl: string;
  readonly reownProjectId: string;
  readonly network: WalletNetwork;
  readonly xUrl: string | undefined;
  readonly discordUrl: string | undefined;
  readonly platformConfiguration: PlatformConfiguration;
  readonly assetUrls: PlatformAssetUrls;
}

interface SocialLinkProps {
  readonly assetSrc: string;
  readonly href: string | undefined;
  readonly label: string;
  readonly mobileLabel: string;
}

function networkLabel(network: WalletNetwork): string {
  return network === 'solana:mainnet-beta' ? 'Solana Mainnet' : 'Solana Devnet';
}

function SocialLink({ assetSrc, href, label, mobileLabel }: SocialLinkProps) {
  const tooltipId = useId();
  const content = (
    <>
      <img className="social-link__asset" src={assetSrc} alt="" aria-hidden="true" />
      <span className="social-link__mobile-label">{mobileLabel}</span>
      <span className="social-link__tooltip" id={tooltipId} role="tooltip">
        {label}
      </span>
    </>
  );

  if (href === undefined) {
    return (
      <span
        className="social-link social-link--disabled"
        aria-disabled="true"
        aria-describedby={tooltipId}
        aria-label={`${label} — link coming soon`}
        tabIndex={0}
        title={`${label} link coming soon`}
      >
        {content}
      </span>
    );
  }

  return (
    <a
      className="social-link"
      href={href}
      aria-label={label}
      aria-describedby={tooltipId}
      rel="noopener noreferrer"
      target="_blank"
    >
      {content}
    </a>
  );
}

export function LandingExperience({
  apiUrl,
  gameUrl,
  landingUrl,
  reownProjectId,
  network,
  xUrl,
  discordUrl,
  platformConfiguration,
  assetUrls,
}: LandingExperienceProps) {
  const pathname = usePathname();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [appKitReady, setAppKitReady] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [accessConfig, setAccessConfig] = useState<PublicTokenAccessConfig>();
  const [mintCopyLabel, setMintCopyLabel] = useState('Copy contract address');
  const accessTriggerRef = useRef<HTMLButtonElement>(null);

  function openAccessDialog(event: MouseEvent<HTMLButtonElement>) {
    accessTriggerRef.current = event.currentTarget;
    setNavigationOpen(false);
    setDialogOpen(true);
  }

  async function copyMintAddress() {
    const mintAddress = accessConfig?.mintAddress;

    if (mintAddress === null || mintAddress === undefined) {
      return;
    }

    try {
      await navigator.clipboard.writeText(mintAddress);
      setMintCopyLabel('Contract address copied');
    } catch {
      setMintCopyLabel('Copy unavailable');
    }
  }

  useEffect(() => {
    initializeStarvilleAppKit({ landingUrl, projectId: reownProjectId, network });
    setAppKitReady(true);
  }, [landingUrl, network, reownProjectId]);

  useEffect(() => {
    const controller = new AbortController();

    void fetchPublicTokenAccessConfig(apiUrl, controller.signal)
      .then(setAccessConfig)
      .catch(() => setAccessConfig(undefined));

    return () => controller.abort();
  }, [apiUrl]);

  const tokenRequirement =
    accessConfig?.availability === 'available' && accessConfig.enabled
      ? `${formatTokenAmount(accessConfig.requiredAmount)} ${accessConfig.symbol} required`
      : 'Access requirement unavailable';
  const mintAddress = accessConfig?.mintAddress;
  const hero = platformConfiguration.landing.sections.find(({ key }) => key === 'hero');
  const effectiveXUrl = platformConfiguration.branding.xUrl ?? xUrl;
  const effectiveDiscordUrl = platformConfiguration.branding.discordUrl ?? discordUrl;
  const gameName = platformConfiguration.branding.shortGameName;
  const heroAssetUrl = assetUrls.landing.hero ?? assetUrls.branding.landing_hero_background;
  const xSocialLabel =
    gameName === 'Starville' ? 'Follow Starville on X' : `Follow ${gameName} on X`;
  const discordSocialLabel =
    gameName === 'Starville' ? 'Join the Starville Discord' : `Join the ${gameName} Discord`;

  return (
    <main
      className="landing-shell"
      style={
        {
          '--landing-runtime-background': platformConfiguration.theme.tokens.background,
          '--landing-runtime-text': platformConfiguration.theme.tokens.textPrimary,
          '--landing-runtime-primary': platformConfiguration.theme.tokens.primaryAction,
          '--landing-runtime-primary-text': platformConfiguration.theme.tokens.primaryActionText,
          '--landing-runtime-focus': platformConfiguration.theme.tokens.focusRing,
          '--landing-runtime-hero-overlay': platformConfiguration.theme.tokens.landingHeroOverlay,
          '--landing-display':
            PLATFORM_FONT_REGISTRY[platformConfiguration.typography.display].stack,
          '--starville-font-sans':
            PLATFORM_FONT_REGISTRY[platformConfiguration.typography.body].stack,
          ...(heroAssetUrl === undefined || heroAssetUrl === null
            ? {}
            : {
                '--landing-runtime-hero-image': `url("${heroAssetUrl}")`,
              }),
        } as CSSProperties
      }
    >
      <section
        className="village-hero"
        aria-labelledby="hero-title"
        aria-hidden={dialogOpen ? true : undefined}
        inert={dialogOpen}
      >
        <div className="village-hero__media" aria-hidden="true">
          <div className="village-hero__art" />
        </div>
        <div className="village-hero__veil" aria-hidden="true" />
        <div className="village-hero__particles" aria-hidden="true">
          {Array.from({ length: 14 }, (_, index) => (
            <span key={index} />
          ))}
        </div>

        <header className="hero-header">
          <a className="brand-link" href={landingUrl} aria-label={`${gameName} home`}>
            <StarvilleMark
              compact
              gameName={gameName.toUpperCase()}
              tagline={platformConfiguration.branding.tagline}
              logoUrl={assetUrls.branding.brand_logo}
            />
          </a>

          <nav className="hero-navigation" aria-label="Primary navigation">
            <Link
              className={pathname === '/how-to-play' ? 'is-active' : undefined}
              href="/how-to-play"
              aria-current={pathname === '/how-to-play' ? 'page' : undefined}
            >
              How to Play
            </Link>
            <Link
              className={pathname === '/docs' ? 'is-active' : undefined}
              href="/docs"
              aria-current={pathname === '/docs' ? 'page' : undefined}
            >
              Docs
            </Link>
          </nav>

          <div className="hero-header__actions">
            <SocialLink
              assetSrc="/images/x-official.png"
              href={effectiveXUrl}
              label={xSocialLabel}
              mobileLabel="X"
            />
            <SocialLink
              assetSrc="/images/discord-official.png"
              href={effectiveDiscordUrl}
              label={discordSocialLabel}
              mobileLabel="Discord"
            />
            <button className="header-play" type="button" onClick={openAccessDialog}>
              {hero?.ctaLabel ?? 'Play now'}
              <span aria-hidden="true">✦</span>
            </button>
          </div>

          <button
            className="navigation-toggle"
            type="button"
            aria-controls="mobile-navigation"
            aria-expanded={navigationOpen}
            aria-label={navigationOpen ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setNavigationOpen((open) => !open)}
          >
            <MenuIcon />
          </button>

          <div
            id="mobile-navigation"
            className={`mobile-navigation${navigationOpen ? ' is-open' : ''}`}
          >
            <nav aria-label="Mobile navigation">
              <Link href="/how-to-play" onClick={() => setNavigationOpen(false)}>
                How to Play
              </Link>
              <Link href="/docs" onClick={() => setNavigationOpen(false)}>
                Docs
              </Link>
            </nav>
            <div className="mobile-navigation__actions">
              <SocialLink
                assetSrc="/images/x-official.png"
                href={effectiveXUrl}
                label={xSocialLabel}
                mobileLabel="X"
              />
              <SocialLink
                assetSrc="/images/discord-official.png"
                href={effectiveDiscordUrl}
                label={discordSocialLabel}
                mobileLabel="Discord"
              />
              <button className="header-play" type="button" onClick={openAccessDialog}>
                {hero?.ctaLabel ?? 'Play now'}
                <span aria-hidden="true">✦</span>
              </button>
            </div>
          </div>
        </header>

        <div className="hero-copy">
          <p className="hero-kicker">
            <span aria-hidden="true" />
            {hero?.items[0]?.heading ?? platformConfiguration.branding.tagline}
            <span aria-hidden="true" />
          </p>
          <h1 id="hero-title">{hero?.heading ?? gameName.toUpperCase()}</h1>
          <p className="hero-subtitle">
            {hero?.description ?? platformConfiguration.branding.tagline}
          </p>
          <p className="hero-description">
            {hero?.items[0]?.description ?? platformConfiguration.branding.shortDescription}
          </p>
          <div className="hero-actions">
            <button
              className="hero-button hero-button--primary"
              type="button"
              onClick={openAccessDialog}
            >
              {hero?.ctaLabel ?? 'Play now'}
              <span aria-hidden="true">→</span>
            </button>
            <Link className="hero-button hero-button--ghost" href="/spectate">
              Spectate
              <EyeIcon />
            </Link>
          </div>
        </div>

        <footer className="world-status" aria-label={`${gameName} world status`}>
          <div className="world-status__item world-status__network">
            <span className="world-status__light" aria-hidden="true" />
            <span>
              <small>Network</small>
              <strong>{networkLabel(accessConfig?.network ?? network)}</strong>
            </span>
          </div>

          <div className="world-status__item world-status__access">
            <span>
              <small>Village access</small>
              <strong>{tokenRequirement}</strong>
            </span>
            {mintAddress === null || mintAddress === undefined ? (
              <span className="contract-chip contract-chip--unavailable">CA unavailable</span>
            ) : (
              <button
                className="contract-chip"
                type="button"
                aria-label={mintCopyLabel}
                title={mintAddress}
                onClick={copyMintAddress}
              >
                <span>CA: {shortenWalletAddress(mintAddress)}</span>
                <CopyIcon />
              </button>
            )}
            <span className="sr-only" aria-live="polite">
              {mintCopyLabel === 'Copy contract address' ? '' : mintCopyLabel}
            </span>
          </div>

          <div className="world-status__item world-status__presence">
            <span className="world-status__presence-mark" aria-hidden="true">
              ✦
            </span>
            <span>
              <small>World status</small>
              <strong>Village preparing</strong>
            </span>
          </div>

          <div className="world-status__item world-status__trust">
            <span>
              <small>Wallet verification</small>
              <strong>No transaction</strong>
            </span>
          </div>
        </footer>
      </section>

      {[...platformConfiguration.landing.sections]
        .filter(
          (landingSection) =>
            landingSection.enabled &&
            !['hero', 'wallet_access', 'footer'].includes(landingSection.key),
        )
        .sort((first, second) => first.order - second.order)
        .map((landingSection) => {
          const sectionAsset = assetUrls.landing[landingSection.key];
          return (
            <section
              className={`configured-landing-section configured-landing-section--${landingSection.key}`}
              key={landingSection.key}
              style={
                sectionAsset === undefined
                  ? undefined
                  : { backgroundImage: `url("${sectionAsset}")` }
              }
            >
              <div>
                <p className="hero-kicker">{landingSection.key.replaceAll('_', ' ')}</p>
                {landingSection.heading === null ? null : <h2>{landingSection.heading}</h2>}
                {landingSection.description === null ? null : <p>{landingSection.description}</p>}
                {landingSection.key === 'token_contract' && mintAddress ? (
                  <code>{shortenWalletAddress(mintAddress)}</code>
                ) : null}
                {landingSection.items.length === 0 ? null : (
                  <div className="configured-landing-section__items">
                    {landingSection.items.map((item) => (
                      <article key={item.heading}>
                        <h3>{item.heading}</h3>
                        <p>{item.description}</p>
                      </article>
                    ))}
                  </div>
                )}
                {landingSection.ctaLabel !== null && landingSection.ctaDestination !== null ? (
                  <a
                    className="hero-button hero-button--primary"
                    href={landingSection.ctaDestination}
                  >
                    {landingSection.ctaLabel}
                  </a>
                ) : null}
              </div>
            </section>
          );
        })}

      <AccessDialog
        labelledBy="access-dialog-title"
        onClose={() => setDialogOpen(false)}
        open={dialogOpen}
        returnFocusRef={accessTriggerRef}
        suspended={walletModalOpen}
      >
        {appKitReady ? (
          <WalletAccessFlow
            apiUrl={apiUrl}
            gameUrl={gameUrl}
            network={network}
            onWalletModalChange={setWalletModalOpen}
          />
        ) : (
          <section className="access-loading" aria-live="polite" aria-busy="true">
            <span className="access-spinner" aria-hidden="true" />
            <p>Preparing secure wallet access…</p>
          </section>
        )}
      </AccessDialog>
    </main>
  );
}
