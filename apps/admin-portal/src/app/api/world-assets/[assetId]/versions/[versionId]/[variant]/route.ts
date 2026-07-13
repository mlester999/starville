import { randomUUID } from 'node:crypto';

import {
  GLOBAL_ASSET_DERIVATIVE_MAX_BYTES,
  GLOBAL_ASSET_INTAKE_MAX_BYTES,
} from '@starville/asset-management';
import { z } from 'zod';

import { getVerifiedAccessToken } from '../../../../../../../lib/auth/api-session';
import { parseAdminPublicConfig } from '../../../../../../../lib/public-config';
import { createAdminServerClient } from '../../../../../../../lib/supabase/server';
import { isAssetManagerRequestAuthorized } from '../../../../../../../lib/world-assets/authorization';

export const dynamic = 'force-dynamic';

const parametersSchema = z
  .object({
    assetId: z.uuid(),
    versionId: z.uuid(),
    variant: z.enum(['original', 'source', 'preview', 'thumbnail']),
  })
  .strict();

function unavailable(status = 404): Response {
  return new Response(null, {
    status,
    headers: { 'cache-control': 'private, no-store, max-age=0' },
  });
}

export async function GET(
  _request: Request,
  context: {
    readonly params: Promise<{
      readonly assetId: string;
      readonly versionId: string;
      readonly variant: string;
    }>;
  },
): Promise<Response> {
  if (!(await isAssetManagerRequestAuthorized('assets.read'))) return unavailable(403);
  const parameters = parametersSchema.safeParse(await context.params);
  if (!parameters.success) return unavailable(400);

  const config = parseAdminPublicConfig(process.env);
  const supabase = await createAdminServerClient();
  const accessToken = await getVerifiedAccessToken(supabase);
  if (accessToken === undefined) return unavailable(401);
  const requestId = randomUUID();
  const originalRequested = parameters.data.variant === 'original';

  let upstream: Response;
  try {
    upstream = await fetch(
      new URL(
        `/api/v1/admin/world-assets/${encodeURIComponent(parameters.data.assetId)}/versions/${encodeURIComponent(parameters.data.versionId)}/${parameters.data.variant}`,
        config.apiUrl,
      ),
      {
        cache: 'no-store',
        headers: {
          accept: originalRequested ? 'image/png, image/webp' : 'image/webp',
          authorization: `Bearer ${accessToken}`,
          origin: config.appOrigin,
          'x-request-id': requestId,
        },
      },
    );
  } catch {
    return unavailable(503);
  }

  const mediaType = z
    .enum(['image/png', 'image/webp'])
    .safeParse(upstream.headers.get('content-type')?.split(';')[0]);
  const mediaTypeAllowed = originalRequested
    ? mediaType.success
    : mediaType.success && mediaType.data === 'image/webp';
  if (!upstream.ok || !mediaTypeAllowed || !mediaType.success) {
    return unavailable(upstream.status === 403 ? 403 : 404);
  }
  const maximumBytes = originalRequested
    ? GLOBAL_ASSET_INTAKE_MAX_BYTES
    : GLOBAL_ASSET_DERIVATIVE_MAX_BYTES;
  const declaredLength = z.coerce
    .number()
    .int()
    .positive()
    .max(maximumBytes)
    .safeParse(upstream.headers.get('content-length'));
  if (!declaredLength.success) return unavailable(502);
  const bytes = await upstream.arrayBuffer();
  if (bytes.byteLength !== declaredLength.data || bytes.byteLength > maximumBytes) {
    return unavailable(502);
  }

  return new Response(bytes, {
    status: 200,
    headers: {
      'cache-control': 'private, no-store, max-age=0',
      'content-length': String(bytes.byteLength),
      'content-type': mediaType.data,
      'x-content-type-options': 'nosniff',
    },
  });
}
