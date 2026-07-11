import { parseAdditionalPublicHttpUrl, parsePublicBrowserConfig } from '@starville/config/browser';

export interface GameClientPublicEnvironment {
  readonly [key: string]: string | undefined;
  readonly NEXT_PUBLIC_APP_ENV?: string;
  readonly NEXT_PUBLIC_LANDING_URL?: string;
  readonly NEXT_PUBLIC_GAME_URL?: string;
  readonly NEXT_PUBLIC_API_URL?: string;
  readonly NEXT_PUBLIC_REALTIME_URL?: string;
  readonly NEXT_PUBLIC_SUPABASE_URL?: string;
  readonly NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
}

export function parseGameClientPublicConfig(environment: GameClientPublicEnvironment) {
  const config = parsePublicBrowserConfig({
    application: 'game-client',
    environment: environment.NEXT_PUBLIC_APP_ENV,
    appUrl: environment.NEXT_PUBLIC_GAME_URL,
    apiUrl: environment.NEXT_PUBLIC_API_URL,
    realtimeUrl: environment.NEXT_PUBLIC_REALTIME_URL,
    supabaseUrl: environment.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  return {
    ...config,
    landingUrl: parseAdditionalPublicHttpUrl(
      environment.NEXT_PUBLIC_LANDING_URL,
      environment.NEXT_PUBLIC_APP_ENV,
      'NEXT_PUBLIC_LANDING_URL',
    ),
  } as const;
}
