import { existsSync } from 'node:fs';
import { open, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import {
  GLOBAL_ASSET_DERIVATIVE_MAX_BYTES,
  bundledAssetRuntimePath,
  getBundledAsset,
  type AssetRotation,
  type BundledAssetEntry,
} from '@starville/asset-management';

export type BundledAdminMediaVariant = 'source' | 'thumbnail';

export interface BundledMediaDescriptor {
  readonly asset: BundledAssetEntry;
  readonly variant: BundledAdminMediaVariant;
  readonly rotation: AssetRotation | null;
  readonly manifestPath: string;
  readonly filesystemPath: string;
}

export interface BundledMediaEvidence {
  readonly key: string;
  readonly sourceAvailable: boolean;
  readonly thumbnailAvailable: boolean;
  readonly sourceBytes: number | null;
  readonly thumbnailBytes: number | null;
  readonly sourceValidWebp: boolean;
  readonly thumbnailValidWebp: boolean;
}

function isContained(root: string, target: string): boolean {
  const child = relative(root, target);
  return child !== '' && !child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(child);
}

function manifestPathToFile(workspaceRoot: string, manifestPath: string): string | null {
  if (!manifestPath.startsWith('/') || manifestPath.includes('\\')) return null;
  const normalizedRoot = resolve(workspaceRoot);
  const target = resolve(normalizedRoot, manifestPath.slice(1));
  return isContained(normalizedRoot, target) ? target : null;
}

/**
 * Resolves only manifest-allowlisted media. User input never becomes a filesystem path.
 */
export function resolveBundledMediaDescriptor(input: {
  readonly key: string;
  readonly variant: BundledAdminMediaVariant;
  readonly workspaceRoot: string;
  readonly rotation?: AssetRotation;
}): BundledMediaDescriptor | null {
  const asset = getBundledAsset(input.key);
  if (asset === undefined) return null;
  const manifestPath =
    input.variant === 'thumbnail'
      ? asset.thumbnailPath
      : bundledAssetRuntimePath(asset, {
          ...(input.rotation === undefined ? {} : { rotation: input.rotation }),
        });
  const filesystemPath = manifestPathToFile(input.workspaceRoot, manifestPath);
  if (filesystemPath === null) return null;
  return {
    asset,
    variant: input.variant,
    rotation: input.rotation ?? null,
    manifestPath,
    filesystemPath,
  };
}

export function findStarvilleWorkspaceRoot(start = process.cwd()): string | null {
  let current = resolve(start);
  for (let index = 0; index < 8; index += 1) {
    if (existsSync(resolve(current, 'pnpm-workspace.yaml'))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}

async function isWebp(path: string): Promise<boolean> {
  let handle;
  try {
    handle = await open(path, 'r');
    const signature = Buffer.alloc(12);
    const result = await handle.read(signature, 0, signature.length, 0);
    return (
      result.bytesRead === signature.length &&
      signature.subarray(0, 4).toString('ascii') === 'RIFF' &&
      signature.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  } catch {
    return false;
  } finally {
    await handle?.close();
  }
}

async function safeFileEvidence(
  workspaceRoot: string,
  descriptor: BundledMediaDescriptor | null,
): Promise<Readonly<{ available: boolean; bytes: number | null; validWebp: boolean }>> {
  if (descriptor === null) return { available: false, bytes: null, validWebp: false };
  try {
    const [realRoot, realFile] = await Promise.all([
      realpath(workspaceRoot),
      realpath(descriptor.filesystemPath),
    ]);
    if (!isContained(realRoot, realFile))
      return { available: false, bytes: null, validWebp: false };
    const file = await stat(realFile);
    if (!file.isFile() || file.size < 12 || file.size > GLOBAL_ASSET_DERIVATIVE_MAX_BYTES) {
      return { available: false, bytes: file.isFile() ? file.size : null, validWebp: false };
    }
    const validWebp = await isWebp(realFile);
    return { available: validWebp, bytes: file.size, validWebp };
  } catch {
    return { available: false, bytes: null, validWebp: false };
  }
}

export async function inspectBundledMediaFiles(
  workspaceRoot: string,
  assets: readonly BundledAssetEntry[],
): Promise<readonly BundledMediaEvidence[]> {
  return Promise.all(
    assets.map(async (asset) => {
      const [source, thumbnail] = await Promise.all([
        safeFileEvidence(
          workspaceRoot,
          resolveBundledMediaDescriptor({ key: asset.key, variant: 'source', workspaceRoot }),
        ),
        safeFileEvidence(
          workspaceRoot,
          resolveBundledMediaDescriptor({ key: asset.key, variant: 'thumbnail', workspaceRoot }),
        ),
      ]);
      return {
        key: asset.key,
        sourceAvailable: source.available,
        thumbnailAvailable: thumbnail.available,
        sourceBytes: source.bytes,
        thumbnailBytes: thumbnail.bytes,
        sourceValidWebp: source.validWebp,
        thumbnailValidWebp: thumbnail.validWebp,
      };
    }),
  );
}

/** Returns local, allowlisted runtime-byte evidence without exposing a filesystem path. */
export async function bundledRuntimeSize(assetKey: string): Promise<number | null> {
  const workspaceRoot = findStarvilleWorkspaceRoot();
  const asset = getBundledAsset(assetKey);
  if (workspaceRoot === null || asset === undefined) return null;
  const [evidence] = await inspectBundledMediaFiles(workspaceRoot, [asset]);
  return evidence?.sourceAvailable === true ? evidence.sourceBytes : null;
}

export async function readBundledMedia(
  descriptor: BundledMediaDescriptor,
  workspaceRoot: string,
): Promise<Buffer | null> {
  const evidence = await safeFileEvidence(workspaceRoot, descriptor);
  if (!evidence.available || evidence.bytes === null) return null;
  let handle;
  try {
    const [realRoot, realFile] = await Promise.all([
      realpath(workspaceRoot),
      realpath(descriptor.filesystemPath),
    ]);
    if (!isContained(realRoot, realFile)) return null;
    handle = await open(realFile, 'r');
    const bytes = Buffer.alloc(evidence.bytes);
    const result = await handle.read(bytes, 0, bytes.length, 0);
    return result.bytesRead === bytes.length ? bytes : null;
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
}
