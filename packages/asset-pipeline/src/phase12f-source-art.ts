import path from 'node:path';
import { readFile } from 'node:fs/promises';

import {
  STARVILLE_BUNDLED_ASSET_MANIFEST,
  STARVILLE_PRODUCTION_SLICE_ASSET_MANIFEST,
} from '@starville/asset-management';
import type { FacingDirection } from '@starville/game-core';
import sharp from 'sharp';

import { formattedJson, resolveAssetFilesystemPath, sha256, writeFileIfChanged } from './files';
import { renderBundledAssetSvg } from './svg';

const ENVIRONMENT_SHEET = 'assets/source-v3/sheets/environment.png';
const TERRAIN_SHEET = 'assets/source-v3/sheets/terrain.png';
const WALK_SHEET = 'assets/source-v3/sheets/walk.png';
const JOG_SHEET = 'assets/source-v3/sheets/jog.png';
const TERRAIN_A1_SHEET = 'assets/source-v3/sheets/terrain-a1.png';
const INTERIOR_A1_SHEET = 'assets/source-v3/sheets/interior-a1.png';
const IDLE_REFERENCE =
  'assets/references/phase12d/starville-character-eight-direction-reference.png';

export const PRODUCTION_SLICE_AVATAR_SOURCE =
  'assets/source-v3/avatar/starville-production-adventurer.png';
export const PRODUCTION_SLICE_AVATAR_RUNTIME =
  'assets/starville/avatar/production-slice-v3/starville-production-adventurer.webp';
export const PRODUCTION_SLICE_AVATAR_MANIFEST =
  'assets/manifests/starville-production-slice-avatar-v3.json';
export const PRODUCTION_SLICE_AVATAR_FRAME_WIDTH = 192;
export const PRODUCTION_SLICE_AVATAR_FRAME_HEIGHT = 256;
export const PRODUCTION_SLICE_AVATAR_COLUMNS = 12;
export const PRODUCTION_SLICE_AVATAR_ROWS = 8;

const IDLE_ROOT_LOCK_TOP = 176;
const IDLE_FOOT_ANCHOR_BAND_TOP = 208;
const IDLE_BODY_MOTION = Object.freeze([
  { breathPixels: 0, swayPixels: 0 },
  { breathPixels: 0.65, swayPixels: -0.7 },
  { breathPixels: 1.1, swayPixels: 0 },
  { breathPixels: 0.65, swayPixels: 0.7 },
] as const);

type Crop = Readonly<{ left: number; top: number; width: number; height: number }>;

const ENVIRONMENT_CELLS = Object.freeze([
  ['cottage-amber', { left: 0, top: 0, width: 450, height: 415 }],
  ['notice-board', { left: 430, top: 15, width: 360, height: 390 }],
  ['lamp-star', { left: 815, top: 0, width: 285, height: 410 }],
  ['fence-willow', { left: 1080, top: 105, width: 456, height: 310 }],
  ['tree-pine', { left: 45, top: 385, width: 310, height: 345 }],
  ['tree-maple', { left: 380, top: 385, width: 405, height: 345 }],
  ['bush-round', { left: 790, top: 410, width: 325, height: 300 }],
  ['flowers-moon', { left: 1110, top: 415, width: 390, height: 295 }],
  ['rock-moss', { left: 10, top: 700, width: 370, height: 324 }],
  ['phase7-dev-willow-chair', { left: 390, top: 695, width: 370, height: 329 }],
  ['phase7-crafting-workbench-marker', { left: 750, top: 690, width: 390, height: 334 }],
  ['phase7-dev-round-leaf-planter', { left: 1125, top: 680, width: 390, height: 344 }],
] as const);

const TERRAIN_CELLS = Object.freeze([
  ['world.terrain.grass.base', 0, 0],
  ['world.terrain.grass.clover', 1, 0],
  ['world.terrain.dirt', 2, 0],
  ['world.terrain.plaza', 3, 0],
  ['world.terrain.water', 0, 1],
  ['world.terrain.path.stone', 2, 0],
  ['world.terrain.bridge', 3, 1],
] as const);

