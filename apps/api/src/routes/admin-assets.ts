import type { MultipartFile, MultipartValue } from '@fastify/multipart';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import {
  GLOBAL_ASSET_INTAKE_MAX_BYTES,
  assetCreateVersionUploadMetadataSchema,
  assetUploadMetadataSchema,
} from '@starville/asset-management';

import { authorizeAdminRequest } from '../admin-authorization.js';
import type { AdminAuthGateway, ServiceLogger } from '../contracts.js';
import { PublicApiError } from '../errors.js';
import type {
  AdminAssetService,
  AssetUploadInput,
  AssetVersionUploadInput,
} from '../asset-management/contracts.js';
import { disableResponseCaching } from '../token-access/http.js';

const METADATA_MAX_BYTES = 16 * 1024;

function parameter(request: FastifyRequest, key: string): unknown {
  return typeof request.params === 'object' && request.params !== null
    ? Reflect.get(request.params, key)
    : undefined;
}

function response(data: unknown, requestId: string) {
  return { success: true, data, requestId } as const;
}

function assertTrustedOrigin(request: FastifyRequest, allowedOrigins: ReadonlySet<string>): void {
  const origin = request.headers.origin;
  if (origin === undefined || !allowedOrigins.has(origin)) {
    throw new PublicApiError(403, 'ORIGIN_NOT_ALLOWED');
  }
}

async function multipartUpload<Metadata>(
  request: FastifyRequest,
  metadataParser: (value: unknown) => Metadata,
): Promise<Readonly<{ metadata: Metadata; file: MultipartFile; bytes: Buffer }>> {
  let file: MultipartFile | undefined;
  let bytes: Buffer | undefined;
  let metadataValue: unknown;
  let metadataSeen = false;
  let parts = 0;

  try {
    for await (const part of request.parts({
      limits: {
        files: 1,
        fields: 1,
        parts: 2,
        fileSize: GLOBAL_ASSET_INTAKE_MAX_BYTES,
        fieldSize: METADATA_MAX_BYTES,
      },
    })) {
      parts += 1;
      if (part.type === 'file') {
        if (part.fieldname !== 'file' || file !== undefined) {
          throw new PublicApiError(400, 'INVALID_ASSET_REQUEST');
        }
        file = part;
        bytes = await part.toBuffer();
        if (part.file.truncated) throw new PublicApiError(413, 'ASSET_FILE_TOO_LARGE');
      } else {
        const field = part as MultipartValue;
        if (field.fieldname !== 'metadata' || metadataSeen) {
          throw new PublicApiError(400, 'INVALID_ASSET_REQUEST');
        }
        metadataSeen = true;
        metadataValue = field.value;
      }
    }
  } catch (error) {
    if (error instanceof PublicApiError) throw error;
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? Reflect.get(error, 'code')
        : undefined;
    if (code === 'FST_REQ_FILE_TOO_LARGE' || code === 'FST_FILES_LIMIT') {
      throw new PublicApiError(413, 'ASSET_FILE_TOO_LARGE');
    }
    throw new PublicApiError(400, 'INVALID_ASSET_REQUEST');
  }

  if (parts !== 2 || file === undefined || bytes === undefined || !metadataSeen) {
    throw new PublicApiError(400, 'INVALID_ASSET_REQUEST');
  }
  let decoded: unknown;
  try {
    decoded = typeof metadataValue === 'string' ? JSON.parse(metadataValue) : metadataValue;
  } catch {
    throw new PublicApiError(400, 'INVALID_ASSET_REQUEST');
  }
  let metadata: Metadata;
  try {
    metadata = metadataParser(decoded);
  } catch {
    throw new PublicApiError(400, 'INVALID_ASSET_REQUEST');
  }
  return { metadata, file, bytes };
}

