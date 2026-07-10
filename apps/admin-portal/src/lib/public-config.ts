import { parsePublicBrowserConfig } from '@starville/config/browser';

export interface AdminPublicEnvironment {
  readonly [key: string]: string | undefined;
  readonly NEXT_PUBLIC_APP_ENV?: string | undefined;
  readonly NEXT_PUBLIC_ADMIN_URL?: string | undefined;
  readonly NEXT_PUBLIC_API_URL?: string | undefined;
  readonly NEXT_PUBLIC_GAME_URL?: string | undefined;
  readonly NEXT_PUBLIC_SUPABASE_URL?: string | undefined;
  readonly NEXT_PUBLIC_SUPABASE_ANON_KEY?: string | undefined;
}

function parsePublicHttpUrl(value: string | undefined, variableName: string): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(`${variableName} is required`);
  }

  const url = new URL(value);

  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
    throw new Error(`${variableName} must be a public HTTP or HTTPS URL without credentials`);
  }

  return url.toString().replace(/\/$/, '');
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
    gameUrl: parsePublicHttpUrl(environment.NEXT_PUBLIC_GAME_URL, 'NEXT_PUBLIC_GAME_URL'),
  } as const;
}
