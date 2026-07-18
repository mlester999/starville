import { assetIdentifierSchema, assetRotationSchema } from '@starville/asset-management';
import { z } from 'zod';

import {
  findStarvilleWorkspaceRoot,
  readBundledMedia,
  resolveBundledMediaDescriptor,
} from '../../../../../lib/world-assets/bundled-media';
import { isAssetManagerRequestAuthorized } from '../../../../../lib/world-assets/authorization';

export const dynamic = 'force-dynamic';

const parametersSchema = z
  .object({
    key: assetIdentifierSchema,
    variant: z.enum(['source', 'thumbnail']),
  })
  .strict();

function unavailable(status = 404): Response {
  return new Response(null, {
    status,
    headers: {
      'cache-control': 'private, no-store, max-age=0',
      'x-content-type-options': 'nosniff',
    },
  });
}

export async function GET(
  request: Request,
  context: {
    readonly params: Promise<{ readonly key: string; readonly variant: string }>;
  },
): Promise<Response> {
  if (!(await isAssetManagerRequestAuthorized('assets.read'))) return unavailable(403);
  const parameters = parametersSchema.safeParse(await context.params);
  if (!parameters.success) return unavailable(400);
  const url = new URL(request.url);
  const rotationValue = url.searchParams.get('rotation');
  const rotation =
    rotationValue === null ? null : assetRotationSchema.safeParse(Number(rotationValue));
  if (rotation !== null && !rotation.success) return unavailable(400);
  if (parameters.data.variant === 'thumbnail' && rotationValue !== null) return unavailable(400);

  const workspaceRoot = findStarvilleWorkspaceRoot();
  if (workspaceRoot === null) return unavailable(503);
  const descriptor = resolveBundledMediaDescriptor({
    key: parameters.data.key,
    variant: parameters.data.variant,
    workspaceRoot,
    ...(rotation === null ? {} : { rotation: rotation.data }),
  });
  if (descriptor === null) return unavailable();
  const bytes = await readBundledMedia(descriptor, workspaceRoot);
  if (bytes === null) return unavailable();

  const body = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Response(body, {
    status: 200,
    headers: {
      'cache-control': 'private, no-store, max-age=0',
      'content-length': String(bytes.byteLength),
      'content-security-policy': "default-src 'none'; sandbox",
      'content-type': 'image/webp',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
  });
}
