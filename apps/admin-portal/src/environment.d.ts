declare namespace NodeJS {
  interface ProcessEnv {
    readonly NEXT_PUBLIC_APP_ENV: string | undefined;
    readonly NEXT_PUBLIC_ADMIN_URL: string | undefined;
    readonly NEXT_PUBLIC_API_URL: string | undefined;
    readonly NEXT_PUBLIC_GAME_URL: string | undefined;
    readonly NEXT_PUBLIC_SUPABASE_URL: string | undefined;
    readonly NEXT_PUBLIC_SUPABASE_ANON_KEY: string | undefined;
  }
}
