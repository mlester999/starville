import { pathToFileURL } from 'node:url';

import {
  STARVILLE_BUNDLED_ASSET_MANIFEST,
  STARVILLE_PHASE12D_CANDIDATE_ASSET_MANIFEST,
  STARVILLE_PRODUCTION_SLICE_ASSET_MANIFEST,
  type BundledAssetManifest,
} from '@starville/asset-management';

import {
  generateAll,
  generateCoverageOutputs,
  generateManifestOutput,
  generateThumbnails,
} from './pipeline';
import { preparePhase12FSourceArt, validatePhase12FAvatar } from './phase12f-source-art';
import { validateBundledAssets } from './validation';
import { findStarvilleWorkspaceRoot } from './workspace';

const COMMANDS = [
  'generate',
  'validate',
  'manifest',
  'thumbnails',
  'coverage',
  'check',
  'generate-phase12d',
  'validate-phase12d',
  'check-phase12d',
  'generate-phase12f',
  'validate-phase12f',
  'check-phase12f',
  'manifest-phase12d',
  'manifest-phase12f',
  'thumbnails-phase12d',
  'thumbnails-phase12f',
  'coverage-phase12d',
  'coverage-phase12f',
] as const;
type Command = (typeof COMMANDS)[number];

export async function runAssetPipelineCli(
  arguments_: readonly string[],
  startDirectory = process.cwd(),
  manifest?: BundledAssetManifest,
): Promise<number> {
  const command = arguments_[0];
  if (!isCommand(command)) {
    console.error(`Usage: asset-pipeline <${COMMANDS.join('|')}>`);
    return 2;
  }
  const workspaceRoot = await findStarvilleWorkspaceRoot(startDirectory);
  const selectedManifest = manifest ?? manifestForCommand(command);
  if (command === 'validate' || command === 'check') {
    return printValidation(workspaceRoot, selectedManifest);
  }
  if (
    command === 'validate-phase12d' ||
    command === 'check-phase12d' ||
    command === 'validate-phase12f' ||
    command === 'check-phase12f'
  ) {
    if (command.endsWith('-phase12f')) {
      const avatarIssues = await validatePhase12FAvatar(workspaceRoot);
      for (const issue of avatarIssues) console.error(`AVATAR_ATLAS ${issue}`);
      if (avatarIssues.length > 0) return 1;
    }
    return printValidation(workspaceRoot, selectedManifest);
  }
  if (command === 'manifest' || command.startsWith('manifest-')) {
    printGeneration('manifest', await generateManifestOutput(workspaceRoot, selectedManifest));
    return 0;
  }
  if (command === 'thumbnails' || command.startsWith('thumbnails-')) {
    printGeneration('thumbnails', await generateThumbnails(workspaceRoot, selectedManifest));
    return 0;
  }
  if (command === 'coverage' || command.startsWith('coverage-')) {
    printGeneration('coverage', await generateCoverageOutputs(workspaceRoot, selectedManifest));
    return 0;
  }
  if (command === 'generate-phase12f') await preparePhase12FSourceArt(workspaceRoot);
  const result = await generateAll(workspaceRoot, selectedManifest);
  printGeneration(command, result);
  return 0;
}

function manifestForCommand(command: Command): BundledAssetManifest {
  if (command.endsWith('-phase12f')) return STARVILLE_PRODUCTION_SLICE_ASSET_MANIFEST;
  if (command.endsWith('-phase12d')) return STARVILLE_PHASE12D_CANDIDATE_ASSET_MANIFEST;
  return STARVILLE_BUNDLED_ASSET_MANIFEST;
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
  command: string,
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
