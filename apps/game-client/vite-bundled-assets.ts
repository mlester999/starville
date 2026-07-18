import { existsSync, realpathSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  STARVILLE_BUNDLED_ASSETS,
  STARVILLE_BUNDLED_MANIFEST_VERSION,
} from '../../packages/asset-management/src/bundled-assets';
import type { Plugin } from 'vite';

const BUNDLED_URL_PREFIX = '/assets/starville/bundled/v1/';
const bundledRootCandidates = [
  path.resolve(process.cwd(), 'assets/starville/bundled/v1'),
  path.resolve(process.cwd(), '../../assets/starville/bundled/v1'),
];
const bundledRootCandidate = bundledRootCandidates.find((candidate) => existsSync(candidate));
if (bundledRootCandidate === undefined) {
  throw new Error('Starville bundled runtime directory is missing. Run pnpm assets:generate.');
}
const bundledRoot = realpathSync(bundledRootCandidate);

function relativeBundledPath(manifestPath: string): string {
  if (!manifestPath.startsWith(BUNDLED_URL_PREFIX) || !manifestPath.endsWith('.webp')) {
    throw new Error(`Invalid bundled runtime manifest path: ${manifestPath}`);
  }
  return manifestPath.slice(BUNDLED_URL_PREFIX.length);
}

const allowlistedManifestPaths = new Set(
  STARVILLE_BUNDLED_ASSETS.flatMap((asset) => [
    asset.runtimePath,
    asset.thumbnailPath,
    ...asset.variants.map((variant) => variant.runtimePath),
  ]),
);
const allowlistedRelativePaths = [...allowlistedManifestPaths].map(relativeBundledPath).sort();

/**
 * Resolves both paths through the filesystem so an allowlisted path cannot be
 * replaced with a symlink that escapes the checked-in runtime directory.
 */
export function realFileInsideBundledRoot(candidate: string, root: string): string | null {
  try {
    const canonicalRoot = realpathSync(root);
    const canonicalCandidate = realpathSync(candidate);
    if (
      !canonicalCandidate.startsWith(`${canonicalRoot}${path.sep}`) ||
      !statSync(canonicalCandidate).isFile()
    ) {
      return null;
    }
    return canonicalCandidate;
  } catch {
    return null;
  }
}

function parsedAllowlistedRequest(requestUrl: string): URL | null {
  let request: URL;
  try {
    request = new URL(requestUrl, 'http://starville.local');
  } catch {
    return null;
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(request.pathname);
  } catch {
    return null;
  }
  if (!allowlistedManifestPaths.has(pathname)) return null;
  const parameters = [...request.searchParams.entries()];
  if (
    parameters.length !== 1 ||
    parameters[0]?.[0] !== 'manifest' ||
    parameters[0]?.[1] !== STARVILLE_BUNDLED_MANIFEST_VERSION
  ) {
    return null;
  }
  return request;
}

export function bundledAssetFileForRequest(requestUrl: string): string | null {
  const request = parsedAllowlistedRequest(requestUrl);
  if (request === null) return null;
  const relative = request.pathname.slice(BUNDLED_URL_PREFIX.length);
  return realFileInsideBundledRoot(path.resolve(bundledRoot, relative), bundledRoot);
}

export function isBundledAssetRoute(requestUrl: string): boolean {
  return requestUrl.split('?', 1)[0]?.startsWith(BUNDLED_URL_PREFIX) === true;
}

function bundledBuildFiles(): readonly Readonly<{ file: string; relative: string }>[] {
  return allowlistedRelativePaths.map((relative) => {
    const file = realFileInsideBundledRoot(path.resolve(bundledRoot, relative), bundledRoot);
    if (file === null) {
      throw new Error(`Bundled manifest file is missing or escapes its runtime root: ${relative}`);
    }
    return { file, relative };
  });
}

/** Mounts and emits only checked-in WebPs named by the bundled manifest. */
export function starvilleBundledAssetsPlugin(): Plugin[] {
  return [
    {
      name: 'starville-bundled-assets-serve',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const file = bundledAssetFileForRequest(request.url ?? '');
          if (file === null) {
            if (isBundledAssetRoute(request.url ?? '')) {
              response.statusCode = 404;
              response.setHeader('Cache-Control', 'no-store');
              response.end('Bundled asset not found');
              return;
            }
            next();
            return;
          }
          void readFile(file)
            .then((content) => {
              response.statusCode = 200;
              response.setHeader('Content-Type', 'image/webp');
              response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
              response.end(content);
            })
            .catch(() => {
              response.statusCode = 404;
              response.setHeader('Cache-Control', 'no-store');
              response.end('Bundled asset not found');
            });
        });
      },
    },
    {
      name: 'starville-bundled-assets-build',
      apply: 'build',
      async buildStart() {
        for (const { file, relative } of bundledBuildFiles()) {
          this.emitFile({
            type: 'asset',
            fileName: `assets/starville/bundled/v1/${relative}`,
            source: await readFile(file),
          });
        }
      },
    },
  ];
}
