import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

import {
  assertHostedDevelopmentTestsApproved,
  safeHostedTargetSummary,
  verifyCanonicalHostedTarget,
} from './safety';

const realtimeManagementSettingsSchema = z
  .object({
    suspend: z.boolean().optional(),
    private_only: z.boolean().optional(),
    max_clients: z.number().int().nonnegative().optional(),
    max_events_per_second: z.number().int().nonnegative().optional(),
    max_presence_events_per_second: z.number().int().nonnegative().optional(),
    max_payload_size_in_kb: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export interface RealtimeSettingsVerification {
  readonly realtimeService: 'enabled' | 'disabled' | 'unknown';
  readonly publicChannelAccess: 'allowed' | 'disabled' | 'unknown';
  readonly privateOnlyRequirement: 'proven' | 'not proven';
  readonly presenceCapability: 'available' | 'not available' | 'unknown';
  readonly source: 'Management API' | 'Management API; Dashboard-required';
}

export function summarizeRealtimeManagementSettings(input: unknown): RealtimeSettingsVerification {
  const parsed = realtimeManagementSettingsSchema.safeParse(input);
  if (!parsed.success) throw new Error('Realtime settings response shape is not recognized');
  const settings = parsed.data;
  const realtimeService =
    settings.suspend === true ? 'disabled' : settings.suspend === false ? 'enabled' : 'unknown';
  const publicChannelAccess =
    settings.private_only === true
      ? 'disabled'
      : settings.private_only === false
        ? 'allowed'
        : 'unknown';

  return {
    realtimeService,
    publicChannelAccess,
    privateOnlyRequirement: settings.private_only === true ? 'proven' : 'not proven',
    // Current Realtime documentation describes Presence as a protocol capability, not a
    // separately authoritative tenant toggle. Behavioral proof comes from the two-client harness.
    presenceCapability: realtimeService === 'disabled' ? 'not available' : 'unknown',
    source:
      settings.private_only === undefined ? 'Management API; Dashboard-required' : 'Management API',
  };
}

export function renderRealtimeSettingsVerification(
  verification: RealtimeSettingsVerification,
): string {
  return [
    `Realtime service: ${verification.realtimeService}`,
    `public channel access: ${verification.publicChannelAccess}`,
    `private-only requirement: ${verification.privateOnlyRequirement}`,
    `Presence capability: ${verification.presenceCapability}`,
    `source used: ${verification.source}`,
  ].join('\n');
}

async function main(): Promise<void> {
  const target = await verifyCanonicalHostedTarget(process.env);
  assertHostedDevelopmentTestsApproved(target, process.env);
  process.stdout.write(`${JSON.stringify(safeHostedTargetSummary(target))}\n`);

  const accessToken = process.env['SUPABASE_ACCESS_TOKEN']?.trim();
  if (accessToken === undefined || accessToken === '') {
    throw new Error(
      'SUPABASE_ACCESS_TOKEN is required for read-only Realtime settings verification',
    );
  }

  const response = await fetch(
    `https://api.supabase.com/v1/projects/${target.projectRef}/config/realtime`,
    {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}` },
    },
  );
  if (!response.ok) {
    throw new Error(`Realtime settings read failed with HTTP ${response.status}`);
  }
  const verification = summarizeRealtimeManagementSettings(await response.json());
  process.stdout.write(`${renderRealtimeSettingsVerification(verification)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : 'Realtime settings verification failed';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
