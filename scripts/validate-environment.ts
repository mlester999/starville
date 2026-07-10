import { parsePublicBrowserConfig } from '@starville/config/browser';
import { loadApiConfig, loadRealtimeConfig, loadWorkerConfig } from '@starville/config/server';
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

process.stdout.write(
  `${JSON.stringify({
    status: 'ok',
    applications: publicConfigurations.map(({ application }) => application),
    frontendPorts,
    services: serverConfigurations.map(({ application }) => application),
  })}\n`,
);
