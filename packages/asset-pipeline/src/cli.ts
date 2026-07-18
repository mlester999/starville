import { pathToFileURL } from 'node:url';

import {
  STARVILLE_BUNDLED_ASSET_MANIFEST,
  type BundledAssetManifest,
} from '@starville/asset-management';

import {
  generateAll,
  generateCoverageOutputs,
  generateManifestOutput,
  generateThumbnails,
} from './pipeline';
import { validateBundledAssets } from './validation';
import { findStarvilleWorkspaceRoot } from './workspace';

const COMMANDS = ['generate', 'validate', 'manifest', 'thumbnails', 'coverage', 'check'] as const;
type Command = (typeof COMMANDS)[number];

export async function runAssetPipelineCli(
  arguments_: readonly string[],
  startDirectory = process.cwd(),
  manifest: BundledAssetManifest = STARVILLE_BUNDLED_ASSET_MANIFEST,
): Promise<number> {
  const command = arguments_[0];
  if (!isCommand(command)) {
    console.error(`Usage: asset-pipeline <${COMMANDS.join('|')}>`);
    return 2;
  }
  const workspaceRoot = await findStarvilleWorkspaceRoot(startDirectory);
  if (command === 'validate' || command === 'check') {
    return printValidation(workspaceRoot, manifest);
  }
  if (command === 'manifest') {
    printGeneration('manifest', await generateManifestOutput(workspaceRoot, manifest));
    return 0;
  }
  if (command === 'thumbnails') {
    printGeneration('thumbnails', await generateThumbnails(workspaceRoot, manifest));
    return 0;
  }
  if (command === 'coverage') {
    printGeneration('coverage', await generateCoverageOutputs(workspaceRoot, manifest));
    return 0;
  }
  const result = await generateAll(workspaceRoot, manifest);
  printGeneration(command, result);
  return 0;
}

function isCommand(value: string | undefined): value is Command {
  return value !== undefined && (COMMANDS as readonly string[]).includes(value);
}

async function printValidation(
  workspaceRoot: string,
  manifest: BundledAssetManifest,
): Promise<number> {
  const report = await validateBundledAssets(workspaceRoot, manifest, {
    enforceGameplayCatalogReferences: manifest === STARVILLE_BUNDLED_ASSET_MANIFEST,
  });
  if (report.valid) {
    console.log(
      `Bundled assets valid: ${String(report.assetCount)} assets, ${String(report.expectedFileCount)} files, ${String(report.totalBytes)} bytes.`,
    );
    return 0;
  }
  for (const issue of report.issues) {
    console.error(`${issue.code} ${issue.path}: ${issue.message}`);
  }
  console.error(`Bundled asset validation failed with ${String(report.issues.length)} issue(s).`);
  return 1;
}

function printGeneration(
  command: Command,
  result: Readonly<{ written: number; unchanged: number; files: number; bytes: number }>,
): void {
  console.log(
    `${command}: ${String(result.files)} outputs, ${String(result.written)} written, ${String(result.unchanged)} unchanged, ${String(result.bytes)} bytes.`,
  );
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  runAssetPipelineCli(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
