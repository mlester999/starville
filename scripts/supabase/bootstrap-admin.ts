import { randomUUID } from 'node:crypto';
import process from 'node:process';

import {
  assertAdminBootstrapWriteApproved,
  loadAdminSecurityConfig,
  loadPrivateSupabaseConfig,
} from '@starville/config/server';
import { createSupabaseServiceRoleClient } from '@starville/supabase/server';
import { z } from 'zod';

import {
  assertBootstrapEnvironmentConfirmation,
  assertBootstrapProjectRef,
  parseBootstrapArguments,
} from './bootstrap-arguments';
import { safeHostedTargetSummary, verifyCanonicalHostedTarget } from './safety';

async function main(): Promise<void> {
  const target = await verifyCanonicalHostedTarget(process.env);
  const security = loadAdminSecurityConfig(process.env);
  const options = parseBootstrapArguments(process.argv.slice(2), security.requireMfaByDefault);
  assertBootstrapProjectRef(options, target.projectRef);
  assertBootstrapEnvironmentConfirmation(options, target.environment);

  process.stdout.write(
    `${JSON.stringify({
      ...safeHostedTargetSummary(target),
      mode: options.apply ? 'apply' : 'dry-run',
      operation: options.activateInvited ? 'activate-invited' : 'create',
      requireMfa: options.requireMfa,
    })}\n`,
  );

  if (options.apply) {
    assertAdminBootstrapWriteApproved(target);
  }

  const privateConfig = loadPrivateSupabaseConfig(process.env);
  const client = createSupabaseServiceRoleClient({
    url: privateConfig.url,
    serviceRoleKey: privateConfig.serviceRoleKey,
  });
  const authUser = await client.auth.admin.getUserById(options.userId);

  if (authUser.error || authUser.data.user.id !== options.userId) {
    throw new Error('Bootstrap Auth user could not be verified on the approved hosted project');
  }

  const previewResult = await client.rpc('preview_first_super_admin_bootstrap', {
    p_user_id: options.userId,
    p_require_mfa: options.requireMfa,
    p_activate_invited: options.activateInvited,
    p_expected_status: options.expectedStatus ?? null,
    p_expected_role_key: options.expectedRoleKey ?? null,
  });

  if (previewResult.error) {
    throw new Error('Trusted bootstrap preview could not be evaluated');
  }

  const preview = z
    .object({
      allowed: z.boolean(),
      reasonCode: z
        .enum([
          'AUTH_USER_NOT_FOUND',
          'EXPECTED_STATE_REQUIRED',
          'UNEXPECTED_EXPECTED_STATE',
          'ACTIVE_SUPER_ADMIN_EXISTS',
          'SYSTEM_ROLE_MISSING',
          'ACTIVATION_REQUIRED',
          'EXPECTED_STATUS_MISMATCH',
          'EXPECTED_ROLE_MISMATCH',
          'ADMIN_RECORD_NOT_FOUND',
          'VERIFIED_TOTP_FACTOR_REQUIRED',
        ])
        .nullable(),
      operation: z.enum(['create', 'activate_invited']).optional(),
    })
    .strict()
    .parse(previewResult.data);

  process.stdout.write(
    `${JSON.stringify({
      authUserVerified: true,
      bootstrapAllowed: preview.allowed,
      reasonCode: preview.reasonCode,
    })}\n`,
  );

  if (!options.apply) {
    process.stdout.write('Bootstrap dry run complete; no database write was performed.\n');
    return;
  }

  if (!preview.allowed) {
    throw new Error('Trusted first-Super-Admin bootstrap preview refused the operation');
  }

  const { data, error } = await client.rpc('bootstrap_first_super_admin', {
    p_user_id: options.userId,
    p_display_name: options.displayName ?? null,
    p_require_mfa: options.requireMfa,
    p_activate_invited: options.activateInvited,
    p_expected_status: options.expectedStatus ?? null,
    p_expected_role_key: options.expectedRoleKey ?? null,
    p_request_id: randomUUID(),
  });

  if (error) {
    throw new Error('Trusted first-Super-Admin bootstrap operation was refused');
  }

  const result = z
    .object({
      operation: z.enum(['create', 'activate_invited']),
      userId: z.uuid(),
      roleKey: z.literal('super_admin'),
    })
    .strict()
    .parse(data);
  process.stdout.write(
    `${JSON.stringify({ operation: result.operation, roleKey: result.roleKey })}\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Bootstrap failed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
