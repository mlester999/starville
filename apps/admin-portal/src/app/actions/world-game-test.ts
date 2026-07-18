'use server';

import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { AdminApiError } from '../../lib/admin-api';
import { requireAuthorizedAdmin } from '../../lib/auth/authorization';
import { parseAdminPublicConfig } from '../../lib/public-config';
import {
  createWorldGameTest,
  recordWorldGameTestEvidence,
  revokeWorldGameTest,
  type WorldGameTestEvidenceResult,
} from '../../lib/worlds/game-test-api';

const openSchema = z
  .object({
    mapId: z.uuid(),
    versionId: z.uuid(),
    expectedEditVersion: z.number().int().positive(),
    expectedChecksum: z.string().regex(/^[0-9a-f]{64}$/u),
    returnPath: z
      .string()
      .min(1)
      .max(500)
      .regex(/^\/(?!\/)/u)
      .refine((value) => !value.includes('://') && !/[<>\p{Cc}]/u.test(value)),
  })
  .strict();
const evidenceSchema = z
  .object({
    sessionId: z.uuid(),
    result: z.enum(['passed', 'failed', 'blocked', 'needs_changes']),
    checklist: z.record(z.string(), z.boolean()),
    notes: z.string().trim().min(1).max(2_000),
  })
  .strict();

export type WorldGameTestActionState =
  | { readonly outcome: 'error'; readonly code: string; readonly message: string }
  | {
      readonly outcome: 'opened';
      readonly sessionId: string;
      readonly expiresAt: string;
      readonly environment: 'development' | 'test' | 'production';
      readonly reopenUrl: string;
    }
  | {
      readonly outcome: 'recorded';
      readonly result: WorldGameTestEvidenceResult;
      readonly message: string;
    }
  | { readonly outcome: 'revoked'; readonly message: string };

export type WorldGameTestOpenActionState =
  | Extract<WorldGameTestActionState, { outcome: 'error' }>
  | {
      readonly outcome: 'launch_ready';
      readonly launchUrl: string;
      readonly sessionId: string;
      readonly expiresAt: string;
      readonly environment: 'development' | 'test' | 'production';
      readonly reopenUrl: string;
    };

function apiError(error: unknown): Extract<WorldGameTestActionState, { outcome: 'error' }> {
  if (error instanceof AdminApiError) {
    if (error.code === 'MFA_REQUIRED') {
      return {
        outcome: 'error',
        code: 'PERMISSION_LOCKED',
        message: 'Game Test requires a current AAL2 administrator session.',
      };
    }
    if (error.code === 'WORLD_GAME_TEST_STALE') {
      return {
        outcome: 'error',
        code: 'STALE_REVISION',
        message: 'This revision changed. Reload the editor before opening Game Test.',
      };
    }
    if (error.code === 'WORLD_GAME_TEST_MAINTENANCE') {
      return {
        outcome: 'error',
        code: 'MAINTENANCE_BLOCKED',
        message: 'Game Test is unavailable while maintenance is active.',
      };
    }
    if (error.status === 404) {
      return {
        outcome: 'error',
        code: 'NO_DRAFT',
        message: 'The exact validated revision is no longer available.',
      };
    }
    if (error.status === 429) {
      return {
        outcome: 'error',
        code: 'PREVIEW_SERVICE_UNAVAILABLE',
        message: 'Too many Game Test sessions are active. Exit one or wait briefly.',
      };
    }
  }
  return {
    outcome: 'error',
    code: 'PREVIEW_SERVICE_UNAVAILABLE',
    message: 'The secure Game Test service is temporarily unavailable.',
  };
}

export async function openWorldGameTestAction(
  input: unknown,
): Promise<WorldGameTestOpenActionState> {
  const context = await requireAuthorizedAdmin('maps.preview');
  if (context.assuranceLevel !== 'aal2') {
    return {
      outcome: 'error',
      code: 'PERMISSION_LOCKED',
      message: 'Game Test requires a current AAL2 administrator session.',
    };
  }
  const parsed = openSchema.safeParse(input);
  if (!parsed.success) {
    return {
      outcome: 'error',
      code: 'STALE_REVISION',
      message: 'The exact saved revision could not be identified.',
    };
  }
  const config = parseAdminPublicConfig(process.env);
  const returnPath = parsed.data.returnPath;
  try {
    const grant = await createWorldGameTest(
      parsed.data.mapId,
      parsed.data.versionId,
      {
        expectedEditVersion: parsed.data.expectedEditVersion,
        expectedChecksum: parsed.data.expectedChecksum,
        returnPath,
        clientRequestId: randomUUID(),
      },
      randomUUID(),
    );
    const launch = new URL('/preview/world', config.gameUrl);
    launch.hash = new URLSearchParams({ grant: grant.grantToken }).toString();
    return {
      outcome: 'launch_ready',
      launchUrl: launch.toString(),
      sessionId: grant.sessionId,
      expiresAt: grant.expiresAt,
      environment: grant.environment,
      reopenUrl: new URL('/preview/world', config.gameUrl).toString(),
    };
  } catch (error) {
    return apiError(error);
  }
}

export async function recordWorldGameTestEvidenceAction(
  input: unknown,
): Promise<WorldGameTestActionState> {
  const context = await requireAuthorizedAdmin('maps.preview');
  if (context.assuranceLevel !== 'aal2') return apiError(new AdminApiError(403, 'MFA_REQUIRED'));
  const parsed = evidenceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      outcome: 'error',
      code: 'INVALID_EVIDENCE',
      message: 'Complete the checklist and add concise test notes.',
    };
  }
  try {
    const evidence = await recordWorldGameTestEvidence(
      parsed.data.sessionId,
      {
        result: parsed.data.result,
        checklist: parsed.data.checklist,
        notes: parsed.data.notes,
      },
      randomUUID(),
    );
    return {
      outcome: 'recorded',
      result: evidence.result,
      message:
        evidence.publicationReadiness === 'recommended'
          ? 'Passed evidence is bound to this exact revision. Publication remains a separate action.'
          : 'Evidence was recorded for this exact revision. Publication is not recommended yet.',
    };
  } catch (error) {
    return apiError(error);
  }
}

export async function revokeWorldGameTestAction(
  sessionId: unknown,
): Promise<WorldGameTestActionState> {
  const context = await requireAuthorizedAdmin('maps.preview');
  if (context.assuranceLevel !== 'aal2') return apiError(new AdminApiError(403, 'MFA_REQUIRED'));
  const parsed = z.uuid().safeParse(sessionId);
  if (!parsed.success) return apiError(undefined);
  try {
    await revokeWorldGameTest(parsed.data, randomUUID());
    return { outcome: 'revoked', message: 'The Game Test session was revoked.' };
  } catch (error) {
    return apiError(error);
  }
}
