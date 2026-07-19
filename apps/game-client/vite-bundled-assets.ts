import { existsSync, realpathSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  STARVILLE_BUNDLED_ASSETS,
  STARVILLE_BUNDLED_MANIFEST_VERSION,
  STARVILLE_PHASE12D_CANDIDATE_ASSETS,
  STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION,
  type BundledManifestVersion,
} from '../../packages/asset-management/src/bundled-assets';
import type { Plugin } from 'vite';

type BundledRuntime = Readonly<{
  manifestVersion: BundledManifestVersion;
  urlPrefix: string;
  root: string | null;
  manifestPaths: ReadonlySet<string>;
}>;

function runtimeRoot(relative: string): string | null {
  const candidates = [
    path.resolve(process.cwd(), relative),
    path.resolve(process.cwd(), '../../', relative),
  ];
  const candidate = candidates.find((value) => existsSync(value));
  return candidate === undefined ? null : realpathSync(candidate);
}

function manifestPaths(
  assets: typeof STARVILLE_BUNDLED_ASSETS | typeof STARVILLE_PHASE12D_CANDIDATE_ASSETS,
): ReadonlySet<string> {
  return new Set(
    assets.flatMap((asset) => [
      asset.runtimePath,
      asset.thumbnailPath,
      ...asset.variants.map((variant) => variant.runtimePath),
    ]),
  );
}

const BUNDLED_RUNTIMES: readonly BundledRuntime[] = [
  {
    manifestVersion: STARVILLE_BUNDLED_MANIFEST_VERSION,
    urlPrefix: '/assets/starville/bundled/v1/',
    root: runtimeRoot('assets/starville/bundled/v1'),
    manifestPaths: manifestPaths(STARVILLE_BUNDLED_ASSETS),
  },
  {
    manifestVersion: STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION,
    urlPrefix: '/assets/starville/bundled/v2/',
    root: runtimeRoot('assets/starville/bundled/v2'),
    manifestPaths: manifestPaths(STARVILLE_PHASE12D_CANDIDATE_ASSETS),
  },
];

if (BUNDLED_RUNTIMES[0]?.root === null) {
  throw new Error('Starville bundled runtime directory is missing. Run pnpm assets:generate.');
}

function relativeBundledPath(runtime: BundledRuntime, manifestPath: string): string {
  if (!manifestPath.startsWith(runtime.urlPrefix) || !manifestPath.endsWith('.webp')) {
    throw new Error(`Invalid bundled runtime manifest path: ${manifestPath}`);
  }
  return manifestPath.slice(runtime.urlPrefix.length);
}

const runtimeByManifestPath = new Map(
  BUNDLED_RUNTIMES.flatMap((runtime) =>
    [...runtime.manifestPaths].map((manifestPath) => [manifestPath, runtime] as const),
  ),
);

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

function parsedAllowlistedRequest(
  requestUrl: string,
): Readonly<{ request: URL; runtime: BundledRuntime }> | null {
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
  const runtime = runtimeByManifestPath.get(pathname);
  if (runtime === undefined) return null;
  const parameters = [...request.searchParams.entries()];
  if (
    parameters.length !== 1 ||
    parameters[0]?.[0] !== 'manifest' ||
    parameters[0]?.[1] !== runtime.manifestVersion
  ) {
    return null;
  }
  return { request, runtime };
}

export function bundledAssetFileForRequest(requestUrl: string): string | null {
  const parsed = parsedAllowlistedRequest(requestUrl);
  if (parsed === null || parsed.runtime.root === null) return null;
  const relative = parsed.request.pathname.slice(parsed.runtime.urlPrefix.length);
  return realFileInsideBundledRoot(
    path.resolve(parsed.runtime.root, relative),
    parsed.runtime.root,
  );
}

export function isBundledAssetRoute(requestUrl: string): boolean {
  const pathname = requestUrl.split('?', 1)[0] ?? '';
  return BUNDLED_RUNTIMES.some(({ urlPrefix }) => pathname.startsWith(urlPrefix));
}

function bundledBuildFiles(): readonly Readonly<{ file: string; outputPath: string }>[] {
  return BUNDLED_RUNTIMES.flatMap((runtime) => {
    if (runtime.root === null) {
      throw new Error(
        `Starville bundled ${runtime.manifestVersion} runtime directory is missing. Run pnpm assets:generate.`,
      );
    }
    return [...runtime.manifestPaths].sort().map((manifestPath) => {
      const relative = relativeBundledPath(runtime, manifestPath);
      const file = realFileInsideBundledRoot(path.resolve(runtime.root!, relative), runtime.root!);
      if (file === null) {
        throw new Error(
          `Bundled manifest file is missing or escapes its runtime root: ${relative}`,
        );
      }
      return { file, outputPath: manifestPath.slice(1) };
    });
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
        for (const { file, outputPath } of bundledBuildFiles()) {
          this.emitFile({
            type: 'asset',
            fileName: outputPath,
            source: await readFile(file),
          });
        }
      },
    },
  ];
}
