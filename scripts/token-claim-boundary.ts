const TOKEN_CLAIM_PACKAGE_SOURCE = 'packages/token-claim-architecture/src/';
const APPLICATION_SOURCE =
  /^apps\/(?:admin-portal|api|game-client|landing|realtime-server|worker)\/src\//u;
const TEST_FILE = /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const NONFUNCTIONAL_TEST_FIXTURE_MARKER = 'PHASE9BA_NONFUNCTIONAL_SECURITY_FIXTURE';
const REVIEWED_NONFUNCTIONAL_TEST_FIXTURES = new Set([
  'apps/admin-portal/src/components/economy-admin.test.tsx',
  'apps/admin-portal/src/components/token-claim-architecture-dashboard.test.tsx',
  'apps/landing/src/content/docs/docs.test.tsx',
  'packages/token-claim-architecture/test/contracts.test.ts',
  'packages/token-claim-architecture/test/providers-planner.test.ts',
  'scripts/phase9ba-architecture-documentation.test.ts',
  'scripts/phase10b-documentation.test.ts',
  'scripts/token-claim-boundary.test.ts',
]);
const TOKEN_CLAIM_MARKER =
  /(?:token[-_ ]?(?:claim|payout)|claim[-_ ]?(?:authorization|signer|treasury))/iu;
const SECRET_BOUNDARY_SOURCE =
  /^(?:(?:apps|packages|scripts)\/|\.env(?:\.|$)|package\.json$|turbo\.json$)/u;