const TERRAIN_A1_CELLS = Object.freeze([
  ['world.terrain.grass.base', 0, 0],
  ['world.terrain.grass.light', 1, 0],
  ['world.terrain.grass.dark', 2, 0],
  ['world.terrain.grass.worn', 3, 0],
  ['world.terrain.grass.clover', 0, 1],
  ['world.terrain.grass.flowers', 1, 1],
  ['world.terrain.grass.path-edge', 2, 1],
  ['world.terrain.grass.shore', 3, 1],
  ['world.terrain.water', 0, 2],
  ['world.terrain.water.deep', 0, 2],
  ['world.terrain.water.shallow', 1, 2],
  ['world.terrain.water.shore', 2, 2],
  ['world.terrain.water.disturbance', 3, 2],
] as const);
const TERRAIN_A1_KEYS = new Set<string>(TERRAIN_A1_CELLS.map(([key]) => key));

const INTERIOR_A1_CELLS = Object.freeze([
  ['v3.interior.floor', 0, 0],
  ['v3.interior.wall', 1, 0],
  ['v3.interior.door', 2, 0],
  ['v3.interior.bed', 3, 0],
  ['v3.interior.bedside-table', 0, 1],
  ['v3.interior.dining-table', 1, 1],
  ['v3.interior.dining-chair', 2, 1],
  ['v3.interior.chest', 3, 1],
  ['v3.interior.wardrobe', 0, 2],
  ['v3.interior.rug', 1, 2],
  ['v3.interior.window', 2, 2],
  ['v3.interior.fireplace', 3, 2],
  ['v3.interior.cooking-counter', 0, 3],
  ['v3.interior.wall-art', 1, 3],
  ['v3.interior.floor-lamp', 2, 3],
  ['v3.interior.houseplant', 3, 3],
] as const);

const TERRAIN_UNDERLAY: Readonly<
  Record<(typeof TERRAIN_CELLS)[number][0], readonly [number, number, number]>
> = {
  'world.terrain.grass.base': [111, 145, 48],
  'world.terrain.grass.clover': [121, 153, 51],
  'world.terrain.dirt': [197, 139, 69],
  'world.terrain.path.stone': [205, 153, 74],
  'world.terrain.plaza': [213, 177, 102],
  'world.terrain.water': [30, 119, 117],
  'world.terrain.bridge': [161, 107, 47],
};

const DIRECTION_ROWS: readonly FacingDirection[] = [
  'north',
  'northeast',
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
];

const IDLE_CELL_BY_DIRECTION: Readonly<Record<FacingDirection, readonly [number, number]>> = {
  south: [0, 0],
  southwest: [1, 0],
  west: [2, 0],
  northwest: [3, 0],
  north: [0, 1],
  northeast: [1, 1],
  east: [2, 1],
  southeast: [3, 1],
};

export const PRODUCTION_SLICE_WALK_SOURCE_BY_DIRECTION: Readonly<
  Record<FacingDirection, Readonly<{ column: number; flip?: boolean }>>
> = {
  south: { column: 0 },
  southwest: { column: 1, flip: true },
  west: { column: 6 },
  northwest: { column: 5 },
  north: { column: 4 },
  northeast: { column: 3 },
  east: { column: 2 },
  southeast: { column: 1 },
};

export const PRODUCTION_SLICE_JOG_SOURCE_BY_DIRECTION: Readonly<
  Record<FacingDirection, Readonly<{ row: number; flip?: boolean }>>
> = {
  south: { row: 0 },
  southwest: { row: 1, flip: true },
  west: { row: 2, flip: true },
  northwest: { row: 3, flip: true },
  north: { row: 4 },
  northeast: { row: 3 },
  east: { row: 2 },
  southeast: { row: 1 },
};

function gridCrop(
  width: number,
  height: number,
  columns: number,
  rows: number,
  column: number,
  row: number,
): Crop {
  const left = Math.round((column * width) / columns);
  const right = Math.round(((column + 1) * width) / columns);
  const top = Math.round((row * height) / rows);
  const bottom = Math.round(((row + 1) * height) / rows);
  return { left, top, width: right - left, height: bottom - top };
}

