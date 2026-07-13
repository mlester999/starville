import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./editor-scroll-region.tsx', import.meta.url), 'utf8');
const area = readFileSync(new URL('./admin-scroll-area.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

describe('editor scroll region', () => {
  it('re-exports AdminScrollArea for World Editor panels', () => {
    expect(source).toContain('AdminScrollArea');
    expect(source).toContain('EditorScrollRegion');
    expect(area).toContain('data-admin-scroll-track="true"');
    expect(area).toContain('data-admin-scroll-thumb="true"');
    expect(area).toContain('data-admin-scroll-viewport="true"');
  });

  it('keeps always-visible scrollbar styles without badge overlays', () => {
    expect(styles).toContain('.admin-scroll-area__track');
    expect(styles).toContain('.admin-scroll-area__thumb');
    expect(styles).toContain('scrollbar-width: none');
    expect(styles).not.toContain('More above');
    expect(styles).not.toContain('.editor-scroll-region__edge-btn');
    expect(styles).not.toContain('.editor-scroll-region__status');
    expect(styles).not.toContain('.editor-scroll-region__fade');
  });
});
