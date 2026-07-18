import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const panel = readFileSync(
  resolve(process.cwd(), 'src/components/HousingWorkspacePanel.tsx'),
  'utf8',
);
const client = readFileSync(resolve(process.cwd(), 'src/app/housing-client.ts'), 'utf8');
const cozy = readFileSync(resolve(process.cwd(), 'src/components/CozyGameplay.tsx'), 'utf8');
const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
const visualAcceptance = readFileSync(
  resolve(process.cwd(), 'src/visual-acceptance/main.tsx'),
  'utf8',
);

describe('Phase 11E housing workspace', () => {
  it('uses an explicit local Decoration Mode with undo, redo, validation, save, and discard', () => {
    for (const behavior of [
      'createHousingLocalDraft',
      'updateHousingDraft',
      'undoHousingDraft',
      'redoHousingDraft',
      'validateHousingLayout',
      'saveHousingLayout',
      'selectedPlacementIndex',
      'setDraft(createHousingLocalDraft(value))',
      'Unsaved decoration changes were discarded.',
      'Unsaved home changes',
      "window.addEventListener('beforeunload'",
    ]) {
      expect(panel).toContain(behavior);
    }
    expect(panel).toContain('Changes stay local until Save layout.');
    expect(cozy).not.toContain('placeFurniture(');
    expect(cozy).not.toContain('moveFurniture(');
    expect(cozy).not.toContain('removeFurniture(');
  });

  it('supports outdoor placement and truthfully disables the missing indoor renderer', () => {
    expect(panel).toContain("zone.type === 'outdoor_ground'");
    expect(panel).toContain('Outdoor placement is fully supported.');
    expect(panel).toContain('Indoor floor and wall zones remain disabled');
    expect(panel).toContain('No unlocked zone accepts this furniture.');
  });

  it('keeps storage, upgrades, immutable history, and Game Test visible and safe', () => {
    for (const behavior of [
      'transferHomeStorage',
      'purchaseHomeUpgrade',
      'Immutable layout history',
      'Restoring a revision creates a new revision; history is never edited.',
      'Restore as New Layout Draft',
      'createHousingRestorationDraft',
      'simulateGameTestLayout',
      'simulateGameTestStorageTransfer',
      'simulateGameTestUpgrade',
      'Nothing will be saved.',
    ]) {
      expect(panel).toContain(behavior);
    }
    expect(client).toContain('/housing/game-test');
    expect(client).toContain('housingLayoutRevisionInspectionSchema');
    expect(client).not.toContain('/housing/game-test/save');
  });

  it('shows authoritative tutorial progress and accessible selected-placement details', () => {
    expect(panel).toContain('Home Sweet Home tutorial');
    expect(panel).toContain('workspace.tutorial.objectives');
    expect(panel).toContain('Selected furniture inspector');
    expect(panel).toContain('Coordinates');
    expect(panel).toContain('Placement validity is confirmed by the server');
  });

  it('preserves responsive, keyboard, status, and reduced-motion affordances', () => {
    expect(panel).toContain('role="toolbar"');
    expect(panel).toContain('aria-live="polite"');
    expect(panel).toContain('role="alert"');
    expect(panel).toContain('aria-pressed={selected}');
    expect(styles).toContain('@media (max-width: 850px)');
    expect(styles).toContain('@media (max-width: 540px)');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(visualAcceptance).toContain("panel === 'housing'");
    expect(visualAcceptance).toContain('housingLocalFixture');
    expect(visualAcceptance).toContain(
      'Phase 11E visual acceptance does not send housing mutations.',
    );
  });
});
