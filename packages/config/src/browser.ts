import { z } from 'zod';

import type { EnvironmentName } from '@starville/shared-types';
import {
  environmentNameSchema,
  httpUrlSchema,
  webSocketUrlSchema,
} from '@starville/shared-validation';

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

export function parsePublicBrowserConfig(input: PublicBrowserConfigInput): PublicBrowserConfig {
  const parsed = publicBrowserConfigInputSchema.parse(input);
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
