import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import process from 'node:process';

import { parse } from 'dotenv';
import { inspectBrowserOutput } from './browser-secret-boundary';

const root = process.cwd();
const allowedReferenceFiles = new Set([
  'AGENTS.md',
  'docs/STARVILLE_MASTER_SPEC.md',
  'scripts/security-scan.ts',
]);
const textExtensions = new Set([
  '',
  '.css',
  '.env',
  '.example',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.sql',
  '.toml',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);

function repositoryFiles(): readonly string[] {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(
      (path) =>
        path.length > 0 && textExtensions.has(extname(path)) && existsSync(join(root, path)),
    );
}

function filesBelow(path: string): readonly string[] {
  if (!existsSync(path)) {
    return [];
  }

  const stat = lstatSync(path);

  if (stat.isFile()) {
    return [path];
  }

  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? filesBelow(child) : entry.isFile() ? [child] : [];
  });
}

function safeLocalSecrets(): Readonly<Record<string, string>> {
  const environmentPath = join(root, '.env.local');

  if (!existsSync(environmentPath)) {
    return {};
  }

  const environment = parse(readFileSync(environmentPath, 'utf8'));
  const sensitiveNames = [
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_DATABASE_URL',
    'SUPABASE_ACCESS_TOKEN',
    'DATABASE_PASSWORD',
    'ADMIN_RECOVERY_COOKIE_SECRET',
    'SOLANA_RPC_URL',
    'TOKEN_ACCESS_COOKIE_SECRET',
    'GAME_TOKEN_MINT_ADDRESS',
    'REALTIME_HEALTH_URL',
    'WORKER_HEALTH_URL',
  ];

  const isSensitiveValue = (name: string, value: string): boolean => {
    if (name !== 'SOLANA_RPC_URL') {
      return value.length >= 8;
    }

    try {
      const url = new URL(value);
      const isPublicDevnetEndpoint =
        url.origin === 'https://api.devnet.solana.com' &&
        (url.pathname === '' || url.pathname === '/') &&
        url.search === '' &&
        url.hash === '';
      return !isPublicDevnetEndpoint;
    } catch {
      return value.length >= 8;
    }
  };

  return Object.fromEntries(
    sensitiveNames.flatMap((name) => {
      const value = environment[name];
      return value === undefined || !isSensitiveValue(name, value) ? [] : [[name, value]];
    }),
  );
}

const sourceFiles = repositoryFiles();
const sourceText = new Map(
  sourceFiles.map((path) => [path, readFileSync(join(root, path), 'utf8')] as const),
);
const failures: string[] = [];

for (const [path, content] of sourceText) {
  if (!allowedReferenceFiles.has(path) && /sol[ -]?tower|legacy[-_ ]project/i.test(content)) {
    failures.push(`forbidden legacy-project reference in ${path}`);
  }

  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) {
    failures.push(`private-key material in ${path}`);
  }

  if (
    /logger\.(?:trace|debug|info|warn|error|fatal)\([^\n]*(?:authorization|accessToken|refreshToken|cookie)/i.test(
      content,
    )
  ) {
    failures.push(`credential-shaped logger argument in ${path}`);
  }
}

const secrets = safeLocalSecrets();

for (const [name, secret] of Object.entries(secrets)) {
  for (const [path, content] of sourceText) {
    if (content.includes(secret)) {
      failures.push(`${name} value appears in tracked/untracked source ${path}`);
    }
  }
}

const browserFiles = [
  ...filesBelow(join(root, 'apps/landing/.next/static')),
  ...filesBelow(join(root, 'apps/admin-portal/.next/static')),
  ...filesBelow(join(root, 'apps/game-client/dist')),
];

for (const path of browserFiles) {
  const content = readFileSync(path);
  failures.push(...inspectBrowserOutput({ content, path, secrets }));
}

if (failures.length > 0) {
  for (const failure of failures) {
    process.stderr.write(`${failure}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${JSON.stringify({
      status: 'ok',
      sourceFilesScanned: sourceFiles.length,
      browserFilesScanned: browserFiles.length,
      localSecretValuesChecked: Object.keys(secrets).length,
    })}\n`,
  );
}
