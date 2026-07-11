import { parseLandingPublicConfig } from '../lib/public-config';
import { LandingExperience } from '../components/landing-experience';

export default function LandingPage() {
  const config = parseLandingPublicConfig(process.env);

  return (
    <LandingExperience
      apiUrl={config.apiUrl}
      gameUrl={config.gameUrl}
      landingUrl={config.appUrl}
      reownProjectId={config.reownProjectId}
      network={config.network}
      xUrl={config.social.xUrl}
      discordUrl={config.social.discordUrl}
    />
  );
}
