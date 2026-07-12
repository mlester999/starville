import { parsePublicBrowserConfig, parsePublicWalletConfig } from '@starville/config/browser';
import {
  loadAdminSecurityConfig,
  loadAdminRecoveryConfig,
  loadApiConfig,
  loadHostedSupabaseSafetyConfig,
  loadOperationsHealthConfig,
  loadRealtimeConfig,
  loadTokenAccessServerConfig,
  loadWorldManagementConfig,
  loadWorkerConfig,
} from '@starville/config/server';
import { environmentNameSchema, portSchema } from '@starville/shared-validation';

function required(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is required`);
  }

  return value;
}

const environment = environmentNameSchema.parse(required('NEXT_PUBLIC_APP_ENV'));
const commonPublic = {
  environment,
  apiUrl: required('NEXT_PUBLIC_API_URL'),
  supabaseUrl: required('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
};

const publicConfigurations = [
  parsePublicBrowserConfig({
    ...commonPublic,
    application: 'landing',
    appUrl: required('NEXT_PUBLIC_LANDING_URL'),
  }),
  parsePublicBrowserConfig({
    ...commonPublic,
    application: 'game-client',
    appUrl: required('NEXT_PUBLIC_GAME_URL'),
    realtimeUrl: required('NEXT_PUBLIC_REALTIME_URL'),
  }),
  parsePublicBrowserConfig({
    ...commonPublic,
    application: 'admin-portal',
    appUrl: required('NEXT_PUBLIC_ADMIN_URL'),
  }),
];

const frontendPorts = [
  portSchema.parse(required('LANDING_PORT')),
  portSchema.parse(required('GAME_CLIENT_PORT')),
  portSchema.parse(required('ADMIN_PORT')),
];

const serverConfigurations = [
  loadApiConfig(process.env),
  loadRealtimeConfig(process.env),
  loadWorkerConfig(process.env),
];

const adminSecurity = loadAdminSecurityConfig(process.env);
loadAdminRecoveryConfig(process.env);
const walletPublic = parsePublicWalletConfig({
  environment,
  reownProjectId: required('NEXT_PUBLIC_REOWN_PROJECT_ID'),
  gameUrl: required('NEXT_PUBLIC_GAME_URL'),
  network: required('SOLANA_NETWORK'),
});
const tokenAccess = loadTokenAccessServerConfig(process.env);
const operations = loadOperationsHealthConfig(process.env);
const worldManagement = loadWorldManagementConfig(process.env);
const hostedSupabase = loadHostedSupabaseSafetyConfig(process.env);

process.stdout.write(
  `${JSON.stringify({
    status: 'ok',
    applications: publicConfigurations.map(({ application }) => application),
    frontendPorts,
    services: serverConfigurations.map(({ application }) => application),
    adminSessionTtlMinutes: adminSecurity.sessionTtlMinutes,
    wallet: {
      network: walletPublic.network,
      reownConfigured: walletPublic.reownProjectId.length >= 8,
    },
    tokenAccess: {
      network: tokenAccess.network,
      enabled: tokenAccess.gateEnabled,
      challengeTtlSeconds: tokenAccess.challengeTtlSeconds,
      sessionTtlSeconds: tokenAccess.sessionTtlSeconds,
      recheckIntervalSeconds: tokenAccess.recheckIntervalSeconds,
    },
    operations: {
      healthCheckTimeoutMs: operations.timeoutMs,
      playerActionRateLimit: operations.playerActionRateLimit,
      operationsReadRateLimit: operations.operationsReadRateLimit,
    },
    worldManagement: {
      manifestMaximumBytes: worldManagement.manifestMaximumBytes,
      transitionTimeoutMs: worldManagement.transitionTimeoutMs,
      playerManifestReadRateLimit: worldManagement.playerManifestReadRateLimit,
      playerTransitionRateLimit: worldManagement.playerTransitionRateLimit,
      adminReadRateLimit: worldManagement.adminReadRateLimit,
      adminPublishRateLimit: worldManagement.adminPublishRateLimit,
    },
    supabase: {
      environment: hostedSupabase.environment,
      projectRef: hostedSupabase.projectRef,
      projectHostname: hostedSupabase.projectHostname,
      remoteWritesApproved: hostedSupabase.remoteWritesApproved,
      hostedTestsApproved: hostedSupabase.hostedTestsApproved,
      bootstrapEnabled: hostedSupabase.bootstrapEnabled,
    },
  })}\n`,
);
