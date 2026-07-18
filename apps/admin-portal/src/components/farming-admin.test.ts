import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync(
  new URL('../app/(protected)/game-content/farming/page.tsx', import.meta.url),
  'utf8',
);
const playerPage = readFileSync(
  new URL('../app/(protected)/players/[playerId]/page.tsx', import.meta.url),
  'utf8',
);
const action = readFileSync(new URL('../app/actions/farming.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('../lib/cozy-gameplay/api.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

describe('Phase 11A farming administrator experience', () => {
  it('separates inspection, player support, live operations, content, and reward authority', () => {
    expect(page).toContain("requireAuthorizedAdmin('farming.read')");
    expect(page).toContain("hasAdminPermission(context, 'farming.liveops')");
    expect(page).toContain("hasAdminPermission(context, 'farming.content_manage')");
    expect(page).toContain("hasAdminPermission(context, 'farming.reward_manage')");
    expect(action).toContain("requireAuthorizedAdmin('farming.liveops')");
    expect(action).toContain("requireAuthorizedAdmin('farming.content_manage')");
    expect(playerPage).toContain("hasAdminPermission(context, 'farming.player_read')");
    expect(api).toContain('/api/v1/admin/farming');
    expect(api).toContain("playerPath(playerId, 'farming')");
  });

  it('uses strict shared parsers and exposes no casual inventory, reward grant, or balance mutation', () => {
    expect(api).toContain('adminFarmingContentSchema.parse');
    expect(api).toContain('adminPlayerFarmingSchema.parse');
    expect(api).toContain('updateFarmingLiveOpsInputSchema.parse');
    expect(api).toContain('updateFarmingItemInputSchema.parse');
    expect(api).toContain('updateFarmingCropInputSchema.parse');
    expect(api).toContain('createFarmingPlotTemplateSuccessorInputSchema.parse');
    expect(api).toContain('createStarterQuestSuccessorInputSchema.parse');
    for (const forbidden of [
      'deleteItem',
      'deleteCrop',
      'grantInventory',
      'adjustDust',
      'completeQuest',
      'setPlayerBalance',
    ]) {
      expect(`${page}\n${action}\n${api}`).not.toContain(forbidden);
    }
  });

  it('preserves crop snapshots, existing homes, accepted quests, and canonical references', () => {
    expect(page).toMatch(/configuration\s+snapshot/u);
    expect(page).toContain('snapshot-pinned crop(s)');
    expect(page).toContain('does not delete crops');
    expect(page).toMatch(/Existing player homes are not\s+rewritten/u);
    expect(page).toContain('Existing accepted quests stay pinned');
    expect(page).toContain('Append-only farming configuration audit');
    expect(page).toContain('referenceImpact');
  });

  it('keeps management bounded, revision-aware, audited, successor-only, and responsive', () => {
    expect(action).toContain('expectedRevision');
    expect(action).toContain('expectedContentVersion');
    expect(action).toContain('expectedConfigurationRevision');
    expect(action).toContain('expectedTemplateVersion');
    expect(action).toContain('expectedVersionNumber');
    expect(action).toContain('updateFarmingLiveOpsInputSchema.safeParse');
    expect(page).toContain('Create validated successor');
    expect(page).toContain('Create immutable successor');
    expect(page).toContain('separate farming reward permission');
    expect(page).toContain('maxLength={280}');
    expect(page).toContain('maxLength={500}');
    expect(page).toContain('minLength={12}');
    expect(styles).toContain('.farming-live-ops-form');
    expect(styles).toContain('.farming-content-form');
    expect(styles).toMatch(
      /@media \(max-width: 720px\)[\s\S]*\.farming-live-ops-form,[\s\S]*\.farming-content-form/u,
    );
  });
});
