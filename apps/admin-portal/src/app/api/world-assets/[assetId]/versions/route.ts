import {
  ASSET_SOURCE_MEDIA_TYPES,
  GLOBAL_ASSET_SOURCE_MAX_BYTES,
  assetCreateVersionUploadMetadataSchema,
  assetMutationResponseSchema,
} from '@starville/asset-management';
import { loadHostedWriteSafetyConfig } from '@starville/config/server';
import { createLogger } from '@starville/logger';
import { z } from 'zod';

import { getVerifiedAccessToken } from '../../../../../lib/auth/api-session';
import { parseAdminPublicConfig } from '../../../../../lib/public-config';
import { createAdminServerClient } from '../../../../../lib/supabase/server';
import { isAssetManagerRequestAuthorized } from '../../../../../lib/world-assets/authorization';
import { parseDeclaredUploadLength } from '../../../../../lib/world-assets/upload-boundary';

export const dynamic = 'force-dynamic';

const REMOTE_UPLOAD_DISABLED_MESSAGE =
  'Remote asset uploads are currently disabled because hosted writes have not been approved for this session.';

const ownerMessages = {
  ASSET_REMOTE_WRITES_DISABLED: REMOTE_UPLOAD_DISABLED_MESSAGE,
  ASSET_VERSION_UPLOAD_UNAVAILABLE:
    'The trusted asset API is unavailable. Start or restart the API service and try again.',
  ASSET_STORAGE_UNAVAILABLE:
    'The protected asset storage service is unavailable. Verify the asset-intake bucket and API storage access.',
  ASSET_MANAGEMENT_UNAVAILABLE:
    'The asset database operation is unavailable. No draft version was completed.',
  ASSET_FILE_TOO_LARGE: 'This file exceeds the source-size limit.',
  ASSET_FILE_UNSUPPORTED: 'This is not a supported PNG or WebP image.',
  ASSET_FILE_INVALID: 'The image processor could not safely decode this file.',
  ASSET_NOT_FOUND: 'The asset no longer exists or is not available to this administrator.',
  ASSET_DUPLICATE: 'This exact asset content already exists.',
  ASSET_VERSION_CONFLICT:
    'The asset changed or already has an open candidate. Reload before trying again.',
  ASSET_STATE_CONFLICT: 'The asset is not in a state that accepts another draft version.',
  RATE_LIMITED: 'Too many uploads were attempted. Wait briefly and try again.',
  INVALID_ASSET_REQUEST: 'The upload request was malformed or incomplete.',
  ASSET_VERSION_UPLOAD_FAILED: 'The new version could not be uploaded. Please try again.',
} as const;

type OwnerUploadErrorCode = keyof typeof ownerMessages;

const logger = createLogger({
  service: 'admin-portal',
  environment:
    process.env.NODE_ENV === 'production'
      ? 'production'
      : process.env.NODE_ENV === 'test'
        ? 'test'
        : 'development',
  level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
});

function safeRequestId(request: Request): string {
  const candidate = z.uuid().safeParse(request.headers.get('x-request-id'));
  return candidate.success ? candidate.data : crypto.randomUUID();
}

function safeError(status: number, code: OwnerUploadErrorCode, requestId: string): Response {
  return Response.json(
    { success: false, error: { code, message: ownerMessages[code] }, requestId },
    { status },
  );
}

function upstreamErrorCode(value: unknown): OwnerUploadErrorCode | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const error = Reflect.get(value, 'error');
  if (typeof error !== 'object' || error === null || Array.isArray(error)) return undefined;
  const code = Reflect.get(error, 'code');
  return typeof code === 'string' && code in ownerMessages
    ? (code as OwnerUploadErrorCode)
    : undefined;
}

function logFailure(
  requestId: string,
  assetId: string | null,
  processingStage: string,
  errorCategory: string,
): void {
  logger.child({ requestId, assetId }).warn('admin.asset.version_upload_proxy_failed', {
    processingStage,
    errorCategory,
  });
}

function formString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' ? value : undefined;
}

function upstreamData(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return (value as Record<string, unknown>)['data'];
}

