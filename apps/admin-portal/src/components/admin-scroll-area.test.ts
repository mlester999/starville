import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const area = readFileSync(new URL('./admin-scroll-area.tsx', import.meta.url), 'utf8');
const editorScroll = readFileSync(new URL('./editor-scroll-region.tsx', import.meta.url), 'utf8');
const editor = readFileSync(new URL('./world-editor.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

describe('admin scroll area always-visible scrollbar', () => {
  it('implements a permanent track and draggable thumb synchronized to the viewport', () => {
    expect(area).toContain('data-admin-scroll-track="true"');
    expect(area).toContain('data-admin-scroll-thumb="true"');
    expect(area).toContain('data-admin-scroll-viewport="true"');
    expect(area).toContain('role="scrollbar"');
    expect(area).toContain('computeVerticalScrollGeometry');
    expect(area).toContain('scrollTopFromThumbDelta');
    expect(area).toContain('scrollTopFromTrackClick');
    expect(area).toContain('setPointerCapture');
    expect(area).toContain('ResizeObserver');
    expect(area).toContain('MutationObserver');
  });

  it('keeps native scrolling and keyboard paging on the same viewport', () => {
    expect(area).toContain('overflow');
    expect(area).toContain("event.key === 'PageDown'");
    expect(area).toContain("event.key === 'PageUp'");
    expect(area).toContain("event.key === 'Home'");
    expect(area).toContain("event.key === 'End'");
    expect(area).toContain('tabIndex={0}');
    expect(area).toContain('onScroll={handleScroll}');
  });

  it('does not render instructional badges or percentage overlays', () => {
    expect(area).not.toContain('More above');
    expect(area).not.toContain('More below');
    expect(area).not.toContain('Scroll for more');
    expect(area).not.toContain('progressLabel');
    expect(area).not.toContain('editor-scroll-region__edge-btn');
    expect(area).not.toContain('editor-scroll-region__status');
  });

  it('is shared by Layers and Inspector through EditorScrollRegion', () => {
    expect(editorScroll).toContain('AdminScrollArea');
    expect(editor).toContain('EditorScrollRegion');
    expect(editor).toContain('data-scrollable-panel="layers"');
    expect(editor).toContain('data-scrollable-panel="inspector"');
  });

  it('styles a permanently visible forest/mint track flush to the panel edge', () => {
    expect(styles).toContain('.admin-scroll-area__track');
    expect(styles).toContain('.admin-scroll-area__thumb');
    expect(styles).toContain('scrollbar-width: none');
    expect(styles).toContain('overflow-y: auto');
    expect(styles).toContain('overscroll-behavior: contain');
    expect(styles).toContain('min-height: 0');
    expect(styles).toContain('.world-editor-layers > .admin-scroll-area');
    expect(styles).toContain('.world-editor-page .asset-palette');
    expect(styles).not.toContain('.editor-scroll-region__edge-btn');
    expect(styles).not.toContain('.editor-scroll-region__status');
    expect(styles).not.toContain('.editor-scroll-region__fade');
  });
});
