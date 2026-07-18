const RUNTIME_SOURCE = /^(?:apps|packages)\/(?:[^/]+)\/src\//u;
const TEST_FILE = /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const AVATAR_MARKER = /avatar|appearance|sprite[-_ ]?sheet/iu;
const PUBLIC_APPEARANCE_SOURCE =
  /^(?:apps\/realtime-server\/src\/contracts\.ts|packages\/avatar\/src\/contracts\.ts|packages\/realtime\/src\/protocol\.ts)$/u;

const AVATAR_FORBIDDEN_PATTERNS = [
  {
    label: 'raw external asset location field',
    pattern: /\b(?:asset|sprite|appearance|avatar)(?:Url|URL|Uri|URI|Path)\b\s*(?:\??\s*:|=)/u,
  },
  {
    label: 'data URL in avatar or appearance source',
    pattern:
      /(?:\b(?:avatar|appearance|sprite|asset)\b[^\n]{0,120}\bdata:(?:image|application)\/|\bdata:(?:image|application)\/[^\n]{0,120}\b(?:avatar|appearance|sprite|asset)\b)/iu,
  },
  {
    label: 'executable SVG content',
    pattern: /<script\b|<svg\b[^>]*\bon(?:load|error)\s*=/iu,
  },
  {
    label: 'arbitrary JavaScript animation configuration',
    pattern: /\b(?:eval\s*\(|new\s+Function\s*\(|javascript\s*:)/iu,
  },
] as const;

const BROWSER_CONTROLLED_RENDERING =
  /\b(?:body|input|payload|request|message|selection)\s*(?:\.|\[)[^\n]{0,80}\b(?:renderOrder|assetPath|assetUrl|spriteUrl)\b/iu;
const PRIVATE_ASSET_INTAKE = /\b(?:asset[-_ ]?intake|private[-_ ]?upload[-_ ]?(?:path|url))\b/iu;
const PUBLIC_PRIVATE_IDENTITY =
  /\b(?:walletAddress|wallet_address|emailAddress|email_address|privateInventory|tokenHoldings|sessionId)\b/u;
const DIRECT_AVATAR_TABLE_MUTATION =
  /\.from\(\s*["'`]avatar_[a-z0-9_]+["'`]\s*\)\s*\.(?:insert|update|upsert|delete)\s*\(/iu;
const ADMIN_COSMETIC_BYPASS =
  /\b(?:administratorOnly|adminOnly|isAdministratorCosmetic|bypassAvatarAuthorization)\b\s*(?:\??\s*:|=)/u;
const UNSAFE_DYNAMIC_IMPORT = /\bimport\s*\(\s*(?!["'`][^"'`]+["'`]\s*\))[^)]+\)/u;

export interface AvatarSourceScanInput {
  readonly content: string;
  readonly path: string;
}

/**
 * Static guardrail for Phase 10A appearance trust boundaries. Database policy,
 * API validation, CSP, and runtime asset approval remain the primary controls;
 * this scan catches high-signal regressions before those boundaries are reached.
 */
export function inspectAvatarSource({ content, path }: AvatarSourceScanInput): readonly string[] {
  const normalizedPath = path.replaceAll('\\', '/');
  if (
    normalizedPath === 'scripts/avatar-security-boundary.ts' ||
    normalizedPath === 'scripts/security-scan.ts' ||
    TEST_FILE.test(normalizedPath) ||
    !RUNTIME_SOURCE.test(normalizedPath) ||
    !(AVATAR_MARKER.test(normalizedPath) || AVATAR_MARKER.test(content))
  ) {
    return [];
  }

  const failures: string[] = [];
  for (const { label, pattern } of AVATAR_FORBIDDEN_PATTERNS) {
    if (pattern.test(content)) failures.push(`${label} in avatar runtime source ${normalizedPath}`);
  }

  if (
    normalizedPath.startsWith('apps/game-client/src/') &&
    BROWSER_CONTROLLED_RENDERING.test(content)
  ) {
    failures.push(`browser-controlled avatar rendering authority in ${normalizedPath}`);
  }

  if (PUBLIC_APPEARANCE_SOURCE.test(normalizedPath) && PRIVATE_ASSET_INTAKE.test(content)) {
    failures.push(`private asset-intake reference in public appearance source ${normalizedPath}`);
  }

  if (PUBLIC_APPEARANCE_SOURCE.test(normalizedPath) && PUBLIC_PRIVATE_IDENTITY.test(content)) {
    failures.push(`private identity field in public appearance source ${normalizedPath}`);
  }

  if (DIRECT_AVATAR_TABLE_MUTATION.test(content)) {
    failures.push(`direct avatar-table mutation outside trusted RPC in ${normalizedPath}`);
  }

  if (
    (normalizedPath.startsWith('apps/game-client/src/') ||
      normalizedPath.startsWith('packages/avatar/src/contracts')) &&
    ADMIN_COSMETIC_BYPASS.test(content)
  ) {
    failures.push(`administrator cosmetic authority exposed to player source ${normalizedPath}`);
  }

  if (UNSAFE_DYNAMIC_IMPORT.test(content)) {
    failures.push(`unsafe dynamic import in avatar runtime source ${normalizedPath}`);
  }

  return failures;
}
