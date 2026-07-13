import {
  assetMutationResponseSchema,
  assetUploadMetadataSchema,
} from '@starville/asset-management';

import { getVerifiedAccessToken } from '../../../../lib/auth/api-session';
import { parseAdminPublicConfig } from '../../../../lib/public-config';
import { createAdminServerClient } from '../../../../lib/supabase/server';
import { isAssetManagerRequestAuthorized } from '../../../../lib/world-assets/authorization';
import { assetTypeProfile } from '../../../../lib/world-assets/profiles';
import { parseDeclaredUploadLength } from '../../../../lib/world-assets/upload-boundary';

export const dynamic = 'force-dynamic';

function safeError(status: number, code: string): Response {
  return Response.json({ success: false, error: { code } }, { status });
}

function formString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' ? value : undefined;
}

function upstreamData(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return (value as Record<string, unknown>)['data'];
}

export async function POST(request: Request): Promise<Response> {
  if (!(await isAssetManagerRequestAuthorized('assets.upload'))) {
    return safeError(403, 'ASSET_UPLOAD_FORBIDDEN');
  }
  const config = parseAdminPublicConfig(process.env);
  if (request.headers.get('origin') !== config.appOrigin) {
    return safeError(403, 'UNTRUSTED_ADMIN_ORIGIN');
  }

  const declaredLength = parseDeclaredUploadLength(request.headers.get('content-length'));
  if (!declaredLength.ok) {
    return safeError(
      declaredLength.status,
      declaredLength.status === 411
        ? 'ASSET_UPLOAD_LENGTH_REQUIRED'
        : declaredLength.status === 413
          ? 'ASSET_UPLOAD_TOO_LARGE'
          : 'INVALID_ASSET_UPLOAD_LENGTH',
    );
  }

  let incoming: FormData;
  try {
    // Chunked bodies remain subject to the hosting runtime's request limit and the trusted API's
    // independent byte limit. This proxy rejects declared oversized bodies before buffering.
    incoming = await request.formData();
  } catch {
    return safeError(400, 'INVALID_ASSET_UPLOAD');
  }

  const marker = formString(incoming, 'developmentMarkerReplacementKey')?.trim() || null;
  const metadata = assetUploadMetadataSchema.safeParse({
    idempotencyKey: formString(incoming, 'idempotencyKey'),
    friendlyName: formString(incoming, 'friendlyName'),
    slug: formString(incoming, 'slug'),
    assetType: formString(incoming, 'assetType'),
    category: formString(incoming, 'category'),
    developmentMarkerReplacementKey: marker,
  });
  const file = incoming.get('file');
  if (!metadata.success || !(file instanceof File)) {
    return safeError(400, 'INVALID_ASSET_UPLOAD');
  }

  const profile = assetTypeProfile(metadata.data.assetType);
  if (
    file.size <= 0 ||
    file.size > profile.maxFileSizeBytes ||
    !profile.acceptedMediaTypes.includes(file.type as 'image/png' | 'image/webp')
  ) {
    return safeError(422, 'UNSUPPORTED_ASSET_FILE');
  }

  const supabase = await createAdminServerClient();
  const accessToken = await getVerifiedAccessToken(supabase);
  if (accessToken === undefined) return safeError(401, 'AUTHENTICATION_REQUIRED');

  const outgoing = new FormData();
  outgoing.set('metadata', JSON.stringify(metadata.data));
  outgoing.set('file', file, file.name);

  let response: Response;
  try {
    response = await fetch(new URL('/api/v1/admin/world-assets', config.apiUrl), {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${accessToken}`,
        origin: config.appOrigin,
        'x-request-id': metadata.data.idempotencyKey,
      },
      body: outgoing,
      cache: 'no-store',
    });
  } catch {
    return safeError(503, 'ASSET_UPLOAD_UNAVAILABLE');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return safeError(502, 'INVALID_ASSET_UPLOAD_RESPONSE');
  }
  if (!response.ok) {
    const status = [400, 403, 409, 413, 415, 422, 429].includes(response.status)
      ? response.status
      : 503;
    return safeError(status, status === 409 ? 'DUPLICATE_ASSET_UPLOAD' : 'ASSET_UPLOAD_FAILED');
  }
  const parsed = assetMutationResponseSchema.safeParse(upstreamData(payload));
  if (!parsed.success) return safeError(502, 'INVALID_ASSET_UPLOAD_RESPONSE');
  return Response.json({ success: true, data: parsed.data }, { status: 200 });
}
