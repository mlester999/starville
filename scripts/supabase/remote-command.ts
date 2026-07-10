import { spawn } from 'node:child_process';
import process from 'node:process';

import { assertRemoteMigrationWriteApproved } from '@starville/config/server';

import { safeHostedTargetSummary, verifyCanonicalHostedTarget } from './safety';

type Operation = 'verify' | 'list' | 'dry-run' | 'push' | 'lint';

const requestedOperation = process.argv[2] as Operation | undefined;
const supportedOperations: readonly Operation[] = ['verify', 'list', 'dry-run', 'push', 'lint'];

if (requestedOperation === undefined || !supportedOperations.includes(requestedOperation)) {
  throw new Error(`Expected one of: ${supportedOperations.join(', ')}`);
}

const operation: Operation = requestedOperation;

const argumentsByOperation: Readonly<Record<Exclude<Operation, 'verify'>, readonly string[]>> = {
  list: ['--workdir', 'infrastructure', 'migration', 'list', '--linked'],
  'dry-run': ['--workdir', 'infrastructure', 'db', 'push', '--linked', '--dry-run'],
  push: ['--workdir', 'infrastructure', 'db', 'push', '--linked'],
  lint: [
    '--workdir',
    'infrastructure',
    'db',
    'lint',
    '--linked',
    '--schema',
    'public,private',
    '--level',
    'warning',
    '--fail-on',
    'warning',
  ],
};

async function main(): Promise<void> {
  const config = await verifyCanonicalHostedTarget(process.env);
  process.stdout.write(`${JSON.stringify(safeHostedTargetSummary(config))}\n`);

  if (operation === 'verify') {
    return;
  }

  if (operation === 'push' && !config.remoteWritesApproved) {
    assertRemoteMigrationWriteApproved(config);
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn('pnpm', ['exec', 'supabase', ...argumentsByOperation[operation]], {
      env: process.env,
      stdio: 'inherit',
    });

    child.once('error', (error) => {
      reject(new Error(`Unable to start Supabase CLI: ${error.message}`));
    });

    child.once('exit', (code, signal) => {
      if (signal === null && code === 0) {
        resolve();
      } else {
        reject(new Error('Supabase CLI operation failed'));
      }
    });
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Supabase operation failed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
