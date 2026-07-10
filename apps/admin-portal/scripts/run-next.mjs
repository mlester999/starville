import { spawn } from 'node:child_process';

const command = process.argv[2];

if (command !== 'dev' && command !== 'start') {
  throw new Error("Expected the Next.js command to be either 'dev' or 'start'.");
}

const rawPort = process.env.ADMIN_PORT ?? '3002';
const port = Number(rawPort);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`ADMIN_PORT must be an integer between 1 and 65535; received '${rawPort}'.`);
}

const executable = process.platform === 'win32' ? 'next.cmd' : 'next';
const child = spawn(executable, [command, '--port', String(port)], {
  env: process.env,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => child.kill(signal));
}

child.once('error', (error) => {
  process.stderr.write(`Unable to start the Starville admin portal: ${error.message}\n`);
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 1;
});
