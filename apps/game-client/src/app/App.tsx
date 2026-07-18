import { TokenAccessGate } from '../components/TokenAccessGate';
import { parseGameClientPublicConfig } from './public-config';
import { useEffect, useState } from 'react';
import { PLATFORM_FONT_REGISTRY } from '@starville/platform-configuration';
import {
  compiledPlatformConfiguration,
  fetchPlatformConfiguration,
} from './platform-configuration';
import { WorldGameTest } from '../components/WorldGameTest';

export function App() {
  const config = parseGameClientPublicConfig(import.meta.env);
  const [platform, setPlatform] = useState(compiledPlatformConfiguration);
  const gameTest = window.location.pathname === '/preview/world';

  useEffect(() => {
    const controller = new AbortController();
    void fetchPlatformConfiguration(config.apiUrl, controller.signal)
      .then(setPlatform)
      .catch(() => setPlatform(compiledPlatformConfiguration()));
    return () => controller.abort();
  }, [config.apiUrl]);

  useEffect(() => {
    const presentation = platform.configuration;
    document.title = `${presentation.branding.fullGameName} · ${gameTest ? 'Game Test' : 'Game'}`;
    document.documentElement.style.setProperty(
      '--game-runtime-focus',
      presentation.theme.tokens.focusRing,
    );
    document.documentElement.style.setProperty(
      '--game-runtime-primary',
      presentation.theme.tokens.primaryAction,
    );
    document.documentElement.style.setProperty(
      '--game-display',
      PLATFORM_FONT_REGISTRY[presentation.typography.display].stack,
    );
    document.documentElement.style.setProperty(
      '--starville-font-sans',
      PLATFORM_FONT_REGISTRY[presentation.typography.body].stack,
    );
  }, [gameTest, platform]);

  if (gameTest) {
    return (
      <WorldGameTest
        adminUrl={config.adminUrl}
        apiUrl={config.apiUrl}
        gameClientBuild={config.buildId}
      />
    );
  }

  return (
    <TokenAccessGate
      apiUrl={config.apiUrl}
      gameName={platform.configuration.branding.shortGameName}
      landingUrl={config.landingUrl}
      realtimeUrl={config.realtimeUrl}
    />
  );
}
