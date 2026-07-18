import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { isMissingFileError } from './files';

export async function findStarvilleWorkspaceRoot(startDirectory: string): Promise<string> {
  let candidate = path.resolve(startDirectory);
  for (;;) {
    const packagePath = path.join(candidate, 'package.json');
    try {
      const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as { name?: unknown };
      if (packageJson.name === 'starville') return candidate;
    } catch (error) {
      if (!isMissingFileError(error) && error instanceof SyntaxError) throw error;
    }
    const parent = path.dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }
  throw new Error(`Could not find the Starville workspace above ${startDirectory}`);
}
