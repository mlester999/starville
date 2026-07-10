import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parse } from 'dotenv';
import { selectEnvironmentProfile } from './environment-profiles.mjs';

const rawArguments = process.argv.slice(2);
const explicitEnvironment = {};
let profileName;

while (rawArguments[0] === '--set' || rawArguments[0] === '--profile') {
  const option = rawArguments.shift();

  if (option === '--profile') {
    const value = rawArguments.shift();

    if (value === undefined || value.startsWith('--')) {
      throw new Error('--profile requires a named environment profile');
    }

    if (profileName !== undefined) {
      throw new Error('--profile may be specified only once');
    }

    profileName = value;
    continue;
  }

  const assignment = rawArguments.shift();
  const separator = assignment?.indexOf('=') ?? -1;

  if (assignment === undefined || separator < 1) {
    throw new Error('--set requires an environment assignment such as NODE_ENV=production');
  }

  explicitEnvironment[assignment.slice(0, separator)] = assignment.slice(separator + 1);
}

const [command, ...args] = rawArguments;

if (!command) {
  process.stderr.write(
    'Usage: node scripts/with-env.mjs [--profile NAME] [--set NAME=value] <command> [...args]\n',
  );
  process.exitCode = 1;
} else {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const readEnvironmentFile = (name) => {
    const path = resolve(repositoryRoot, name);
    return existsSync(path) ? parse(readFileSync(path, 'utf8')) : {};
  };

  // Documented values make clean checkouts runnable. Local files override the
  // examples, and explicitly exported shell variables retain highest priority.
  const loadedEnvironment = {
    ...readEnvironmentFile('.env.example'),
    ...readEnvironmentFile('.env'),
    ...readEnvironmentFile('.env.local'),
    ...process.env,
    ...explicitEnvironment,
  };
  const environment =
    profileName === undefined
      ? loadedEnvironment
      : selectEnvironmentProfile(profileName, loadedEnvironment);

  const child = spawn(command, args, {
    env: environment,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => child.kill(signal));
  }

  child.on('error', (error) => {
    process.stderr.write(`Unable to start ${command}: ${error.message}\n`);
    process.exitCode = 1;
  });

  child.on('exit', (code, signal) => {
    process.exitCode = signal ? 1 : (code ?? 1);
  });
}
