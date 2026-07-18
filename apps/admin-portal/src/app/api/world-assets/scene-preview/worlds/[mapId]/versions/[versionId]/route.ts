import { z } from 'zod';

import {
  assetSceneWorldContextSchema,
  assetSceneWorldSourceSchema,
} from '../../../../../../../../lib/world-assets/scene-preview-model';
import { isAssetScenePreviewRequestAuthorized } from '../../../../../../../../lib/world-assets/authorization';
import {
  loadPublishedWorldTopology,
  loadWorldDetail,
  loadWorldPreview,
} from '../../../../../../../../lib/worlds/api';

export const dynamic = 'force-dynamic';

const parametersSchema = z.object({ mapId: z.uuid(), versionId: z.uuid() }).strict();

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined;
  return typeof error.status === 'number' ? error.status : undefined;
}

function responseHeaders(): HeadersInit {
  return {
    'cache-control': 'private, no-store, max-age=0',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  };
}

function safeError(status: number, code: string): Response {
  return Response.json(
    {
      success: false,
      error: { code, message: 'The read-only world preview could not be loaded.' },
      requestId: crypto.randomUUID(),
    },
    { status, headers: responseHeaders() },
  );
}

export async function GET(
  request: Request,
  context: {
    readonly params: Promise<{ readonly mapId: string; readonly versionId: string }>;
  },
): Promise<Response> {
  const parameters = parametersSchema.safeParse(await context.params);
  const source = assetSceneWorldSourceSchema.safeParse(
    new URL(request.url).searchParams.get('source'),
  );
  if (!parameters.success || !source.success)
    return safeError(400, 'INVALID_SCENE_PREVIEW_REQUEST');

  const permission = source.data === 'draft' ? 'maps.preview' : 'maps.read';
  if (!(await isAssetScenePreviewRequestAuthorized(permission))) {
    return safeError(403, 'SCENE_PREVIEW_PERMISSION_DENIED');
  }

  try {
    if (source.data === 'draft') {
      const preview = await loadWorldPreview(parameters.data.mapId, parameters.data.versionId);
      const result = assetSceneWorldContextSchema.parse({
        status: 'loaded',
        source: 'draft',
        readOnly: true,
        map: preview.map,
        version: preview.version,
        manifest: preview.manifest,
      });
      return Response.json(result, { status: 200, headers: responseHeaders() });
    }

    const [topology, detail] = await Promise.all([
      loadPublishedWorldTopology(),
      loadWorldDetail(parameters.data.mapId),
    ]);
    const published = topology.maps.find(
      (map) => map.id === parameters.data.mapId && map.versionId === parameters.data.versionId,
    );
    const version = detail.versions.find(({ id }) => id === parameters.data.versionId);
    if (
      published === undefined ||
      version === undefined ||
      detail.map.activePublishedVersionId !== parameters.data.versionId ||
      version.lifecycleStatus !== 'published'
    ) {
      return safeError(404, 'SCENE_PREVIEW_WORLD_NOT_FOUND');
    }
    const result = assetSceneWorldContextSchema.parse({
      status: 'loaded',
      source: 'published',
      readOnly: true,
      map: detail.map,
      version,
      manifest: published.manifest,
    });
    return Response.json(result, { status: 200, headers: responseHeaders() });
  } catch (error) {
    if (errorStatus(error) === 404) {
      return safeError(404, 'SCENE_PREVIEW_WORLD_NOT_FOUND');
    }
    if (errorStatus(error) === 403) {
      return safeError(403, 'SCENE_PREVIEW_PERMISSION_DENIED');
    }
    return safeError(503, 'SCENE_PREVIEW_UNAVAILABLE');
  }
}