async function isolateLargestAlphaComponent(input: Buffer): Promise<Buffer> {
  const raw = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = raw.info;
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  let largest: number[] = [];
  const alphaAt = (index: number): number => raw.data[index * channels + channels - 1] ?? 0;

  for (let start = 0; start < pixelCount; start += 1) {
    if (visited[start] === 1 || alphaAt(start) < 20) continue;
    const component: number[] = [];
    const queue = [start];
    visited[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      if (index === undefined) continue;
      component.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || visited[neighbor] === 1 || alphaAt(neighbor) < 20) continue;
        visited[neighbor] = 1;
        queue.push(neighbor);
      }
    }
    if (component.length > largest.length) largest = component;
  }

  const keep = new Uint8Array(pixelCount);
  for (const index of largest) keep[index] = 1;
  for (let pass = 0; pass < 2; pass += 1) {
    const expanded = keep.slice();
    for (let index = 0; index < pixelCount; index += 1) {
      if (keep[index] !== 1) continue;
      const x = index % width;
      const y = Math.floor(index / width);
      if (x > 0) expanded[index - 1] = 1;
      if (x + 1 < width) expanded[index + 1] = 1;
      if (y > 0) expanded[index - width] = 1;
      if (y + 1 < height) expanded[index + width] = 1;
    }
    keep.set(expanded);
  }
  for (let index = 0; index < pixelCount; index += 1) {
    if (keep[index] !== 1) raw.data[index * channels + channels - 1] = 0;
  }
  return sharp(raw.data, { raw: raw.info }).png().toBuffer();
}