const PACKAGE_FORBIDDEN_PATTERNS = [
  {
    label: 'private-key or seed-phrase input',
    pattern:
      /(?:["'`]\s*)?\b(?:privateKey|private_key|PrivateKey|seedPhrase|seed_phrase|mnemonic)\b(?:\s*["'`])?\s*\??\s*[:=]/u,
  },
  {
    label: 'secret-key input or array',
    pattern:
      /\b(?:secretKey|secret_key|SecretKey)\b|(?:private|secret)[^\n]{0,40}Uint8Array|\bUint8Array\s*\(\s*\[/u,
  },
  {
    label: 'Solana keypair construction',
    pattern:
      /\b(?:Keypair|fromSecretKey|generateKeypair|generateKeyPair|createKeyPairSignerFromBytes|createKeyPairFromBytes)\b|@solana\/web3\.js/u,
  },
  {
    label: 'filesystem key loading',
    pattern: /\b(?:readFile|readFileSync|createReadStream)\b|["'](?:node:)?fs(?:\/promises)?["']/u,
  },
  {
    label: 'environment secret loading',
    pattern:
      /\bprocess\.env\b|\bprocess\s*\[\s*["']env["']\s*\]|\bimport\.meta\.env\b|\b(?:Bun|Deno)\.env\b/u,
  },
  {
    label: 'network or RPC access',
    pattern:
      /\bfetch\b|\bXMLHttpRequest\b|\bWebSocket\b|\bnew\s+Connection\b|\bConnection\s*\(|\bhttps?\.request\b|["'](?:node:)?(?:http|https|net|tls)["']/u,
  },
  {
    label: 'live blockhash retrieval',
    pattern: /\b(?:getLatestBlockhash|getRecentBlockhash)\b/u,
  },
  {
    label: 'wallet or RPC transaction operation',
    pattern: /\b(?:sendTransaction|signTransaction|signAllTransactions|sendRawTransaction)\b/u,
  },
  {
    label: 'broadcast-ready transaction construction',
    pattern:
      /\b(?:VersionedTransaction|TransactionMessage)\b|\bTransaction\b\s*(?:\.|\(|<)|\.serialize\b|\bserialize\s*\(/u,
  },
  {
    label: 'production signer provider',
    pattern:
      /\bSignerProvider\b|\b(?!(?:DisabledSignerProvider|MockSignerProvider)\b)[A-Za-z_$][\w$]*SignerProvider\b|\b(?:production|live|remote|kms|hsm|treasury|environment|filesystem|browser)[A-Za-z0-9_$]*Signer\b/iu,
  },
] as const;

const TREASURY_SECRET_IDENTIFIER =
  /\b(?:(?:TREASURY|SOLANA|(?:TOKEN_)?(?:CLAIM|PAYOUT)(?:_(?:AUTHORIZATION(?:_SIGNER)?|TREASURY|SIGNER))?)_(?:PRIVATE_KEY|SECRET(?:_KEY)?|SEED(?:_PHRASE)?|MNEMONIC|KEYPAIR))\b/iu;
const ACTIVE_PLAYER_ACTION_LITERAL =
  /\b(?:label|buttonText|cta|callToAction|title)\s*[:=]\s*["'`]\s*(?:Claim Now|Earn STAR|Cash Out|Withdraw|Withdrawal|Token Payout|Approve Token|Approve STAR|Connect to Receive Rewards)\s*["'`]/iu;
const ACTIVE_PLAYER_ACTION_LABEL =
  /^(?:claim(?: now| tokens?| STAR| rewards?)?|earn STAR|cash out|withdraw(?:al)?(?: tokens?)?|token payout|approve (?:token|STAR)|connect to receive rewards)$/iu;

function activePlayerControlLabels(content: string): readonly string[] {
  const labels: string[] = [];
  const controlPattern = /<(button|a|link)\b[^>]*>([\s\S]*?)<\/\1>/giu;
  for (const match of content.matchAll(controlPattern)) {
    const text = (match[2] ?? '')
      .replace(/<[^>]*>/gu, ' ')
      .replace(/\{[^}]*\}/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim();
    if (ACTIVE_PLAYER_ACTION_LABEL.test(text)) labels.push(text);
  }
  return labels;
}

export interface TokenClaimSourceScanInput {
  readonly content: string;
  readonly path: string;
}

export function inspectTokenClaimSource({
  content,
  path,
}: TokenClaimSourceScanInput): readonly string[] {
  const normalizedPath = path.replaceAll('\\', '/');
  const failures: string[] = [];
  const isTest = TEST_FILE.test(normalizedPath);
  const isExplicitNonfunctionalTestFixture =
    isTest &&
    REVIEWED_NONFUNCTIONAL_TEST_FIXTURES.has(normalizedPath) &&
    content.includes(NONFUNCTIONAL_TEST_FIXTURE_MARKER);
  const isScannerImplementation =
    normalizedPath === 'scripts/token-claim-boundary.ts' ||
    normalizedPath === 'scripts/security-scan.ts';
  const isTokenClaimPackageSource = normalizedPath.startsWith(TOKEN_CLAIM_PACKAGE_SOURCE);
  const isApplicationSource = APPLICATION_SOURCE.test(normalizedPath);
  const isTokenClaimProductionSource =
    isTokenClaimPackageSource ||
    (!isScannerImplementation &&
      ((isApplicationSource &&
        (TOKEN_CLAIM_MARKER.test(normalizedPath) || TOKEN_CLAIM_MARKER.test(content))) ||
        (/^(?:packages|scripts)\//u.test(normalizedPath) &&
          (TOKEN_CLAIM_MARKER.test(normalizedPath) || TOKEN_CLAIM_MARKER.test(content)))));

  if (isExplicitNonfunctionalTestFixture) return failures;

  if (isTokenClaimProductionSource) {
    for (const { label, pattern } of PACKAGE_FORBIDDEN_PATTERNS) {
      if (pattern.test(content)) {
        failures.push(`${label} in disabled token-claim production source ${normalizedPath}`);
      }
    }
  }

  if (
    !isScannerImplementation &&
    SECRET_BOUNDARY_SOURCE.test(normalizedPath) &&
    TREASURY_SECRET_IDENTIFIER.test(content)
  ) {
    failures.push(`treasury-secret environment identifier in ${normalizedPath}`);
  }

  if (
    isApplicationSource &&
    (ACTIVE_PLAYER_ACTION_LITERAL.test(content) || activePlayerControlLabels(content).length > 0)
  ) {
    failures.push(`active token-claim call to action in ${normalizedPath}`);
  }

  if (
    normalizedPath.startsWith('apps/api/src/') &&
    (TOKEN_CLAIM_MARKER.test(normalizedPath) ||
      /(?:token[-_ /]?(?:claims?|payouts?)|\/api(?:\/v\d+)?\/claims?\b)/iu.test(content)) &&
    /(?:\.(?:post|put|patch|delete|mutation)\s*\(|\b(?:export\s+)?(?:async\s+)?function\s+(?:POST|PUT|PATCH|DELETE)\s*\(|\b(?:POST|PUT|PATCH|DELETE)\s*[:=]\s*(?:async\s*)?(?:\([^)]*\)\s*=>|function\b)|\bmethod\s*:\s*(?:["'](?:POST|PUT|PATCH|DELETE)["']|\[[^\]]*["'](?:POST|PUT|PATCH|DELETE)["'][^\]]*\]))/u.test(
      content,
    )
  ) {
    failures.push(`live token-claim mutation route in ${normalizedPath}`);
  }

  return failures;
}
