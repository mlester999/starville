import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const launcher = readFileSync(new URL('./world-game-test-launcher.tsx', import.meta.url), 'utf8');
const actions = readFileSync(new URL('../app/actions/world-game-test.ts', import.meta.url), 'utf8');
const editor = readFileSync(new URL('./world-editor.tsx', import.meta.url), 'utf8');
const editorPage = readFileSync(
  new URL('../app/(protected)/worlds/[mapId]/editor/page.tsx', import.meta.url),
  'utf8',
);
const revisionPage = readFileSync(
  new URL('../app/(protected)/worlds/[mapId]/revisions/[versionId]/page.tsx', import.meta.url),
  'utf8',
);

describe('administrator Open in Game Test workflow', () => {
  it('shows explicit readiness checklist reasons and opens only an exact validated saved revision', () => {
    expect(launcher).toContain('buildGameTestReadiness');
    expect(launcher).toContain('data-game-test-readiness');
    expect(launcher).toContain('Game Test readiness');
    expect(launcher).toContain('verify-authenticator');
    expect(launcher).toContain('setup-authenticator');
    expect(launcher).toContain('authenticatorEnrolled');
    expect(launcher).toContain('/mfa-required');
    expect(launcher).toContain('item.actionLabel');
    expect(editor).toContain('<WorldGameTestLauncher');
    expect(editor).toContain('validated={preview.canPreview}');
    expect(editor).toContain('authenticatorEnrolled={props.authenticatorEnrolled}');
    expect(launcher).toContain('expectedEditVersion: props.editVersion');
    expect(launcher).toContain('expectedChecksum: props.checksum');
    expect(launcher).toContain('test_outdated');
    expect(launcher).toContain('Active or unexchanged sessions');
    expect(launcher).toContain('Reopen current cookie session');
    expect(launcher).not.toContain('Game Test requires a current AAL2 session.');
  });

  it('keeps the opaque grant in the URL fragment and constrains the return path', () => {
    expect(actions).toContain("new URL('/preview/world', config.gameUrl)");
    expect(actions).toContain('launch.hash = new URLSearchParams');
    expect(actions).not.toContain('launch.searchParams.set');
    expect(actions).toContain('const returnPath = parsed.data.returnPath');
    expect(actions).toContain('.regex(/^\\/(?!\\/)/u)');
    expect(launcher).toContain('returnPath: props.returnPath');
  });

  it('records explicit revision-bound evidence without auto-passing or publishing', () => {
    expect(launcher).toContain('movement_camera');
    expect(launcher).toContain('collision_depth');
    expect(launcher).toContain('no_progression');
    expect(launcher).toContain("['passed', 'failed', 'blocked', 'needs_changes']");
    expect(actions).toContain('recordWorldGameTestEvidence');
    expect(actions).toContain('Publication remains a separate action.');
    expect(actions).not.toContain('publishWorldDraft');
  });

  it('adds deterministic Phase 12C visual modes without persisting local review state', () => {
    expect(launcher).toContain('data-phase12c-review="local-only"');
    expect(launcher).toContain('WORLD_VISUAL_REVIEW_MODES');
    expect(launcher).toContain('WORLD_VISUAL_REVIEW_CHECKS');
    expect(launcher).toContain('Deterministic visual fixture');
    expect(launcher).toContain('reset on reload');
    expect(launcher).toContain('not sent with the');
    expect(launcher).toContain('checklist: checks');
    expect(launcher).not.toContain('checklist: visualChecks');
    expect(launcher).not.toContain('localStorage');
    expect(launcher).not.toContain('sessionStorage');
  });

  it('uses an accessible confirmation dialog and retains no raw launch URL in active state', () => {
    expect(launcher).toContain('aria-modal="true"');
    expect(launcher).toContain('aria-haspopup="dialog"');
    expect(launcher).toContain("event.key === 'Escape'");
    expect(launcher).toContain("event.key !== 'Tab'");
    expect(launcher).toContain('Open exact revision');
    expect(launcher).toContain("outcome: 'opened'");
    expect(launcher).toContain('reopenUrl: result.reopenUrl');
    expect(launcher).not.toContain('launchUrl: result.launchUrl');
  });

  it('recovers a returned active session for explicit evidence without carrying a bearer secret', () => {
    expect(launcher).toContain('props.returnedSessionId');
    expect(launcher).toContain("session.status === 'active'");
    expect(launcher).toContain('Game Test session returned to Admin.');
    expect(launcher).toContain('Game Tested evidence has');
    expect(launcher).toContain('not yet been recorded.');
    expect(launcher).toContain('boundedSessionDuration');
    expect(editorPage).toContain("searchParameters['gameTestSessionId']");
    expect(revisionPage).toContain("searchParameters['gameTestSessionId']");
    expect(editorPage).toContain('.uuid()');
    expect(revisionPage).toContain('.uuid()');
    expect(launcher).not.toContain('grantToken');
    expect(launcher).not.toContain('sessionToken');
  });
});
