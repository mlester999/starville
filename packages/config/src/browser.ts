import { z } from 'zod';

import type { EnvironmentName } from '@starville/shared-types';
import {
  assertSecureUrlForEnvironment,
  environmentNameSchema,
  httpUrlSchema,
  webSocketUrlSchema,
} from '@starville/shared-validation';
import { walletNetworkSchema, type WalletNetwork } from '@starville/wallet-access';

const browserApplicationSchema = z.enum(['landing', 'game-client', 'admin-portal']);

const publicBrowserConfigInputSchema = z
  .object({
    application: browserApplicationSchema,
    environment: environmentNameSchema,
    appUrl: httpUrlSchema,
    apiUrl: httpUrlSchema,
    realtimeUrl: webSocketUrlSchema.optional(),
    supabaseUrl: httpUrlSchema,
    supabaseAnonKey: z.string().trim().min(1, 'Supabase anonymous key is required'),
  })
  .strict();

export type BrowserApplicationName = z.infer<typeof browserApplicationSchema>;

export interface PublicBrowserConfigInput {
  readonly application: unknown;
  readonly environment: unknown;
  readonly appUrl: unknown;
  readonly apiUrl: unknown;
  readonly realtimeUrl?: unknown;
  readonly supabaseUrl: unknown;
  readonly supabaseAnonKey: unknown;
}

export interface PublicBrowserConfig {
  readonly application: BrowserApplicationName;
  readonly environment: EnvironmentName;
  readonly appUrl: string;
  readonly apiUrl: string;
  readonly realtimeUrl?: string;
  readonly supabase: {
    readonly url: string;
    readonly anonKey: string;
  };
}

export function parseAdditionalPublicHttpUrl(
  value: unknown,
  environmentValue: unknown,
  variableName: string,
): string {
  const environment = environmentNameSchema.parse(environmentValue);
  let url: string;

  try {
    url = httpUrlSchema.parse(value);
  } catch {
    throw new Error(`${variableName} must be a public HTTP or HTTPS URL without credentials`);
  }

  assertSecureUrlForEnvironment(url, environment, variableName);
  return new URL(url).toString().replace(/\/$/u, '');
}

export function parsePublicBrowserConfig(input: PublicBrowserConfigInput): PublicBrowserConfig {
  const parsed = publicBrowserConfigInputSchema.parse(input);
  assertSecureUrlForEnvironment(parsed.appUrl, parsed.environment, 'Application URL');
  assertSecureUrlForEnvironment(parsed.apiUrl, parsed.environment, 'API URL');
  assertSecureUrlForEnvironment(parsed.supabaseUrl, parsed.environment, 'Supabase URL');

  if (parsed.realtimeUrl !== undefined) {
    assertSecureUrlForEnvironment(parsed.realtimeUrl, parsed.environment, 'Real-time URL');
  }

  const common = {
    application: parsed.application,
    environment: parsed.environment,
    appUrl: parsed.appUrl,
    apiUrl: parsed.apiUrl,
    supabase: {
      url: parsed.supabaseUrl,
      anonKey: parsed.supabaseAnonKey,
    },
  } satisfies Omit<PublicBrowserConfig, 'realtimeUrl'>;

  return parsed.realtimeUrl === undefined ? common : { ...common, realtimeUrl: parsed.realtimeUrl };
}

const publicWalletConfigSchema = z
  .object({
    environment: environmentNameSchema,
    reownProjectId: z.string().trim().min(8, 'NEXT_PUBLIC_REOWN_PROJECT_ID is required').max(128),
    gameUrl: httpUrlSchema,
    network: z
      .enum(['devnet', 'mainnet-beta'])
      .transform((network): WalletNetwork => `solana:${network}`),
  })
  .strict();

export interface PublicWalletConfig {
  readonly reownProjectId: string;
  readonly gameUrl: string;
  readonly network: WalletNetwork;
}

export function parsePublicWalletConfig(input: unknown): PublicWalletConfig {
  const parsed = publicWalletConfigSchema.parse(input);
  assertSecureUrlForEnvironment(parsed.gameUrl, parsed.environment, 'Game URL');
  return {
    reownProjectId: parsed.reownProjectId,
    gameUrl: parsed.gameUrl,
    network: walletNetworkSchema.parse(parsed.network),
  };
}
