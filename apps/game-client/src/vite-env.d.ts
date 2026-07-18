/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly NEXT_PUBLIC_APP_ENV?: string;
  readonly NEXT_PUBLIC_LANDING_URL?: string;
  readonly NEXT_PUBLIC_GAME_URL?: string;
  readonly NEXT_PUBLIC_API_URL?: string;
  readonly NEXT_PUBLIC_ADMIN_URL?: string;
  readonly NEXT_PUBLIC_REALTIME_URL?: string;
  readonly NEXT_PUBLIC_SUPABASE_URL?: string;
  readonly NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  readonly NEXT_PUBLIC_GAME_BUILD_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
