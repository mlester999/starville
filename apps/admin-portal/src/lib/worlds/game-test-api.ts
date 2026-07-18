import 'server-only';

import { z } from 'zod';

import { callTrustedAdminApi } from '../admin-api';

const environmentSchema = z.enum(['development', 'test', 'production']);
const resultSchema = z.enum(['passed', 'failed', 'blocked', 'needs_changes']);

const grantSchema = z
  .object({
    grantToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
    sessionId: z.uuid(),
    worldMapId: z.uuid(),
    worldMapVersionId: z.uuid(),
    environment: environmentSchema,
    expiresAt: z.iso.datetime({ offset: true }),
    returnPath: z.string().startsWith('/').max(500),
  })
  .strip();

const evidenceSchema = z
  .object({
    evidenceId: z.uuid(),
    sessionId: z.uuid(),
    worldMapVersionId: z.uuid(),
    result: resultSchema,
    gameClientBuild: z.string().min(1).max(120),
    environment: environmentSchema,
    recordedAt: z.iso.datetime({ offset: true }),
    publicationReadiness: z.enum(['recommended', 'not_recommended']),
  })
  .strict();
const statusSchema = z
  .object({
    status: z.literal('loaded'),
    worldMapId: z.uuid(),
    worldMapVersionId: z.uuid(),
    gameTestStatus: z.enum([
      'passed',
      'failed',
      'blocked',
      'needs_changes',
      'not_tested',
      'test_outdated',
    ]),
    latestEvidence: z
      .object({
        id: z.uuid(),
        result: resultSchema,
        testerAdministratorId: z.uuid(),
        testerDisplayName: z.string().min(1).max(100),
        gameClientBuild: z.string().min(1).max(120),
        environment: environmentSchema,
        recordedAt: z.iso.datetime({ offset: true }),
      })
      .strict()
      .nullable(),
    activeSessions: z
      .array(
        z
          .object({
            id: z.uuid(),
            status: z.enum(['issued', 'active']),
            createdAt: z.iso.datetime({ offset: true }),
            expiresAt: z.iso.datetime({ offset: true }),
            exchangedAt: z.iso.datetime({ offset: true }).nullable(),
            gameClientBuild: z.string().min(1).max(120).nullable(),
          })
          .strict(),
      )
      .max(5),
  })
  .strict();

export type WorldGameTestEvidenceResult = z.infer<typeof resultSchema>;
export type WorldGameTestStatus = z.infer<typeof statusSchema>;

export function loadWorldGameTestStatus(mapId: string, versionId: string, requestId: string) {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/worlds/${encodeURIComponent(mapId)}/versions/${encodeURIComponent(versionId)}/game-test-status`,
    requestId,
    parser: (value) => statusSchema.parse(value),
  });
}

export function createWorldGameTest(
  mapId: string,
  versionId: string,
  input: {
    readonly expectedEditVersion: number;
    readonly expectedChecksum: string;
    readonly returnPath: string;
    readonly clientRequestId: string;
  },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/worlds/${encodeURIComponent(mapId)}/versions/${encodeURIComponent(versionId)}/game-tests`,
    body: input,
    requestId,
    parser: (value) => grantSchema.parse(value),
  });
}

export function revokeWorldGameTest(sessionId: string, requestId: string) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/world-game-tests/${encodeURIComponent(sessionId)}/revoke`,
    body: {},
    requestId,
    parser: (value) => z.object({ sessionId: z.uuid() }).strict().parse(value),
  });
}

export function recordWorldGameTestEvidence(
  sessionId: string,
  input: {
    readonly result: WorldGameTestEvidenceResult;
    readonly checklist: Readonly<Record<string, boolean>>;
    readonly notes: string;
  },
  requestId: string,
) {
  return callTrustedAdminApi({
    method: 'POST',
    pathname: `/api/v1/admin/world-game-tests/${encodeURIComponent(sessionId)}/evidence`,
    body: input,
    requestId,
    parser: (value) => evidenceSchema.parse(value),
  });
}
