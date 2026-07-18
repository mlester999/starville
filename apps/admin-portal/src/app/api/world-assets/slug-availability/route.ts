import { assetSlugSchema } from '@starville/asset-management';

import { getVerifiedAccessToken } from '../../../../lib/auth/api-session';
import { parseAdminPublicConfig } from '../../../../lib/public-config';
import { createAdminServerClient } from '../../../../lib/supabase/server';
import { isAssetManagerRequestAuthorized } from '../../../../lib/world-assets/authorization';
import {
  generateAssetSlug,
  isValidAssetSlug,
  suggestAlternateAssetSlug,
} from '../../../../lib/world-assets/upload';

export const dynamic = 'force-dynamic';

function safeError(status: number, code: string): Response {
  return Response.json({ success: false, error: { code } }, { status });
}

/**
 * Bounded availability check for a generated asset slug before upload.
 * Server-side uniqueness remains authoritative at create time.
 */
export async function GET(request: Request): Promise<Response> {
  if (!(await isAssetManagerRequestAuthorized('assets.upload'))) {
    return safeError(403, 'ASSET_SLUG_CHECK_FORBIDDEN');
  }
  const config = parseAdminPublicConfig(process.env);
  if (
    request.headers.get('origin') !== null &&
    request.headers.get('origin') !== config.appOrigin
  ) {
    return safeError(403, 'UNTRUSTED_ADMIN_ORIGIN');
  }

  const url = new URL(request.url);
  const raw = (url.searchParams.get('slug') ?? '').trim().toLowerCase();
  const slug = generateAssetSlug(raw);
  if (!isValidAssetSlug(slug) || !assetSlugSchema.safeParse(slug).success) {
    return Response.json({
      success: true,
      data: {
        slug,
        available: false,
        reason: 'invalid',
        suggestion: null,
      },
    });
  }

  const supabase = await createAdminServerClient();
  const accessToken = await getVerifiedAccessToken(supabase);
  if (accessToken === undefined) return safeError(401, 'AUTHENTICATION_REQUIRED');

  const query = new URLSearchParams({
    search: slug,
    limit: '20',
    offset: '0',
    sort: 'friendly_name',
    direction: 'asc',
  });

  let response: Response;
  try {
    response = await fetch(new URL(`/api/v1/admin/world-assets?${query}`, config.apiUrl), {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${accessToken}`,
        origin: config.appOrigin,
      },
      cache: 'no-store',
    });
  } catch {
    return safeError(503, 'ASSET_SLUG_CHECK_UNAVAILABLE');
  }

  if (!response.ok) {
    if (response.status === 403) return safeError(403, 'ASSET_SLUG_CHECK_FORBIDDEN');
    return safeError(503, 'ASSET_SLUG_CHECK_UNAVAILABLE');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return safeError(502, 'INVALID_ASSET_SLUG_CHECK_RESPONSE');
  }

  const data =
    typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)['data']
      : undefined;
  const items =
    typeof data === 'object' && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)['items']
      : undefined;

  const taken = new Set<string>();
  if (Array.isArray(items)) {
    for (const item of items) {
      if (typeof item !== 'object' || item === null) continue;
      const record = item as Record<string, unknown>;
      if (typeof record['slug'] === 'string') taken.add(record['slug']);
      if (typeof record['gameId'] === 'string') taken.add(record['gameId']);
    }
  }

  const available = !taken.has(slug);
  const suggestion = available ? null : suggestAlternateAssetSlug(slug, taken);

  return Response.json({
    success: true,
    data: {
      slug,
      available,
      reason: available ? 'available' : 'taken',
      suggestion,
    },
  });
}
