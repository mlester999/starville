import type { AssetReferenceDirectory, WorldAssetDetail, WorldAssetVersion } from './contracts';

const CANDIDATE_LIFECYCLES = new Set([
  'draft',
  'processing',
  'validation_failed',
  'validated',
  'in_review',
  'changes_requested',
  'rejected',
  'approved',
]);

export function activeAssetVersion(detail: WorldAssetDetail): WorldAssetVersion | null {
  if (detail.asset.activeVersionId === null) return null;
  return detail.versions.find(({ id }) => id === detail.asset.activeVersionId) ?? null;
}

export function latestAssetCandidate(detail: WorldAssetDetail): WorldAssetVersion | null {
  return (
    detail.versions.find(
      (version) =>
        version.id !== detail.asset.activeVersionId &&
        CANDIDATE_LIFECYCLES.has(version.lifecycleStatus),
    ) ?? null
  );
}

export function assetArtworkLabel(
  version: WorldAssetVersion,
): 'Development Marker' | 'Managed PNG' | 'Managed WebP' | 'Managed Artwork' {
  if (version.detectedMediaType === 'image/png') return 'Managed PNG';
  if (version.detectedMediaType === 'image/webp') return 'Managed WebP';
  if (version.sourceUrl === null && version.previewUrl === null && version.thumbnailUrl === null) {
    return 'Development Marker';
  }
  return 'Managed Artwork';
}

export function versionUsage(
  versionId: string,
  references: AssetReferenceDirectory,
): Readonly<{ published: number; drafts: number; activeConfiguration: number; complete: boolean }> {
  const matching = references.items.filter((reference) => reference.versionId === versionId);
  return {
    published: matching.filter(({ lifecycle }) => lifecycle === 'published').length,
    drafts: matching.filter(({ lifecycle }) => lifecycle === 'draft').length,
    activeConfiguration: matching.filter(({ lifecycle }) => lifecycle === 'active').length,
    complete: references.items.length === references.total,
  };
}

export function candidateNextAction(version: WorldAssetVersion | null): string {
  if (version === null) {
    return 'Create a new draft version when replacement artwork is required.';
  }
  if (version.lifecycleStatus === 'in_review') {
    return `Complete approval or rejection. The current active version remains unchanged.`;
  }
  if (version.lifecycleStatus === 'approved') {
    return 'Review activation requirements. Approval alone does not change the active version.';
  }
  if (version.lifecycleStatus === 'active') {
    return 'Test the new active version in a world draft before publishing.';
  }
  return `Continue Version ${String(version.versionNumber)} through validation and review.`;
}

export function safeAdministratorLabel(input: {
  readonly actorId: string | null;
  readonly currentAdministratorId: string;
  readonly currentAdministratorName: string;
  readonly emptyLabel: string;
}): string {
  if (input.actorId === null) return input.emptyLabel;
  if (input.actorId === input.currentAdministratorId) {
    return `${input.currentAdministratorName} (you)`;
  }
  return 'Another authorized administrator';
}

export function shouldAcceptAuthoritativeVersionRevision(input: {
  readonly currentVersionId: string;
  readonly incomingVersionId: string;
  readonly currentRevision: number;
  readonly incomingRevision: number;
}): boolean {
  return (
    input.currentVersionId !== input.incomingVersionId ||
    input.currentRevision !== input.incomingRevision
  );
}
