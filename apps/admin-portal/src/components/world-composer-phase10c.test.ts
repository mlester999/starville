import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const editor = readFileSync(new URL('./world-editor.tsx', import.meta.url), 'utf8');
const canvas = readFileSync(new URL('./world-manifest-canvas.tsx', import.meta.url), 'utf8');
const worldDetail = readFileSync(
  new URL('../app/(protected)/worlds/[mapId]/page.tsx', import.meta.url),
  'utf8',
);
const revisionPage = readFileSync(
  new URL('../app/(protected)/worlds/[mapId]/revisions/[versionId]/page.tsx', import.meta.url),
  'utf8',
);
const actions = readFileSync(new URL('../app/actions/worlds.ts', import.meta.url), 'utf8');

describe('Phase 10C World Composer contracts', () => {
  it('previews, drags, confirms, duplicates, aligns, resets, and safely removes objects', () => {
    expect(editor).toContain('placementPreviewObject');
    expect(editor).toContain('Preview placement at center');
    expect(editor).toContain('Confirm placement');
    expect(editor).toContain('Drag to');
    expect(editor).toContain('onObjectMove: (objectId: string, x: number, y: number) =>');
    expect(editor).toContain('setPlacementPreview({ x, y })');
    expect(editor).toContain('Duplicate');
    expect(editor).toContain('Snap to half tile');
    expect(editor).toContain('Align center');
    expect(editor).toContain('Reset saved position');
    expect(editor).toContain('Reset scale to 1×');
    expect(editor).toContain('Remove this gameplay-relevant item from the draft?');
  });

  it('uses pointer/touch capture, bounded logical coordinates, and one commit on drag release', () => {
    expect(canvas).toContain('onPointerDown');
    expect(canvas).toContain('setPointerCapture');
    expect(canvas).toContain('onPointerMove');
    expect(canvas).toContain('manifest.safeSaveBounds.maxX');
    expect(canvas).toContain('manifest.safeSaveBounds.minY');
    expect(canvas).toContain('onPointerUp');
    expect(canvas).toContain('onObjectMove?.(object.id, preview.x, preview.y)');
    expect(canvas).not.toContain('onObjectMove?.(drag.objectId, x, y)');
    expect(editor).toContain('moveToolActive');
    expect(editor).toContain('Selected tool:');
    expect(editor).toContain(
      'placementPreviewObject !== undefined || (editableDraft && moveToolActive)',
    );
  });

  it('supports keyboard nudge, constrained rotation, depth, collision, undo/redo, and review', () => {
    expect(editor).toContain('event.altKey');
    expect(editor).toContain("event.key === 'ArrowLeft'");
    expect(editor).toContain('const step = event.shiftKey ? 0.5 : 0.125');
    expect(editor).toContain('selectedSupportedRotations.map');
    expect(editor).toContain('World Y / depth base');
    expect(editor).toContain('Collision');
    expect(editor).toContain('undoWorldEditorManifest');
    expect(editor).toContain('redoWorldEditorManifest');
    expect(editor).toContain('Unsaved structured change summary');
  });

  it('keeps save revision-bound and moves the editor to the immutable successor URL', () => {
    expect(editor).toContain("formData.set('manifest', JSON.stringify(manifest))");
    expect(editor).toContain('result.versionId ?? currentVersionId');
    expect(editor).toContain(
      'router.replace(`/worlds/${props.draft.map.id}/editor?version=${nextVersionId}`)',
    );
    expect(editor).toContain('unsaved world changes');
    expect(editor).toContain('Discard all unsaved changes in this Composer session?');
  });

  it('uses the selected World Asset safely in a draft without activating or publishing it', () => {
    expect(editor).toContain('props.initialAssetKey');
    expect(editor).toContain('initialAssetCandidate');
    expect(editor).toContain('candidate.activeVersion.render.defaultRotation');
    expect(editor).not.toContain('activateAdminGameAsset');
    expect(editor).not.toContain('publishWorldDraftAction');
  });

  it('exposes immutable revision history, exact inspection, comparison, Game Test, restore, and rollback', () => {
    expect(worldDetail).toContain('/revisions/${version.id}');
    expect(worldDetail).toContain('detail.draftHeadVersionId');
    expect(worldDetail).toContain('operation="rollback"');
    expect(worldDetail).toContain('operation="derive"');
    expect(revisionPage).toContain('loadWorldRevision');
    expect(revisionPage).toContain('compareWorldRevisions');
    expect(revisionPage).toContain('Stored change summary');
    expect(revisionPage).toContain('Compared with current public revision');
    expect(revisionPage).toContain('<WorldGameTestLauncher');
    expect(revisionPage).toContain('WorldDraftPreview');
    expect(revisionPage).toContain('Read-only history');
    expect(revisionPage).not.toContain('WorldEditor');
  });

  it('requires an acknowledged review receipt before publish or rollback actions', () => {
    expect(actions).toContain('reviewWorldPublication');
    expect(actions).toContain('publishWorldDraft');
    expect(actions).toContain('reviewRequestId');
    expect(actions).toContain('impactAcknowledged');
    expect(actions).toContain('rollbackWorldRevision');
    expect(actions).toContain("operation: 'rollback'");
  });
});
