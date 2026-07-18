/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { AVATAR_VISUAL_ACCEPTANCE_VIEWPORTS } from './matrix';
import {
  PHASE11A_PREVIEW_API_PREFIX,
  phase11aPreviewApi,
  phase11aPreviewSlice,
  phase11bWorkstationWorkspace,
} from './phase11a-preview';

const visualAcceptanceSource = readFileSync(
  resolve(process.cwd(), 'src/visual-acceptance/main.tsx'),
  'utf8',
);
const adminAcceptanceSource = readFileSync(
  resolve(process.cwd(), 'src/visual-acceptance/phase11a-admin.tsx'),
  'utf8',
);
const craftingAdminAcceptanceSource = readFileSync(
  resolve(process.cwd(), 'src/visual-acceptance/phase11b-admin.tsx'),
  'utf8',
);

describe('Phase 11A responsive acceptance fixtures', () => {
  it('covers the exact required phone, tablet, landscape, desktop, and wide viewports', () => {
    expect(AVATAR_VISUAL_ACCEPTANCE_VIEWPORTS).toEqual([
      [360, 800],
      [390, 844],
      [768, 1024],
      [820, 1180],
      [1024, 768],
      [1280, 800],
      [1440, 900],
      [1920, 1080],
    ]);
  });

  it('renders all eight garden tiles and representative crop lifecycle states', () => {
    expect(phase11aPreviewSlice.plot.tiles).toHaveLength(8);
    expect(phase11aPreviewSlice.plot.tiles.map((tile) => tile.state)).toEqual([
      'empty',
      'prepared',
      'planted',
      'growing',
      'mature',
      'empty',
      'empty',
      'empty',
    ]);
    expect(phase11aPreviewSlice.inventory.stacks.map((stack) => stack.item.slug)).toEqual([
      'starter-hoe',
      'starter-watering-can',
      'moonbean-seed',
      'moonbean',
    ]);
    expect(phase11aPreviewSlice.quest.objectives).toHaveLength(9);
    expect(phase11aPreviewSlice.plot.workstations).toHaveLength(2);
  });

  it('serves only the local bootstrap and read endpoints needed by the real gameplay panel', () => {
    expect(phase11aPreviewApi(`${PHASE11A_PREVIEW_API_PREFIX}/bootstrap`, 'POST')).toBeDefined();
    for (const path of ['inventory', 'farm', 'items', 'home', 'vertical-slice']) {
      expect(phase11aPreviewApi(`${PHASE11A_PREVIEW_API_PREFIX}/${path}`, 'GET')).toBeDefined();
    }
    expect(
      phase11aPreviewApi(
        `${PHASE11A_PREVIEW_API_PREFIX}/workstations/${phase11bWorkstationWorkspace.workstation.id}`,
        'GET',
      ),
    ).toEqual(phase11bWorkstationWorkspace);
    expect(phase11aPreviewApi(`${PHASE11A_PREVIEW_API_PREFIX}/farm/plant`, 'POST')).toBeUndefined();
    expect(phase11aPreviewApi('/api/v1/unrelated', 'GET')).toBeUndefined();

    expect(visualAcceptanceSource).toContain("panel === 'farming'");
    expect(visualAcceptanceSource).toContain("panel === 'cooking'");
    expect(visualAcceptanceSource).toContain(
      'requestUrl.pathname.startsWith(PHASE11A_PREVIEW_API_PREFIX)',
    );
    expect(visualAcceptanceSource).toContain("code: 'visual_acceptance_read_only'");
    expect(visualAcceptanceSource).toContain('{ status: 405');
  });

  it('keeps the administrator fixture local, explicit, and mutation-disabled', () => {
    expect(adminAcceptanceSource).toContain('Local read-only responsive fixture');
    expect(adminAcceptanceSource).toContain('it performs no API or database requests');
    expect(adminAcceptanceSource).not.toContain('fetch(');
    expect(adminAcceptanceSource.match(/<button disabled/gu)).toHaveLength(4);
    expect(adminAcceptanceSource).toContain('Save audited item revision');
    expect(adminAcceptanceSource).toContain('Validate and activate successor');
    expect(adminAcceptanceSource).toContain('Publish quest successor');
    expect(craftingAdminAcceptanceSource).toContain('Cooking and crafting');
    expect(craftingAdminAcceptanceSource).toContain('performs no API or database requests');
    expect(craftingAdminAcceptanceSource).not.toContain('fetch(');
    expect(craftingAdminAcceptanceSource).toContain('Create immutable successor');
    expect(craftingAdminAcceptanceSource).toContain('Request bounded reconciliation');
    expect(craftingAdminAcceptanceSource.match(/<button disabled/gu)).toHaveLength(4);
  });
});