async function normalizedCutout(
  sheetPath: string,
  crop: Crop,
  width: number,
  height: number,
  padding: number,
  stretch = false,
  underlay?: readonly [number, number, number],
): Promise<Buffer> {
  const extracted = await sharp(sheetPath).extract(crop).png().toBuffer();
  const cell = await isolateLargestAlphaComponent(extracted);
  const trimmed = await sharp(cell)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 2 })
    .resize({
      width: width - padding * 2,
      height: height - padding * 2,
      fit: stretch ? 'fill' : 'inside',
      withoutEnlargement: false,
    })
    .png()
    .toBuffer({ resolveWithObject: true });
  const left = Math.round((width - trimmed.info.width) / 2);
  const top = height - padding - trimmed.info.height;
  const normalized = await sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: trimmed.data, left, top }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  if (underlay === undefined) return normalized;
  const diamond = Buffer.alloc(width * height * 4);
  const halfWidth = (width - 3) / 2;
  const halfHeight = (height - 3) / 2;
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (Math.abs(x - centerX) / halfWidth + Math.abs(y - centerY) / halfHeight > 1) continue;
      const offset = (y * width + x) * 4;
      diamond[offset] = underlay[0];
      diamond[offset + 1] = underlay[1];
      diamond[offset + 2] = underlay[2];
      diamond[offset + 3] = 255;
    }
  }
  return sharp(diamond, { raw: { width, height, channels: 4 } })
    .composite([{ input: normalized }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function prepareWorldSources(workspaceRoot: string): Promise<number> {
  let written = 0;
  const manifestByKey = new Map(
    STARVILLE_PRODUCTION_SLICE_ASSET_MANIFEST.assets.map((asset) => [asset.key, asset]),
  );
  const environmentSheet = resolveAssetFilesystemPath(workspaceRoot, ENVIRONMENT_SHEET);
  const terrainSheet = resolveAssetFilesystemPath(workspaceRoot, TERRAIN_SHEET);
  const terrainA1Sheet = resolveAssetFilesystemPath(workspaceRoot, TERRAIN_A1_SHEET);
  const interiorA1Sheet = resolveAssetFilesystemPath(workspaceRoot, INTERIOR_A1_SHEET);

  for (const [key, crop] of ENVIRONMENT_CELLS) {
    const asset = manifestByKey.get(key);
    if (asset === undefined) throw new Error(`Phase 12F environment asset is missing: ${key}`);
    const bytes = await normalizedCutout(environmentSheet, crop, asset.width, asset.height, 8);
    const result = await writeFileIfChanged(
      resolveAssetFilesystemPath(workspaceRoot, asset.sourcePath),
      bytes,
    );
    if (result.changed) written += 1;
  }

  for (const [key, column, row] of TERRAIN_CELLS) {
    if (TERRAIN_A1_KEYS.has(key)) continue;
    const asset = manifestByKey.get(key);
    if (asset === undefined) throw new Error(`Phase 12F terrain asset is missing: ${key}`);
    const bytes = await normalizedCutout(
      terrainSheet,
      gridCrop(1774, 887, 4, 2, column, row),
      asset.width,
      asset.height,
      2,
      true,
      TERRAIN_UNDERLAY[key],
    );
    const result = await writeFileIfChanged(
      resolveAssetFilesystemPath(workspaceRoot, asset.sourcePath),
      bytes,
    );
    if (result.changed) written += 1;
  }

  for (const [key, column, row] of TERRAIN_A1_CELLS) {
    const asset = manifestByKey.get(key);
    if (asset === undefined) throw new Error(`Phase 12F-A.1 terrain asset is missing: ${key}`);
    const bytes = await normalizedCutout(
      terrainA1Sheet,
      gridCrop(1536, 1024, 4, 3, column, row),
      asset.width,
      asset.height,
      0,
      true,
    );
    const result = await writeFileIfChanged(
      resolveAssetFilesystemPath(workspaceRoot, asset.sourcePath),
      bytes,
    );
    if (result.changed) written += 1;
  }

  for (const [key, column, row] of INTERIOR_A1_CELLS) {
    const asset = manifestByKey.get(key);
    if (asset === undefined) throw new Error(`Phase 12F-A.1 interior asset is missing: ${key}`);
    const bytes = await normalizedCutout(
      interiorA1Sheet,
      gridCrop(1536, 1024, 4, 4, column, row),
      asset.width,
      asset.height,
      8,
    );
    const result = await writeFileIfChanged(
      resolveAssetFilesystemPath(workspaceRoot, asset.sourcePath),
      bytes,
    );
    if (result.changed) written += 1;
  }

  const missing = STARVILLE_BUNDLED_ASSET_MANIFEST.assets.find(
    ({ key }) => key === 'system.missing-asset',
  );
  const targetMissing = manifestByKey.get('system.missing-asset');
  if (missing === undefined || targetMissing === undefined) {
    throw new Error('Canonical missing-asset source is unavailable');
  }
  const missingBytes = await sharp(Buffer.from(renderBundledAssetSvg({ asset: missing })), {
    density: 144,
  })
    .resize(targetMissing.width, targetMissing.height, { fit: 'contain' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  const missingResult = await writeFileIfChanged(
    resolveAssetFilesystemPath(workspaceRoot, targetMissing.sourcePath),
    missingBytes,
  );
  if (missingResult.changed) written += 1;
  return written;
}

const WALK_COLUMN_EDGES = [0, 216, 430, 640, 833, 1017, 1215, 1536] as const;
const WALK_ROW_EDGES = [0, 287, 540, 794, 1024] as const;

function walkCrop(column: number, row: number): Crop {
  const left = WALK_COLUMN_EDGES[column];
  const right = WALK_COLUMN_EDGES[column + 1];
  const top = WALK_ROW_EDGES[row];
  const bottom = WALK_ROW_EDGES[row + 1];
  if (left === undefined || right === undefined || top === undefined || bottom === undefined) {
    throw new Error('Walk-cycle crop is outside the authored sheet');
  }
  return { left, top, width: right - left, height: bottom - top };
}

async function characterFrame(
  sourcePath: string,
  crop: Crop,
  flip: boolean,
  maximumHeight = 240,
): Promise<Buffer> {
  const extracted = await sharp(sourcePath).extract(crop).png().toBuffer();
  const cell = await isolateLargestAlphaComponent(extracted);
  let image = sharp(cell);
  if (flip) image = image.flop();
  const trimmed = await image
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 2 })
    .resize({ width: 176, height: maximumHeight, fit: 'inside' })
    .png()
    .toBuffer({ resolveWithObject: true });
  return sharp({
    create: {
      width: PRODUCTION_SLICE_AVATAR_FRAME_WIDTH,
      height: PRODUCTION_SLICE_AVATAR_FRAME_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: trimmed.data,
        left: Math.round((PRODUCTION_SLICE_AVATAR_FRAME_WIDTH - trimmed.info.width) / 2),
        top: PRODUCTION_SLICE_AVATAR_FRAME_HEIGHT - 7 - trimmed.info.height,
      },
    ])
    .png()
    .toBuffer();
}

function samplePremultipliedPixel(
  source: Uint8Array,
  width: number,
  height: number,
  channels: number,
  sourceX: number,
  sourceY: number,
  output: Buffer,
  outputOffset: number,
): void {
  const left = Math.floor(sourceX);
  const top = Math.floor(sourceY);
  const horizontalBlend = sourceX - left;
  const verticalBlend = sourceY - top;
  const samples = [
    { x: left, y: top, weight: (1 - horizontalBlend) * (1 - verticalBlend) },
    { x: left + 1, y: top, weight: horizontalBlend * (1 - verticalBlend) },
    { x: left, y: top + 1, weight: (1 - horizontalBlend) * verticalBlend },
    { x: left + 1, y: top + 1, weight: horizontalBlend * verticalBlend },
  ];
  let alpha = 0;
  const premultiplied = [0, 0, 0];
  for (const sample of samples) {
    if (
      sample.weight === 0 ||
      sample.x < 0 ||
      sample.x >= width ||
      sample.y < 0 ||
      sample.y >= height
    ) {
      continue;
    }
    const sampleOffset = (sample.y * width + sample.x) * channels;
    const sampleAlpha = source[sampleOffset + 3] ?? 0;
    const alphaWeight = sample.weight * sampleAlpha;
    alpha += alphaWeight;
    for (let channel = 0; channel < 3; channel += 1) {
      premultiplied[channel] =
        (premultiplied[channel] ?? 0) + (source[sampleOffset + channel] ?? 0) * alphaWeight;
    }
  }
  output[outputOffset + 3] = Math.round(alpha);
  for (let channel = 0; channel < 3; channel += 1) {
    output[outputOffset + channel] = alpha === 0 ? 0 : Math.round(premultiplied[channel]! / alpha);
  }
}

async function idleFrame(baseFrame: Buffer, phase: number): Promise<Buffer> {
  const motion = IDLE_BODY_MOTION[phase];
  if (motion === undefined) throw new Error(`Idle phase is outside the authored cycle: ${phase}`);
  const decoded = await sharp(baseFrame).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const output = Buffer.from(decoded.data);
  for (let y = 0; y < IDLE_ROOT_LOCK_TOP; y += 1) {
    const distanceFromRoot = (IDLE_ROOT_LOCK_TOP - y) / IDLE_ROOT_LOCK_TOP;
    const influence = distanceFromRoot * distanceFromRoot * (3 - 2 * distanceFromRoot);
    for (let x = 0; x < decoded.info.width; x += 1) {
      const outputOffset = (y * decoded.info.width + x) * decoded.info.channels;
      samplePremultipliedPixel(
        decoded.data,
        decoded.info.width,
        decoded.info.height,
        decoded.info.channels,
        x - motion.swayPixels * influence,
        y + motion.breathPixels * influence,
        output,
        outputOffset,
      );
    }
  }
  return sharp(output, { raw: decoded.info })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function prepareAvatarAtlas(workspaceRoot: string): Promise<number> {
  const idlePath = resolveAssetFilesystemPath(workspaceRoot, IDLE_REFERENCE);
  const walkPath = resolveAssetFilesystemPath(workspaceRoot, WALK_SHEET);
  const jogPath = resolveAssetFilesystemPath(workspaceRoot, JOG_SHEET);
  const composites: sharp.OverlayOptions[] = [];

  for (const [directionRow, direction] of DIRECTION_ROWS.entries()) {
    const [idleColumn, idleRow] = IDLE_CELL_BY_DIRECTION[direction];
    const idleBase = await characterFrame(
      idlePath,
      gridCrop(1536, 1024, 4, 2, idleColumn, idleRow),
      false,
    );
    for (let phase = 0; phase < 4; phase += 1) {
      const frame = await idleFrame(idleBase, phase);
      composites.push({
        input: frame,
        left: phase * PRODUCTION_SLICE_AVATAR_FRAME_WIDTH,
        top: directionRow * PRODUCTION_SLICE_AVATAR_FRAME_HEIGHT,
      });
    }

    const walk = PRODUCTION_SLICE_WALK_SOURCE_BY_DIRECTION[direction];
    for (let phase = 0; phase < 4; phase += 1) {
      const frame = await characterFrame(
        walkPath,
        walkCrop(walk.column, phase),
        walk.flip === true,
      );
      composites.push({
        input: frame,
        left: (phase + 4) * PRODUCTION_SLICE_AVATAR_FRAME_WIDTH,
        top: directionRow * PRODUCTION_SLICE_AVATAR_FRAME_HEIGHT,
      });
    }

    const jog = PRODUCTION_SLICE_JOG_SOURCE_BY_DIRECTION[direction];
    for (let phase = 0; phase < 4; phase += 1) {
      const frame = await characterFrame(
        jogPath,
        gridCrop(1024, 1536, 4, 5, phase, jog.row),
        jog.flip === true,
      );
      composites.push({
        input: frame,
        left: (phase + 8) * PRODUCTION_SLICE_AVATAR_FRAME_WIDTH,
        top: directionRow * PRODUCTION_SLICE_AVATAR_FRAME_HEIGHT,
      });
    }
  }

  const atlas = sharp({
    create: {
      width: PRODUCTION_SLICE_AVATAR_COLUMNS * PRODUCTION_SLICE_AVATAR_FRAME_WIDTH,
      height: PRODUCTION_SLICE_AVATAR_ROWS * PRODUCTION_SLICE_AVATAR_FRAME_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite(composites);
  const sourceBytes = await atlas
    .clone()
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  const runtimeBytes = await atlas
    .clone()
    .webp({ quality: 92, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toBuffer();
  const sourceWrite = await writeFileIfChanged(
    resolveAssetFilesystemPath(workspaceRoot, PRODUCTION_SLICE_AVATAR_SOURCE),
    sourceBytes,
  );
  const runtimeWrite = await writeFileIfChanged(
    path.join(workspaceRoot, PRODUCTION_SLICE_AVATAR_RUNTIME),
    runtimeBytes,
  );
  const states = [
    { state: 'idle', startColumn: 0, frameDurationMs: 360 },
    { state: 'walk', startColumn: 4, frameDurationMs: 130 },
    { state: 'jog', startColumn: 8, frameDurationMs: 85 },
  ] as const;
  const manifestBytes = await formattedJson({
    schemaVersion: 1,
    candidate: 'starville-production-slice-v3',
    status: 'local_unpublished_owner_review_required',
    sourcePath: PRODUCTION_SLICE_AVATAR_SOURCE,
    runtimePath: `/${PRODUCTION_SLICE_AVATAR_RUNTIME}`,
    sourceSha256: sha256(sourceBytes),
    runtimeSha256: sha256(runtimeBytes),
    frameWidth: PRODUCTION_SLICE_AVATAR_FRAME_WIDTH,
    frameHeight: PRODUCTION_SLICE_AVATAR_FRAME_HEIGHT,
    columns: PRODUCTION_SLICE_AVATAR_COLUMNS,
    rows: PRODUCTION_SLICE_AVATAR_ROWS,
    frameCount: PRODUCTION_SLICE_AVATAR_COLUMNS * PRODUCTION_SLICE_AVATAR_ROWS,
    mappings: states.flatMap((state) =>
      DIRECTION_ROWS.map((direction, row) => ({
        direction,
        state: state.state,
        row,
        startColumn: state.startColumn,
        frameCount: 4,
        frameDurationMs: state.frameDurationMs,
        loop: true,
        anchorX: 0.5,
        anchorY: 0.97,
      })),
    ),
  });
  const manifestWrite = await writeFileIfChanged(
    resolveAssetFilesystemPath(workspaceRoot, PRODUCTION_SLICE_AVATAR_MANIFEST),
    manifestBytes,
  );
  return Number(sourceWrite.changed) + Number(runtimeWrite.changed) + Number(manifestWrite.changed);
}

export async function preparePhase12FSourceArt(workspaceRoot: string): Promise<number> {
  return (await prepareWorldSources(workspaceRoot)) + (await prepareAvatarAtlas(workspaceRoot));
}

export type Phase12FDecodedAvatarFrame = Readonly<{
  data: Uint8Array;
  width: number;
  height: number;
  channels: number;
}>;

function lastOpaqueRow(frame: Phase12FDecodedAvatarFrame): number {
  let lastRow = -1;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      if (frame.data[(y * frame.width + x) * frame.channels + 3] !== 0) lastRow = y;
    }
  }
  return lastRow;
}

function horizontalFootAnchor(frame: Phase12FDecodedAvatarFrame): string {
  let left = frame.width;
  let right = -1;
  let alphaTotal = 0;
  let weightedX = 0;
  for (let y = IDLE_FOOT_ANCHOR_BAND_TOP; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const alpha = frame.data[(y * frame.width + x) * frame.channels + 3] ?? 0;
      if (alpha === 0) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      alphaTotal += alpha;
      weightedX += x * alpha;
    }
  }
  return `${String(left)}:${String(right)}:${String(weightedX)}/${String(alphaTotal)}`;
}

export function validatePhase12FDecodedCycle(
  state: 'idle' | 'walk' | 'jog',
  direction: FacingDirection,
  frames: readonly Phase12FDecodedAvatarFrame[],
): readonly string[] {
  const issues: string[] = [];
  if (frames.length !== 4) {
    return [`${state}:${direction} does not contain four frames`];
  }
  const frameHashes = new Set(frames.map((frame) => sha256(frame.data)));
  const footRows = frames.map(lastOpaqueRow);
  if (frameHashes.size !== 4) {
    issues.push(`${state}:${direction} does not contain four decoded-pixel-unique frames`);
  }
  const allowedVerticalDrift = state === 'idle' ? 0 : 1;
  if (Math.max(...footRows) - Math.min(...footRows) > allowedVerticalDrift) {
    issues.push(`${state}:${direction} foot anchor drifts vertically across its cycle`);
  }
  if (state === 'idle') {
    const rootHashes = new Set(
      frames.map((frame) =>
        sha256(frame.data.subarray(IDLE_ROOT_LOCK_TOP * frame.width * frame.channels)),
      ),
    );
    if (rootHashes.size !== 1) {
      issues.push(`${state}:${direction} lower-body root pixels drift across its cycle`);
    }
    if (new Set(frames.map(horizontalFootAnchor)).size !== 1) {
      issues.push(`${state}:${direction} foot anchor drifts horizontally across its cycle`);
    }
  }
  return issues;
}

export async function validatePhase12FAvatar(workspaceRoot: string): Promise<readonly string[]> {
  const issues: string[] = [];
  const sourcePath = resolveAssetFilesystemPath(workspaceRoot, PRODUCTION_SLICE_AVATAR_SOURCE);
  const runtimePath = path.join(workspaceRoot, PRODUCTION_SLICE_AVATAR_RUNTIME);
  const source = await readFile(sourcePath);
  const runtime = await readFile(runtimePath);
  for (const [label, bytes, format] of [
    ['source', source, 'png'],
    ['runtime', runtime, 'webp'],
  ] as const) {
    const metadata = await sharp(bytes).metadata();
    if (
      metadata.format !== format ||
      metadata.width !== PRODUCTION_SLICE_AVATAR_COLUMNS * PRODUCTION_SLICE_AVATAR_FRAME_WIDTH ||
      metadata.height !== PRODUCTION_SLICE_AVATAR_ROWS * PRODUCTION_SLICE_AVATAR_FRAME_HEIGHT ||
      metadata.hasAlpha !== true
    ) {
      issues.push(`${label} atlas format, dimensions, or alpha contract is invalid`);
    }
  }
  const deterministicRuntime = await sharp(source)
    .webp({ quality: 92, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toBuffer();
  if (!runtime.equals(deterministicRuntime)) {
    issues.push('runtime atlas bytes drifted from the authored PNG source');
  }
  for (const [row, direction] of DIRECTION_ROWS.entries()) {
    for (const [state, startColumn] of [
      ['idle', 0],
      ['walk', 4],
      ['jog', 8],
    ] as const) {
      const frames: Phase12FDecodedAvatarFrame[] = [];
      for (let phase = 0; phase < 4; phase += 1) {
        const decoded = await sharp(source)
          .extract({
            left: (startColumn + phase) * PRODUCTION_SLICE_AVATAR_FRAME_WIDTH,
            top: row * PRODUCTION_SLICE_AVATAR_FRAME_HEIGHT,
            width: PRODUCTION_SLICE_AVATAR_FRAME_WIDTH,
            height: PRODUCTION_SLICE_AVATAR_FRAME_HEIGHT,
          })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        frames.push({ data: decoded.data, ...decoded.info });
      }
      issues.push(...validatePhase12FDecodedCycle(state, direction, frames));
    }
  }
  const mappingKeys = new Set(
    ['idle', 'walk', 'jog'].flatMap((state) =>
      DIRECTION_ROWS.map((direction) => `${state}:${direction}`),
    ),
  );
  if (mappingKeys.size !== 24) issues.push('avatar state-direction mapping is incomplete');
  const manifest = await readFile(
    resolveAssetFilesystemPath(workspaceRoot, PRODUCTION_SLICE_AVATAR_MANIFEST),
    'utf8',
  );
  const parsed = JSON.parse(manifest) as {
    mappings?: unknown[];
    sourceSha256?: string;
    runtimeSha256?: string;
  };
  if (
    parsed.mappings?.length !== 24 ||
    parsed.sourceSha256 !== sha256(source) ||
    parsed.runtimeSha256 !== sha256(runtime)
  ) {
    issues.push('avatar manifest mapping count or content hashes are stale');
  }
  return issues;
}
