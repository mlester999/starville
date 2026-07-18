import { parseAdditionalPublicHttpUrl, parsePublicBrowserConfig } from '@starville/config/browser';

export interface GameClientPublicEnvironment {
  readonly [key: string]: string | undefined;
  readonly NEXT_PUBLIC_APP_ENV?: string;
  readonly NEXT_PUBLIC_LANDING_URL?: string;
  readonly NEXT_PUBLIC_GAME_URL?: string;
  readonly NEXT_PUBLIC_API_URL?: string;
  readonly NEXT_PUBLIC_ADMIN_URL?: string;
  readonly NEXT_PUBLIC_REALTIME_URL?: string;
  readonly NEXT_PUBLIC_SUPABASE_URL?: string;
  readonly NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  readonly NEXT_PUBLIC_GAME_COLLISION_DEBUG?: string;
  readonly NEXT_PUBLIC_GAME_BUILD_ID?: string;
}

export function parseGameClientPublicConfig(environment: GameClientPublicEnvironment) {
  const collisionDebugValue = environment.NEXT_PUBLIC_GAME_COLLISION_DEBUG?.trim() || 'false';
  if (collisionDebugValue !== 'true' && collisionDebugValue !== 'false') {
    throw new Error('NEXT_PUBLIC_GAME_COLLISION_DEBUG must be true or false');
  }
  const config = parsePublicBrowserConfig({
    application: 'game-client',
    environment: environment.NEXT_PUBLIC_APP_ENV,
    appUrl: environment.NEXT_PUBLIC_GAME_URL,
    apiUrl: environment.NEXT_PUBLIC_API_URL,
    realtimeUrl: environment.NEXT_PUBLIC_REALTIME_URL,
    supabaseUrl: environment.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  const configuredBuildId = environment.NEXT_PUBLIC_GAME_BUILD_ID?.trim();
  if (config.environment === 'production' && !configuredBuildId) {
    throw new Error('NEXT_PUBLIC_GAME_BUILD_ID is required in production');
  }
  const buildId = configuredBuildId || `local-${config.environment}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/u.test(buildId)) {
    throw new Error('NEXT_PUBLIC_GAME_BUILD_ID must be a safe build identifier');
  }

  return {
    ...config,
    landingUrl: parseAdditionalPublicHttpUrl(
      environment.NEXT_PUBLIC_LANDING_URL,
      environment.NEXT_PUBLIC_APP_ENV,
      'NEXT_PUBLIC_LANDING_URL',
    ),
    adminUrl: parseAdditionalPublicHttpUrl(
      environment.NEXT_PUBLIC_ADMIN_URL,
      environment.NEXT_PUBLIC_APP_ENV,
      'NEXT_PUBLIC_ADMIN_URL',
    ),
    collisionDebug: collisionDebugValue === 'true',
    buildId,
  } as const;
}
