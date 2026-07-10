const SYSTEM_ENVIRONMENT_KEYS = [
  'PATH',
  'HOME',
  'USER',
  'TMPDIR',
  'TEMP',
  'TMP',
  'SHELL',
  'TERM',
  'COLORTERM',
  'CI',
  'FORCE_COLOR',
  'NO_COLOR',
  'NODE_OPTIONS',
  'NODE_EXTRA_CA_CERTS',
  'PNPM_HOME',
  'COREPACK_HOME',
];

export const ENVIRONMENT_PROFILES = Object.freeze({
  landing: Object.freeze([
    'NODE_ENV',
    'NEXT_PUBLIC_APP_ENV',
    'NEXT_PUBLIC_LANDING_URL',
    'NEXT_PUBLIC_API_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'LANDING_PORT',
  ]),
  'game-client': Object.freeze([
    'NODE_ENV',
    'NEXT_PUBLIC_APP_ENV',
    'NEXT_PUBLIC_GAME_URL',
    'NEXT_PUBLIC_API_URL',
    'NEXT_PUBLIC_REALTIME_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'GAME_CLIENT_PORT',
  ]),
  'admin-portal': Object.freeze([
    'NODE_ENV',
    'NEXT_PUBLIC_APP_ENV',
    'NEXT_PUBLIC_ADMIN_URL',
    'NEXT_PUBLIC_API_URL',
    'NEXT_PUBLIC_GAME_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'ADMIN_PORT',
    'ADMIN_RECOVERY_COOKIE_SECRET',
  ]),
  api: Object.freeze([
    'NODE_ENV',
    'LOG_LEVEL',
    'API_HOST',
    'API_PORT',
    'CORS_ALLOWED_ORIGINS',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ADMIN_SESSION_TTL_MINUTES',
    'ADMIN_REQUIRE_MFA_BY_DEFAULT',
  ]),
  'realtime-server': Object.freeze([
    'NODE_ENV',
    'LOG_LEVEL',
    'REALTIME_HOST',
    'REALTIME_PORT',
    'REALTIME_ALLOWED_ORIGINS',
    'CORS_ALLOWED_ORIGINS',
    'REALTIME_MAX_CONNECTIONS',
  ]),
  worker: Object.freeze([
    'NODE_ENV',
    'LOG_LEVEL',
    'WORKER_HOST',
    'WORKER_HEALTH_PORT',
    'WORKER_CONCURRENCY',
    'WORKER_MAX_ATTEMPTS',
    'WORKER_RETRY_BASE_DELAY_MS',
  ]),
});

export function selectEnvironmentProfile(profileName, environment) {
  const profileKeys = ENVIRONMENT_PROFILES[profileName];

  if (profileKeys === undefined) {
    throw new Error(
      `Unknown environment profile '${profileName}'. Expected one of: ${Object.keys(
        ENVIRONMENT_PROFILES,
      ).join(', ')}`,
    );
  }

  const selected = {};

  for (const key of new Set([...SYSTEM_ENVIRONMENT_KEYS, ...profileKeys])) {
    const value = environment[key];

    if (value !== undefined) {
      selected[key] = value;
    }
  }

  return selected;
}
