import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./maintenance-control.tsx', import.meta.url), 'utf8');
const actionSource = readFileSync(
  new URL('../app/actions/live-operations.ts', import.meta.url),
  'utf8',
);
const pageSource = readFileSync(
  new URL('../app/(protected)/operations/live/page.tsx', import.meta.url),
  'utf8',
);

describe('maintenance control scheduling UX and submit safety', () => {
  it('keeps datetime seeds hydration-safe with UTC before mount', () => {
    expect(source).toContain('utcInput');
    expect(source).toContain('hasMounted');
    expect(source).toContain('toISOString().slice(0, 16)');
    expect(source).toContain('setHasMounted(true)');
  });

  it('uses explicit activation modes instead of blank-start inference alone', () => {
    expect(source).toContain("activationMode === 'immediate'");
    expect(source).toContain("activationMode === 'scheduled'");
    expect(source).toContain('Start immediately');
    expect(source).toContain('Schedule for later');
    expect(source).toContain('name="activationMode"');
    expect(source).toContain('Starts immediately');
    expect(source).toContain('schedule-status-callout');
    expect(source).toContain('Maintenance will begin as soon as you review and confirm');
    expect(source).toContain('role="radio"');
    expect(source).toContain("onClick={() => selectActivationMode('scheduled')}");
  });

  it('keeps activation mode selectable before enable is turned on', () => {
    expect(source).toContain('disabled={!canManage || pending}');
    expect(source).not.toContain('disabled={!canManage || pending || !enabled}');
    expect(source).toContain('Choose a start mode now');
  });

  it('hides scheduled start in immediate mode and does not leave stale submit values', () => {
    expect(source).toContain("if (mode === 'immediate') setScheduledStartAt('')");
    expect(source).toContain("activationMode === 'immediate' ? (");
    expect(source).toContain('name="scheduledStartAt"');
  });

  it('forces auto-disable off without an expected end', () => {
    expect(source).toContain('!hasExpectedEnd && autoDisableAtEnd');
    expect(source).toContain('disabled={!canManage || pending || !hasExpectedEnd}');
    expect(source).toContain('Add an expected end time to enable automatic maintenance shutdown.');
  });

  it('does not disable reason/confirmation inputs while submitting', () => {
    expect(source).toContain('readOnly={pending}');
    expect(source).not.toMatch(/name="reason"[\s\S]{0,120}disabled=\{(?:submitting|pending)\}/u);
    expect(source).not.toMatch(
      /name="confirmation"[\s\S]{0,120}disabled=\{(?:submitting|pending)\}/u,
    );
  });

  it('submits explicit true/false booleans rather than relying only on checkbox presence', () => {
    expect(source).toContain("value={enabled ? 'true' : 'false'}");
    expect(source).toContain("value={autoDisableAtEnd ? 'true' : 'false'}");
    expect(source).toContain("value={showReturnToLanding ? 'true' : 'false'}");
  });

  it('highlights authoritative active/live status without redundant copy', () => {
    expect(source).toContain('maintenance-status-banner');
    expect(source).toContain('Authoritative game access');
    expect(source).toContain("tone: 'active'");
    expect(source).toContain("tone: 'live'");
    expect(source).toContain('Players are blocked from entering the playable world.');
    expect(source).toContain('Normal entry is open');
    expect(source).not.toContain('Current server state:');
    expect(pageSource).toContain('live-ops-header-status');
  });

  it('shows unsaved draft feedback and confirmation summaries', () => {
    expect(source).toContain('Unsaved draft');
    expect(source).toContain('Edits do not apply yet');
    expect(source).toContain('Update Maintenance');
    expect(source).toContain('Review maintenance update');
    expect(source).toContain('draftIntent');
    expect(source).toContain('Start UTC');
    expect(source).toContain('Automatic shutdown');
  });

  it('surfaces field-level and form-level validation feedback without silent-only redirects', () => {
    expect(source).toContain('form-error-summary');
    expect(source).toContain('Nothing was saved — fix these items first');
    expect(source).toContain('What to do next');
    expect(source).toContain('How to apply a change');
    expect(source).toContain('Click to expand step-by-step instructions');
    expect(source).toContain('maintenance-howto__chevron');
    expect(source).toContain('buildMaintenanceHelpSteps');
    expect(source).toContain('maintenanceFieldLabel');
    expect(source).toContain('field-error');
    expect(source).toContain('useActionState');
    expect(actionSource).toContain('parseMaintenanceFormData');
    expect(actionSource).toContain("outcome: 'error'");
    expect(actionSource).toContain("outcome: 'success'");
    expect(actionSource).toContain('fieldErrors');
    expect(actionSource).not.toContain("notice: 'invalid-maintenance'");
    const maintenanceActionBody = actionSource.slice(
      actionSource.indexOf('export async function updateMaintenanceAction'),
      actionSource.indexOf('export async function saveAnnouncementAction'),
    );
    expect(maintenanceActionBody).not.toMatch(/^\s*redirect\(/mu);
    expect(maintenanceActionBody).toContain("outcome: 'success'");
    expect(maintenanceActionBody).toContain('revalidatePath');
    expect(source).toContain('router.replace');
    expect(source).toContain('router.refresh');
    expect(pageSource).toContain('Maintenance was not saved');
  });

  it('keeps return-to-landing independent from optional custom CTA pairing', () => {
    expect(source).toContain('Custom CTA label');
    expect(source).toContain('Custom CTA URL');
    expect(source).toContain('Show return-to-landing action');
    expect(source).toContain('remain optional');
  });
});