export async function POST(
  request: Request,
  context: { readonly params: Promise<{ readonly assetId: string }> },
): Promise<Response> {
  const requestId = safeRequestId(request);
  if (!(await isAssetManagerRequestAuthorized('assets.upload'))) {
    return safeError(403, 'INVALID_ASSET_REQUEST', requestId);
  }
  const config = parseAdminPublicConfig(process.env);
  if (request.headers.get('origin') !== config.appOrigin) {
    return safeError(403, 'INVALID_ASSET_REQUEST', requestId);
  }
  const assetId = z.uuid().safeParse((await context.params).assetId);
  if (!assetId.success) return safeError(400, 'INVALID_ASSET_REQUEST', requestId);

  if (!loadHostedWriteSafetyConfig(process.env).remoteWritesApproved) {
    logFailure(requestId, assetId.data, 'remote_write_gate', 'remote_writes_not_approved');
    return safeError(503, 'ASSET_REMOTE_WRITES_DISABLED', requestId);
  }

  const declaredLength = parseDeclaredUploadLength(request.headers.get('content-length'));
  if (!declaredLength.ok) {
    return safeError(
      declaredLength.status,
      declaredLength.status === 411
        ? 'INVALID_ASSET_REQUEST'
        : declaredLength.status === 413
          ? 'ASSET_FILE_TOO_LARGE'
          : 'INVALID_ASSET_REQUEST',
      requestId,
    );
  }

  let incoming: FormData;
  try {
    incoming = await request.formData();
  } catch {
    logFailure(requestId, assetId.data, 'multipart_parse', 'malformed_multipart');
    return safeError(400, 'INVALID_ASSET_REQUEST', requestId);
  }
  const metadata = assetCreateVersionUploadMetadataSchema.safeParse({
    sourceVersionId: formString(incoming, 'sourceVersionId'),
    configurationMode: formString(incoming, 'configurationMode'),
    expectedAssetRevision: Number(formString(incoming, 'expectedAssetRevision')),
    reason: formString(incoming, 'reason'),
    idempotencyKey: formString(incoming, 'idempotencyKey'),
  });
  const file = incoming.get('file');
  if (!metadata.success || !(file instanceof File)) {
    return safeError(400, 'INVALID_ASSET_REQUEST', requestId);
  }
  if (
    file.size <= 0 ||
    file.size > GLOBAL_ASSET_SOURCE_MAX_BYTES ||
    !(ASSET_SOURCE_MEDIA_TYPES as readonly string[]).includes(file.type)
  ) {
    return safeError(422, 'ASSET_FILE_UNSUPPORTED', requestId);
  }

  const supabase = await createAdminServerClient();
  const accessToken = await getVerifiedAccessToken(supabase);
  if (accessToken === undefined) return safeError(401, 'INVALID_ASSET_REQUEST', requestId);

  const outgoing = new FormData();
  outgoing.set('metadata', JSON.stringify(metadata.data));
  outgoing.set('file', file, file.name);

  let response: Response;
  try {
    response = await fetch(
      new URL(`/api/v1/admin/world-assets/${assetId.data}/versions`, config.apiUrl),
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${accessToken}`,
          origin: config.appOrigin,
          'x-request-id': metadata.data.idempotencyKey,
        },
        body: outgoing,
        cache: 'no-store',
      },
    );
  } catch {
    logFailure(requestId, assetId.data, 'api_forward', 'api_unavailable');
    return safeError(503, 'ASSET_VERSION_UPLOAD_UNAVAILABLE', requestId);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    logFailure(requestId, assetId.data, 'api_response', 'invalid_api_response');
    return safeError(502, 'ASSET_VERSION_UPLOAD_FAILED', requestId);
  }
  if (!response.ok) {
    const status = [400, 403, 404, 409, 413, 415, 422, 429].includes(response.status)
      ? response.status
      : 503;
    const code =
      upstreamErrorCode(payload) ??
      (status === 409 ? 'ASSET_VERSION_CONFLICT' : 'ASSET_VERSION_UPLOAD_FAILED');
    logFailure(requestId, assetId.data, 'api_response', code.toLowerCase());
    return safeError(status, code, requestId);
  }
  const parsed = assetMutationResponseSchema.safeParse(upstreamData(payload));
  if (!parsed.success) {
    logFailure(requestId, assetId.data, 'api_response', 'invalid_api_response');
    return safeError(502, 'ASSET_VERSION_UPLOAD_FAILED', requestId);
  }
  return Response.json({ success: true, data: parsed.data });
}
