import { parseLandingPublicConfig } from '../lib/public-config';
import { LandingExperience } from '../components/landing-experience';
import { loadPublishedPlatformConfiguration } from '../lib/platform-configuration';

export default async function LandingPage() {
  const config = parseLandingPublicConfig(process.env);
  const platform = await loadPublishedPlatformConfiguration();

  return (
    <LandingExperience
      apiUrl={config.apiUrl}
      gameUrl={config.gameUrl}
      landingUrl={config.appUrl}
      reownProjectId={config.reownProjectId}
      network={config.network}
      xUrl={config.social.xUrl}
      discordUrl={config.social.discordUrl}
      platformConfiguration={platform.configuration}
      assetUrls={platform.assetUrls}
    />
  );
}
