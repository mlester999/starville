import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const listPage = readFileSync(
  new URL('../app/(protected)/operations/activities/page.tsx', import.meta.url),
  'utf8',
);
const instancePage = readFileSync(
  new URL(
    '../app/(protected)/operations/activities/instances/[instanceId]/page.tsx',
    import.meta.url,
  ),
  'utf8',
);
const editorPage = readFileSync(
  new URL('../app/(protected)/operations/activities/editor/page.tsx', import.meta.url),
  'utf8',
);
const settingsPage = readFileSync(
  new URL('../app/(protected)/operations/activities/settings/page.tsx', import.meta.url),
  'utf8',
);
const actions = readFileSync(
  new URL('../app/actions/cooperative-activities.ts', import.meta.url),
  'utf8',
);
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

describe('administrator cooperative activity area', () => {
  it('separates read, audit, edit, lifecycle, preview, and settings permissions', () => {
    expect(listPage).toContain("requireAuthorizedAdmin('cooperative_activities.read')");
    expect(listPage).toContain("'cooperative_activities.audit.read'");
    expect(editorPage).toContain("'cooperative_activities.edit'");
    expect(editorPage).toContain("'cooperative_activities.preview'");
    expect(settingsPage).toContain("'cooperative_activities.settings.edit'");
    for (const permission of [
      'cooperative_activities.validate',
      'cooperative_activities.review',
      'cooperative_activities.publish',
    ]) {
      expect(actions).toContain(permission);
    }
  });

  it('keeps completed evidence immutable and exposes no arbitrary reward or balance mutation', () => {
    expect(listPage).toContain('immutable completion receipts');
    expect(instancePage).toContain('Immutable reward receipts');
    for (const forbidden of [
      'grantReward',
      'adjustDust',
      'mutateInventory',
      'forceComplete',
      'walletAddress',
      'emailAddress',
    ]) {
      expect(listPage).not.toContain(forbidden);
      expect(instancePage).not.toContain(forbidden);
      expect(editorPage).not.toContain(forbidden);
    }
  });

  it('uses a closed structured editor and non-persistent reward-free preview', () => {
    expect(editorPage).toContain('no raw JSON, script, SQL, formula');
    expect(editorPage).toContain('Preview Mode · no persistence · no rewards');
    expect(editorPage).toContain('activity.objectives.map');
    expect(actions).toContain("items: [{ itemSlug: 'moonbean'");
  });

  it('supports bounded pagination and responsive activity panels', () => {
    for (const pageSize of ['10', '50', '100']) expect(listPage).toContain(`value="${pageSize}"`);
    expect(styles).toContain('.activity-admin-status');
    expect(styles).toContain('.activity-editor-form');
    expect(styles).toContain('@media (max-width: 820px)');
  });
});
