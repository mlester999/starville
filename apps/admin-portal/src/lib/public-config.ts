import { parseAdditionalPublicHttpUrl, parsePublicBrowserConfig } from '@starville/config/browser';

export interface AdminPublicEnvironment {
  readonly [key: string]: string | undefined;
  readonly NEXT_PUBLIC_APP_ENV?: string | undefined;
  readonly NEXT_PUBLIC_ADMIN_URL?: string | undefined;
  readonly NEXT_PUBLIC_API_URL?: string | undefined;
  readonly NEXT_PUBLIC_GAME_URL?: string | undefined;
  readonly NEXT_PUBLIC_SUPABASE_URL?: string | undefined;
  readonly NEXT_PUBLIC_SUPABASE_ANON_KEY?: string | undefined;
}

export function parseAdminPublicConfig(environment: AdminPublicEnvironment) {
  const config = parsePublicBrowserConfig({
    application: 'admin-portal',
    environment: environment.NEXT_PUBLIC_APP_ENV,
    appUrl: environment.NEXT_PUBLIC_ADMIN_URL,
    apiUrl: environment.NEXT_PUBLIC_API_URL,
    supabaseUrl: environment.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  return {
    ...config,
    gameUrl: parseAdditionalPublicHttpUrl(
      environment.NEXT_PUBLIC_GAME_URL,
      environment.NEXT_PUBLIC_APP_ENV,
      'NEXT_PUBLIC_GAME_URL',
    ),
  } as const;
}
