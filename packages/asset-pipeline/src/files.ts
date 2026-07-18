import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';

import { format } from 'prettier';

export type WriteResult = Readonly<{ path: string; changed: boolean; bytes: number }>;

export function resolveAssetFilesystemPath(workspaceRoot: string, manifestPath: string): string {
  const relativePath = manifestPath.startsWith('/') ? manifestPath.slice(1) : manifestPath;
  const normalized = path.normalize(relativePath);
  const resolved = path.resolve(workspaceRoot, normalized);
  const assetRoot = path.resolve(workspaceRoot, 'assets');
  if (resolved !== assetRoot && !resolved.startsWith(`${assetRoot}${path.sep}`)) {
    throw new Error(`Asset path escapes the managed root: ${manifestPath}`);
  }
  if (/(?:^|[/\\])(?:uploads?|asset-intake|game-assets)(?:[/\\]|$)/u.test(normalized)) {
    throw new Error(`Bundled output cannot target an uploaded-asset path: ${manifestPath}`);
  }
  return resolved;
}

export async function writeFileIfChanged(
  filePath: string,
  content: string | Uint8Array,
): Promise<WriteResult> {
  const next = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content);
  let previous: Buffer | undefined;
  try {
    previous = await readFile(filePath);
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }
  if (previous?.equals(next) === true) {
    return { path: filePath, changed: false, bytes: next.byteLength };
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, next);
  return { path: filePath, changed: true, bytes: next.byteLength };
}

export function sha256(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

export async function formattedJson(value: unknown): Promise<string> {
  return format(stableJson(value), {
    parser: 'json',
    printWidth: 100,
    endOfLine: 'lf',
  });
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortJson(child)]),
    );
  }
  return value;
}

export async function listFilesRecursively(root: string): Promise<readonly string[]> {
  let entries: Dirent<string>[];
  try {
    entries = await readdir(root, { withFileTypes: true, encoding: 'utf8' });
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
  const files = await Promise.all(
    entries
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(async (entry) => {
        const child = path.join(root, entry.name);
        return entry.isDirectory() ? listFilesRecursively(child) : [child];
      }),
  );
  return files.flat();
}

export async function fileSize(filePath: string): Promise<number | undefined> {
  try {
    return (await stat(filePath)).size;
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    throw error;
  }
}

export function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
