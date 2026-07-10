import { parsePublicBrowserConfig } from '@starville/config/browser';

export interface AdminPublicEnvironment {
  readonly [key: string]: string | undefined;
  readonly NEXT_PUBLIC_APP_ENV?: string;
  readonly NEXT_PUBLIC_ADMIN_URL?: string;
  readonly NEXT_PUBLIC_API_URL?: string;
  readonly NEXT_PUBLIC_SUPABASE_URL?: string;
  readonly NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
}

export function parseAdminPublicConfig(environment: AdminPublicEnvironment) {
  return parsePublicBrowserConfig({
    application: 'admin-portal',
    environment: environment.NEXT_PUBLIC_APP_ENV,
    appUrl: environment.NEXT_PUBLIC_ADMIN_URL,
    apiUrl: environment.NEXT_PUBLIC_API_URL,
    supabaseUrl: environment.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
