import { getPhase7LocalDraft } from '@starville/game-content';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isAssetScenePreviewRequestAuthorized } from '../../../../../../../../lib/world-assets/authorization';
import {
  loadPublishedWorldTopology,
  loadWorldDetail,
  loadWorldPreview,
} from '../../../../../../../../lib/worlds/api';
import { GET } from './route';

vi.mock('../../../../../../../../lib/world-assets/authorization', () => ({
  isAssetScenePreviewRequestAuthorized: vi.fn(),
}));
vi.mock('../../../../../../../../lib/worlds/api', () => ({
  loadPublishedWorldTopology: vi.fn(),
  loadWorldDetail: vi.fn(),
  loadWorldPreview: vi.fn(),
}));

const mapId = '11111111-1111-4111-8111-111111111111';
const publishedVersionId = '22222222-2222-4222-8222-222222222222';
const draftVersionId = '33333333-3333-4333-8333-333333333333';
const timestamp = '2026-07-16T00:00:00.000Z';
const manifest = getPhase7LocalDraft('lantern-square').manifest;

const map = {
  id: mapId,
  slug: 'lantern-square',
  displayName: 'Lantern Square',
  description: 'Read-only preview context.',
  status: 'active' as const,
  recordVersion: 4,
  activePublishedVersionId: publishedVersionId,
  createdAt: timestamp,
  updatedAt: timestamp,
};

function version(id: string, lifecycleStatus: 'published' | 'validated', versionNumber: number) {
  return {
    id,
    worldMapId: mapId,
    versionNumber,
    lifecycleStatus,
    editVersion: 3,
    checksum: 'a'.repeat(64),
    validationStatus: 'valid' as const,
    validationResult: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    validatedAt: timestamp,
    publishedAt: lifecycleStatus === 'published' ? timestamp : null,
    publicationReason: lifecycleStatus === 'published' ? 'Reviewed fixture publication.' : null,
    supersedesVersionId: null,
    derivedFromVersionId: null,
  };
}

function request(source: 'published' | 'draft', id: string): Request {
  return new Request(
    `http://localhost/api/world-assets/scene-preview/worlds/${mapId}/versions/${id}?source=${source}`,
  );
}

function context(id: string) {
  return { params: Promise.resolve({ mapId, versionId: id }) };
}

describe('read-only World Asset scene-preview route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(isAssetScenePreviewRequestAuthorized).mockResolvedValue(true);
  });

  it('returns only the selected active published snapshot behind maps.read', async () => {
    vi.mocked(loadPublishedWorldTopology).mockResolvedValue({
      status: 'loaded',
      maps: [
        {
          id: mapId,
          slug: 'lantern-square',
          displayName: 'Lantern Square',
          mapStatus: 'active',
          versionId: publishedVersionId,
          versionNumber: 1,
          manifest,
        },
      ],
    });
    vi.mocked(loadWorldDetail).mockResolvedValue({
      status: 'loaded',
      map,
      versions: [version(publishedVersionId, 'published', 1)],
      draftHeadVersionId: null,
      revisionMetadata: [],
      publicationHistory: [],
    });

    const response = await GET(
      request('published', publishedVersionId),
      context(publishedVersionId),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(await response.json()).toMatchObject({
      status: 'loaded',
      source: 'published',
      readOnly: true,
      map: { id: mapId },
      version: { id: publishedVersionId, lifecycleStatus: 'published' },
      manifest: { id: 'lantern-square' },
    });
    expect(isAssetScenePreviewRequestAuthorized).toHaveBeenCalledWith('maps.read');
    expect(loadWorldPreview).not.toHaveBeenCalled();
  });

  it('returns a server-validated draft projection only behind maps.preview', async () => {
    vi.mocked(loadWorldPreview).mockResolvedValue({
      status: 'loaded',
      map,
      version: version(draftVersionId, 'validated', 2),
      manifest,
      draftPreview: true,
    });
    const response = await GET(request('draft', draftVersionId), context(draftVersionId));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      source: 'draft',
      readOnly: true,
      version: { id: draftVersionId, lifecycleStatus: 'validated' },
    });
    expect(isAssetScenePreviewRequestAuthorized).toHaveBeenCalledWith('maps.preview');
    expect(loadPublishedWorldTopology).not.toHaveBeenCalled();
  });

  it('fails closed for permission denial, invalid UUIDs, and stale world-version ownership', async () => {
    vi.mocked(isAssetScenePreviewRequestAuthorized).mockResolvedValueOnce(false);
    expect(
      (await GET(request('published', publishedVersionId), context(publishedVersionId))).status,
    ).toBe(403);
    expect(loadPublishedWorldTopology).not.toHaveBeenCalled();

    const invalid = await GET(request('published', publishedVersionId), {
      params: Promise.resolve({ mapId: 'not-a-uuid', versionId: publishedVersionId }),
    });
    expect(invalid.status).toBe(400);

    vi.mocked(isAssetScenePreviewRequestAuthorized).mockResolvedValue(true);
    vi.mocked(loadPublishedWorldTopology).mockResolvedValue({ status: 'loaded', maps: [] });
    vi.mocked(loadWorldDetail).mockResolvedValue({
      status: 'loaded',
      map,
      versions: [version(publishedVersionId, 'published', 1)],
      draftHeadVersionId: null,
      revisionMetadata: [],
      publicationHistory: [],
    });
    const stale = await GET(request('published', publishedVersionId), context(publishedVersionId));
    expect(stale.status).toBe(404);
    expect(JSON.stringify(await stale.json())).not.toContain('storage');
  });

  it('returns owner-safe missing-world and temporary-unavailable fallbacks', async () => {
    vi.mocked(loadWorldPreview).mockRejectedValueOnce({
      status: 404,
      message: 'private world persistence detail',
    });
    const missing = await GET(request('draft', draftVersionId), context(draftVersionId));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      success: false,
      error: {
        code: 'SCENE_PREVIEW_WORLD_NOT_FOUND',
        message: 'The read-only world preview could not be loaded.',
      },
    });

    vi.mocked(loadWorldPreview).mockRejectedValueOnce(
      new Error('upstream URL and private persistence detail'),
    );
    const unavailable = await GET(request('draft', draftVersionId), context(draftVersionId));
    expect(unavailable.status).toBe(503);
    const body = JSON.stringify(await unavailable.json());
    expect(body).toContain('SCENE_PREVIEW_UNAVAILABLE');
    expect(body).not.toContain('upstream URL');
    expect(body).not.toContain('persistence');
  });
});
