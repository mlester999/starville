import { parsePublicBrowserConfig, parsePublicWalletConfig } from '@starville/config/browser';

export interface LandingPublicEnvironment {
  readonly [key: string]: string | undefined;
  readonly NEXT_PUBLIC_APP_ENV?: string;
  readonly NEXT_PUBLIC_LANDING_URL?: string;
  readonly NEXT_PUBLIC_GAME_URL?: string;
  readonly NEXT_PUBLIC_API_URL?: string;
  readonly NEXT_PUBLIC_REOWN_PROJECT_ID?: string;
  readonly NEXT_PUBLIC_SUPABASE_URL?: string;
  readonly NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  readonly NEXT_PUBLIC_STARVILLE_X_URL?: string;
  readonly NEXT_PUBLIC_STARVILLE_DISCORD_URL?: string;
  readonly SOLANA_NETWORK?: string;
}

function parseOptionalExternalUrl(value: string | undefined, name: string): string | undefined {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }

  const url = new URL(value);

  if (url.protocol !== 'https:' || url.username || url.password || url.toString().length > 2_048) {
    throw new Error(`${name} must be a public HTTPS URL without embedded credentials`);
  }

  return url.toString();
}

export function parseLandingPublicConfig(environment: LandingPublicEnvironment) {
  const config = parsePublicBrowserConfig({
    application: 'landing',
    environment: environment.NEXT_PUBLIC_APP_ENV,
    appUrl: environment.NEXT_PUBLIC_LANDING_URL,
    apiUrl: environment.NEXT_PUBLIC_API_URL,
    supabaseUrl: environment.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  const wallet = parsePublicWalletConfig({
    environment: environment.NEXT_PUBLIC_APP_ENV,
    reownProjectId: environment.NEXT_PUBLIC_REOWN_PROJECT_ID,
    gameUrl: environment.NEXT_PUBLIC_GAME_URL,
    network: environment.SOLANA_NETWORK,
  });

  return {
    ...config,
    ...wallet,
    social: {
      xUrl: parseOptionalExternalUrl(
        environment.NEXT_PUBLIC_STARVILLE_X_URL,
        'NEXT_PUBLIC_STARVILLE_X_URL',
      ),
      discordUrl: parseOptionalExternalUrl(
        environment.NEXT_PUBLIC_STARVILLE_DISCORD_URL,
        'NEXT_PUBLIC_STARVILLE_DISCORD_URL',
      ),
    },
  } as const;
}