export function registerAdminAssetRoutes(
  app: FastifyInstance,
  options: {
    readonly adminGateway: AdminAuthGateway;
    readonly service: AdminAssetService;
    readonly logger: ServiceLogger;
    readonly allowedOrigins: ReadonlySet<string>;
  },
): void {
  const authorize = (
    request: FastifyRequest,
    permission: Parameters<typeof authorizeAdminRequest>[3],
  ) => authorizeAdminRequest(request, options.adminGateway, options.logger, permission);

  app.get('/api/v1/admin/world-assets', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorize(request, 'assets.read');
    return response(
      await options.service.listAssets(identity, request.query, request.id),
      request.id,
    );
  });

  app.get('/api/v1/admin/world-assets/review', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorize(request, 'assets.review');
    return response(
      await options.service.listReviewQueue(identity, request.query, request.id),
      request.id,
    );
  });

  app.get('/api/v1/admin/world-assets/audit', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorize(request, 'assets.audit.read');
    return response(
      await options.service.listAudit(identity, request.query, request.id),
      request.id,
    );
  });

  app.get('/api/v1/admin/world-assets/editor-candidates', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorize(request, 'assets.read');
    return response(
      await options.service.listEditorCandidates(identity, request.query, request.id),
      request.id,
    );
  });

  app.post('/api/v1/admin/world-assets', async (request, reply) => {
    assertTrustedOrigin(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const identity = await authorize(request, 'assets.upload');
    const upload = await multipartUpload(request, (value) =>
      assetUploadMetadataSchema.parse(value),
    );
    const input: AssetUploadInput = {
      metadata: upload.metadata,
      originalFileName: upload.file.filename,
      declaredMediaType: upload.file.mimetype,
      bytes: upload.bytes,
    };
    return response(await options.service.upload(identity, input, request.id), request.id);
  });

  app.get('/api/v1/admin/world-assets/:assetId', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorize(request, 'assets.read');
    return response(
      await options.service.getAsset(identity, parameter(request, 'assetId'), request.id),
      request.id,
    );
  });

  app.get('/api/v1/admin/world-assets/:assetId/versions/:versionId', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorize(request, 'assets.read');
    return response(
      await options.service.getVersion(
        identity,
        parameter(request, 'assetId'),
        parameter(request, 'versionId'),
        request.id,
      ),
      request.id,
    );
  });

  app.get(
    '/api/v1/admin/world-assets/:assetId/versions/:versionId/:variant',
    async (request, reply) => {
      disableResponseCaching(reply);
      const identity = await authorize(request, 'assets.read');
      const media = await options.service.readMedia(
        identity,
        parameter(request, 'assetId'),
        parameter(request, 'versionId'),
        parameter(request, 'variant'),
        request.id,
      );
      void reply.header('content-type', media.mediaType);
      void reply.header('content-length', String(media.bytes.length));
      void reply.header('etag', `"sha256-${media.checksum}"`);
      void reply.header('x-content-type-options', 'nosniff');
      void reply.header('cross-origin-resource-policy', 'same-site');
      return reply.send(media.bytes);
    },
  );

  app.post('/api/v1/admin/world-assets/:assetId/versions', async (request, reply) => {
    assertTrustedOrigin(request, options.allowedOrigins);
    disableResponseCaching(reply);
    const identity = await authorize(request, 'assets.upload');
    const upload = await multipartUpload(request, (value) =>
      assetCreateVersionUploadMetadataSchema.parse(value),
    );
    const input: AssetVersionUploadInput = {
      metadata: upload.metadata,
      originalFileName: upload.file.filename,
      declaredMediaType: upload.file.mimetype,
      bytes: upload.bytes,
    };
    return response(
      await options.service.createVersion(
        identity,
        parameter(request, 'assetId'),
        input,
        request.id,
      ),
      request.id,
    );
  });

  app.post(
    '/api/v1/admin/world-assets/:assetId/versions/:versionId/draft',
    { bodyLimit: 32 * 1024 },
    async (request, reply) => {
      assertTrustedOrigin(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorize(request, 'assets.edit');
      return response(
        await options.service.updateDraft(
          identity,
          parameter(request, 'assetId'),
          parameter(request, 'versionId'),
          request.body as never,
          request.id,
        ),
        request.id,
      );
    },
  );

  app.post(
    '/api/v1/admin/world-assets/:assetId/versions/:versionId/validate',
    { bodyLimit: 4 * 1024 },
    async (request, reply) => {
      assertTrustedOrigin(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorize(request, 'assets.validate');
      return response(
        await options.service.validateVersion(
          identity,
          parameter(request, 'assetId'),
          parameter(request, 'versionId'),
          request.body,
          request.id,
        ),
        request.id,
      );
    },
  );

  app.post(
    '/api/v1/admin/world-assets/:assetId/versions/:versionId/submit-review',
    { bodyLimit: 8 * 1024 },
    async (request, reply) => {
      assertTrustedOrigin(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorize(request, 'assets.edit');
      return response(
        await options.service.submitReview(
          identity,
          parameter(request, 'assetId'),
          parameter(request, 'versionId'),
          request.body as never,
          request.id,
        ),
        request.id,
      );
    },
  );

  app.post(
    '/api/v1/admin/world-assets/:assetId/versions/:versionId/review',
    { bodyLimit: 8 * 1024 },
    async (request, reply) => {
      assertTrustedOrigin(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const action =
        typeof request.body === 'object' && request.body !== null
          ? Reflect.get(request.body, 'action')
          : undefined;
      const identity = await authorize(
        request,
        action === 'approve' ? ['assets.review', 'assets.approve'] : 'assets.review',
      );
      return response(
        await options.service.reviewVersion(
          identity,
          parameter(request, 'assetId'),
          parameter(request, 'versionId'),
          request.body,
          request.id,
        ),
        request.id,
      );
    },
  );

  app.post(
    '/api/v1/admin/world-assets/:assetId/versions/:versionId/activate',
    { bodyLimit: 8 * 1024 },
    async (request, reply) => {
      assertTrustedOrigin(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorize(request, 'assets.activate');
      return response(
        await options.service.activateVersion(
          identity,
          parameter(request, 'assetId'),
          parameter(request, 'versionId'),
          request.body,
          request.id,
        ),
        request.id,
      );
    },
  );

  app.post(
    '/api/v1/admin/world-assets/:assetId/deprecate',
    { bodyLimit: 8 * 1024 },
    async (request, reply) => {
      assertTrustedOrigin(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorize(request, 'assets.deprecate');
      return response(
        await options.service.deprecateAsset(
          identity,
          parameter(request, 'assetId'),
          request.body,
          request.id,
        ),
        request.id,
      );
    },
  );

  app.post(
    '/api/v1/admin/world-assets/:assetId/archive',
    { bodyLimit: 8 * 1024 },
    async (request, reply) => {
      assertTrustedOrigin(request, options.allowedOrigins);
      disableResponseCaching(reply);
      const identity = await authorize(request, 'assets.deprecate');
      return response(
        await options.service.archiveAsset(
          identity,
          parameter(request, 'assetId'),
          request.body,
          request.id,
        ),
        request.id,
      );
    },
  );

  app.get('/api/v1/admin/world-assets/:assetId/references', async (request, reply) => {
    disableResponseCaching(reply);
    const identity = await authorize(request, 'assets.read');
    return response(
      await options.service.listReferences(
        identity,
        parameter(request, 'assetId'),
        request.query,
        request.id,
      ),
      request.id,
    );
  });
}
