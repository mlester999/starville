import { readFile } from 'node:fs/promises';
import process from 'node:process';

import {
  assertDatabaseUrlMatchesProjectRef,
  assertHostedTestsApproved,
  loadPrivateSupabaseConfig,
} from '@starville/config/server';
import postgres from 'postgres';

import { safeHostedTargetSummary, verifyCanonicalHostedTarget } from './safety';
import { extractTapLines, parseTapReport } from './tap-report';

async function main(): Promise<void> {
  const target = await verifyCanonicalHostedTarget(process.env);
  process.stdout.write(`${JSON.stringify(safeHostedTargetSummary(target))}\n`);
  assertHostedTestsApproved(target);

  const privateConfig = loadPrivateSupabaseConfig(process.env);

  if (privateConfig.databaseUrl === undefined) {
    throw new Error('SUPABASE_DATABASE_URL is required for hosted pgTAP tests');
  }

  assertDatabaseUrlMatchesProjectRef(privateConfig.databaseUrl, target.projectRef);

  const testPath = new URL(
    '../../infrastructure/supabase/tests/admin_authorization.test.sql',
    import.meta.url,
  );
  const testSql = await readFile(testPath, 'utf8');

  if (!/^begin;/iu.test(testSql.trim()) || !/rollback;\s*$/iu.test(testSql)) {
    throw new Error('Hosted pgTAP SQL must be enclosed by an explicit transaction and rollback');
  }

  const sql = postgres(privateConfig.databaseUrl, { max: 1, ssl: 'require' });

  try {
    // The SQL source is a reviewed repository file, never user or command-line input.
    const resultSets: unknown = await sql.unsafe(testSql).simple();
    const report = parseTapReport(extractTapLines(resultSets));
    process.stdout.write(`${JSON.stringify({ status: 'ok', ...report })}\n`);
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Hosted pgTAP tests failed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
