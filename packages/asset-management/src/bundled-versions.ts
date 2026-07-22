import { z } from 'zod';

export const STARVILLE_BUNDLED_MANIFEST_VERSION = '1.0.0' as const;
export const STARVILLE_BUNDLED_PUBLIC_ROOT = '/assets/starville/bundled/v1' as const;
export const STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION = '2.0.0' as const;
export const STARVILLE_PHASE12D_CANDIDATE_PUBLIC_ROOT = '/assets/starville/bundled/v2' as const;
export const STARVILLE_PRODUCTION_SLICE_MANIFEST_VERSION = '3.1.0' as const;
export const STARVILLE_PRODUCTION_SLICE_PUBLIC_ROOT = '/assets/starville/bundled/v3' as const;

export const STARVILLE_BUNDLED_MANIFEST_VERSIONS = [
  STARVILLE_BUNDLED_MANIFEST_VERSION,
  STARVILLE_PHASE12D_CANDIDATE_MANIFEST_VERSION,
  STARVILLE_PRODUCTION_SLICE_MANIFEST_VERSION,
] as const;

export const bundledManifestVersionSchema = z.enum(STARVILLE_BUNDLED_MANIFEST_VERSIONS);
export type BundledManifestVersion = z.infer<typeof bundledManifestVersionSchema>;
