import { mapManifestSchema } from '@starville/game-core';

import type { AdminWorldManifest } from './contracts';

export const WORLD_EDITOR_HISTORY_LIMIT = 50;

export type WorldEditorLayer =
  'metadata' | 'objects' | 'collisions' | 'spawns' | 'exits' | 'bounds';

export interface WorldEditorSelection {
  readonly layer: Exclude<WorldEditorLayer, 'metadata' | 'bounds'>;
  readonly id: string;
}

export interface WorldEditorHistory {
  readonly past: readonly AdminWorldManifest[];
  readonly present: AdminWorldManifest;
  readonly future: readonly AdminWorldManifest[];
}

function serialized(manifest: AdminWorldManifest): string {
  return JSON.stringify(manifest);
}

export function createWorldEditorHistory(manifest: AdminWorldManifest): WorldEditorHistory {
  return { past: [], present: manifest, future: [] };
}

export function commitWorldEditorManifest(
  history: WorldEditorHistory,
  next: AdminWorldManifest,
): WorldEditorHistory {
  if (serialized(history.present) === serialized(next)) return history;
  return {
    past: [...history.past, history.present].slice(-WORLD_EDITOR_HISTORY_LIMIT),
    present: next,
    future: [],
  };
}

export function undoWorldEditorManifest(history: WorldEditorHistory): WorldEditorHistory {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future].slice(0, WORLD_EDITOR_HISTORY_LIMIT),
  };
}

export function redoWorldEditorManifest(history: WorldEditorHistory): WorldEditorHistory {
  const next = history.future[0];
  if (next === undefined) return history;
  return {
    past: [...history.past, history.present].slice(-WORLD_EDITOR_HISTORY_LIMIT),
    present: next,
    future: history.future.slice(1),
  };
}

function allIdentifiers(manifest: AdminWorldManifest): Set<string> {
  return new Set([
    ...manifest.terrain.map(({ id }) => id),
    ...manifest.collisions.map(({ id }) => id),
    ...manifest.objects.map(({ id }) => id),
    ...manifest.interactions.map(({ id }) => id),
    ...manifest.spawns.map(({ id }) => id),
    ...manifest.exits.map(({ id }) => id),
  ]);
}

export function nextEditorIdentifier(manifest: AdminWorldManifest, prefix: string): string {
  const used = allIdentifiers(manifest);
  for (let suffix = 1; suffix <= 10_000; suffix += 1) {
    const candidate = `${prefix}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error('The editor could not allocate another bounded identifier.');
}

export function removeWorldEditorSelection(
  manifest: AdminWorldManifest,
  selection: WorldEditorSelection,
): AdminWorldManifest {
  if (selection.layer === 'objects') {
    return { ...manifest, objects: manifest.objects.filter(({ id }) => id !== selection.id) };
  }
  if (selection.layer === 'collisions') {
    return {
      ...manifest,
      collisions: manifest.collisions.filter(({ id }) => id !== selection.id),
    };
  }
  if (selection.layer === 'spawns') {
    if (selection.id === manifest.defaultSpawnId) return manifest;
    return { ...manifest, spawns: manifest.spawns.filter(({ id }) => id !== selection.id) };
  }
  return manifest;
}

export interface BrowserManifestIssue {
  readonly path: string;
  readonly message: string;
}

export function browserManifestIssues(
  manifest: AdminWorldManifest,
): readonly BrowserManifestIssue[] {
  const result = mapManifestSchema.safeParse(manifest);
  if (result.success) return [];
  return result.error.issues.slice(0, 100).map((issue) => ({
    path: issue.path.length === 0 ? 'manifest' : issue.path.join('.'),
    message: issue.message,
  }));
}

export function manifestHasUnsavedChanges(
  manifest: AdminWorldManifest,
  lastSavedManifest: AdminWorldManifest,
): boolean {
  return serialized(manifest) !== serialized(lastSavedManifest);
}
