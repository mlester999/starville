import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse } from 'dotenv';

const root = resolve(import.meta.dirname, '..');
const path = resolve(root, '.env.local');

if (!existsSync(path)) {
  throw new Error('.env.local is required before preparing Phase 3 environment values');
}

let source = readFileSync(path, 'utf8');
const environment = parse(source);
const changes: string[] = [];
const closeMaintenance = process.argv.includes('--close-maintenance');

function setValue(name: string, value: string): void {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, 'mu');
  source = pattern.test(source) ? source.replace(pattern, line) : `${source.trimEnd()}\n${line}\n`;
  changes.push(name);
}

const publicReownProjectId = environment['NEXT_PUBLIC_REOWN_PROJECT_ID'];
const legacyReownProjectId = environment['REOWN_PROJECT_ID'];

if (
  (publicReownProjectId === undefined || publicReownProjectId.trim().length < 8) &&
  legacyReownProjectId !== undefined &&
  legacyReownProjectId.trim().length >= 8
) {
  setValue('NEXT_PUBLIC_REOWN_PROJECT_ID', legacyReownProjectId.trim());
}

const currentCookieSecret = environment['TOKEN_ACCESS_COOKIE_SECRET'];

if (currentCookieSecret === undefined || currentCookieSecret.length < 32) {
  setValue('TOKEN_ACCESS_COOKIE_SECRET', randomBytes(48).toString('base64url'));
}

if (closeMaintenance) {
  setValue('SUPABASE_REMOTE_WRITES_APPROVED', 'false');
  setValue('RUN_HOSTED_SUPABASE_TESTS', 'false');
  setValue('ADMIN_BOOTSTRAP_ENABLED', 'false');
}

if (changes.length > 0) {
  writeFileSync(path, source, { encoding: 'utf8', mode: 0o600 });
}

process.stdout.write(
  `${JSON.stringify({ status: 'ok', updated: changes, secretValuesPrinted: false })}\n`,
);
