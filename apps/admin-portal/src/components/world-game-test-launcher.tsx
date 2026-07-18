'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import {
  openWorldGameTestAction,
  recordWorldGameTestEvidenceAction,
  revokeWorldGameTestAction,
  type WorldGameTestActionState,
} from '../app/actions/world-game-test';
import type { WorldGameTestStatus } from '../lib/worlds/game-test-api';
import { buildGameTestReadiness } from '../lib/worlds/editor-usability';

interface WorldGameTestLauncherProps {
  readonly mapId: string;
  readonly versionId: string;
  readonly versionNumber: number;
  readonly editVersion: number;
  readonly checksum: string | null;
  readonly dirty: boolean;
  readonly validated: boolean;
  readonly canPreview: boolean;
  readonly assuranceLevel: 'aal1' | 'aal2';
  /** True when the administrator has at least one verified TOTP factor. */
  readonly authenticatorEnrolled: boolean;
  readonly mapDisplayName: string;
  readonly activePublishedVersionId: string | null;
  readonly environment: string;
  readonly reopenUrl: string;
  readonly initialStatus: WorldGameTestStatus | null;
  readonly returnedSessionId: string | null;
  readonly returnPath: string;
  readonly onRequestSave?: () => void;
  readonly onRequestValidate?: () => void;
}

const CHECKS = [
  ['world_loaded', 'World loaded successfully'],
  ['correct_revision', 'Correct draft revision displayed'],
  ['spawn_valid', 'Spawn is valid'],
  ['movement_camera', 'Movement, jogging, and camera'],
  ['collision_depth', 'Collision and depth sorting'],
  ['exits_reachable', 'Exits are reachable but stay disabled'],
  ['player_not_stuck', 'Player cannot become stuck'],
  ['visual_overlap', 'No major visual overlap'],
  ['mobile_usable', 'Mobile view remains usable'],
  ['objects_assets', 'Objects and pinned assets'],
  ['scale_anchor', 'Asset scale and foot anchors are grounded'],
  ['interaction_access', 'Inspection points are accessible'],
  ['marker_fallback', 'Any marker fallback is understood'],
  ['no_progression', 'No progression or durable writes'],
] as const;

interface EvidenceSession {
  readonly id: string;
  readonly createdAt: string;
  readonly exchangedAt: string | null;
  readonly expiresAt: string;
  readonly environment: string;
  readonly reopenUrl: string;
  readonly returned: boolean;
}

function boundedSessionDuration(session: EvidenceSession, now: number): string {
  const start = Date.parse(session.exchangedAt ?? session.createdAt);
  const expiry = Date.parse(session.expiresAt);
  if (!Number.isFinite(start) || !Number.isFinite(expiry) || expiry <= start) {
    return 'bounded by the session expiry';
  }
  const elapsed = Math.max(0, Math.min(now, expiry) - start);
  const minutes = Math.ceil(elapsed / 60_000);
  return minutes === 0 ? 'under 1 minute' : `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

export function WorldGameTestLauncher(props: WorldGameTestLauncherProps) {
  const router = useRouter();
  const readiness = useMemo(
    () =>
      buildGameTestReadiness({
        dirty: props.dirty,
        validated: props.validated,
        canPreview: props.canPreview,
        assuranceLevel: props.assuranceLevel,
        authenticatorEnrolled: props.authenticatorEnrolled,
        checksum: props.checksum,
        statusLoaded: props.initialStatus !== null,
      }),
    [
      props.dirty,
      props.validated,
      props.canPreview,
      props.assuranceLevel,
      props.authenticatorEnrolled,
      props.checksum,
      props.initialStatus,
    ],
  );
  const readyCode = readiness.canOpen ? 'READY' : (readiness.primaryBlocker?.id ?? 'BLOCKED');
  const returnedSession =
    props.returnedSessionId === null
      ? undefined
      : props.initialStatus?.activeSessions.find(
          (session) => session.id === props.returnedSessionId && session.status === 'active',
        );
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<WorldGameTestActionState>();
  const [evidenceSession, setEvidenceSession] = useState<EvidenceSession | null>(() =>
    returnedSession === undefined
      ? null
      : {
          ...returnedSession,
          environment: props.environment,
          reopenUrl: props.reopenUrl,
          returned: true,
        },
  );
  const [returnedDuration, setReturnedDuration] = useState('bounded by the session expiry');
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [activeSessions, setActiveSessions] = useState(
    () => props.initialStatus?.activeSessions ?? [],
  );
  const opener = useRef<HTMLElement | null>(null);
  const dialog = useRef<HTMLElement | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CHECKS.map(([key]) => [key, false])),
  );

  useEffect(() => {
    if (evidenceSession?.returned !== true) return;
    setReturnedDuration(boundedSessionDuration(evidenceSession, Date.now()));
  }, [evidenceSession]);

  useEffect(() => {
    if (!confirmationOpen) return;
    const node = dialog.current;
    const focusable = () => [
      ...(node?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]') ?? []),
    ];
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) {
        event.preventDefault();
        setConfirmationOpen(false);
        window.setTimeout(() => opener.current?.focus(), 0);
        return;
      }
      if (event.key !== 'Tab') return;
      const targets = focusable();
      const first = targets[0];
      const last = targets.at(-1);
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [confirmationOpen, pending]);

  function closeConfirmation() {
    setConfirmationOpen(false);
    window.setTimeout(() => opener.current?.focus(), 0);
  }

  function launch() {
    const previewWindow = window.open('about:blank', '_blank');
    if (previewWindow !== null) {
      previewWindow.opener = null;
      previewWindow.document.title = 'Opening secure Starville Game Test…';
    }
    startTransition(async () => {
      const result = await openWorldGameTestAction({
        mapId: props.mapId,
        versionId: props.versionId,
        expectedEditVersion: props.editVersion,
        expectedChecksum: props.checksum,
        returnPath: props.returnPath,
      });
      if (result.outcome === 'launch_ready') {
        if (previewWindow === null) window.location.assign(result.launchUrl);
        else previewWindow.location.replace(result.launchUrl);
        setState({
          outcome: 'opened',
          sessionId: result.sessionId,
          expiresAt: result.expiresAt,
          environment: result.environment,
          reopenUrl: result.reopenUrl,
        });
        setEvidenceSession({
          id: result.sessionId,
          createdAt: new Date().toISOString(),
          exchangedAt: null,
          expiresAt: result.expiresAt,
          environment: result.environment,
          reopenUrl: result.reopenUrl,
          returned: false,
        });
        setActiveSessions((current) => [
          {
            id: result.sessionId,
            status: 'issued',
            createdAt: new Date().toISOString(),
            expiresAt: result.expiresAt,
            exchangedAt: null,
            gameClientBuild: null,
          },
          ...current.filter((session) => session.id !== result.sessionId),
        ]);
        closeConfirmation();
      } else {
        setState(result);
        previewWindow?.close();
      }
    });
  }

  function record(result: 'passed' | 'failed' | 'blocked' | 'needs_changes') {
    if (evidenceSession === null) return;
    startTransition(async () => {
      const recorded = await recordWorldGameTestEvidenceAction({
        sessionId: evidenceSession.id,
        result,
        checklist: checks,
        notes,
      });
      setState(recorded);
      if (recorded.outcome === 'recorded') setEvidenceSession(null);
    });
  }

  function revoke(sessionId: string) {
    startTransition(async () => {
      const result = await revokeWorldGameTestAction(sessionId);
      setState(result);
      if (result.outcome === 'revoked') {
        setActiveSessions((current) => current.filter((session) => session.id !== sessionId));
        if (evidenceSession?.id === sessionId) setEvidenceSession(null);
      }
    });
  }

  function runReadinessAction(action: (typeof readiness.items)[number]['action']): void {
    if (action.kind === 'save') {
      props.onRequestSave?.();
      return;
    }
    if (action.kind === 'validate') {
      props.onRequestValidate?.();
      return;
    }
    if (action.kind === 'refresh-status') {
      router.refresh();
      return;
    }
  }

  return (
    <div
      className="world-game-test-launcher"
      data-game-test-state={readyCode}
      data-tour-id="test-actions"
    >
      <button
        aria-expanded={confirmationOpen}
        aria-haspopup="dialog"
        className={`button ${readiness.canOpen ? 'button--primary' : 'button--secondary'}`}
        disabled={!readiness.canOpen || pending}
        onClick={(event) => {
          opener.current = event.currentTarget;
          setConfirmationOpen(true);
        }}
        title={
          readiness.canOpen
            ? 'Open the exact validated revision in a private Game Test session'
            : (readiness.primaryBlocker?.detail ?? 'Game Test is not ready')
        }
        type="button"
      >
        {pending ? 'Opening…' : 'Open in Game Test'}
      </button>

      <section
        aria-label="Game Test readiness"
        className="world-game-test-readiness"
        data-game-test-readiness="true"
      >
        <h3 className="world-game-test-readiness__title">Game Test readiness</h3>
        <ul className="world-game-test-readiness__list">
          {readiness.items.map((item) => (
            <li
              className={`world-game-test-readiness__item ${item.ready ? 'is-ready' : 'is-blocked'}`}
              data-readiness-id={item.id}
              data-ready={item.ready ? 'true' : 'false'}
              key={item.id}
            >
              <span aria-hidden="true" className="world-game-test-readiness__icon">
                {item.ready ? '✓' : '!'}
              </span>
              <div className="world-game-test-readiness__copy">
                <strong>{item.label}</strong>
                <p>{item.detail}</p>
                {item.technicalDetail ? (
                  <details className="world-game-test-readiness__technical">
                    <summary>Technical details</summary>
                    <p>{item.technicalDetail}</p>
                  </details>
                ) : null}
                {item.action.kind === 'verify-authenticator' ||
                item.action.kind === 'setup-authenticator' ? (
                  <Link className="button button--quiet" href="/mfa-required">
                    {item.actionLabel}
                  </Link>
                ) : null}
                {item.actionLabel !== null &&
                item.action.kind !== 'verify-authenticator' &&
                item.action.kind !== 'setup-authenticator' &&
                item.action.kind !== 'none' ? (
                  <button
                    className="button button--quiet"
                    onClick={() => runReadinessAction(item.action)}
                    type="button"
                  >
                    {item.actionLabel}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        <p aria-live="polite" className="world-game-test-launcher__status">
          {readiness.canOpen
            ? props.initialStatus === null
              ? 'Exact validated revision is ready. Game Test status unavailable — refresh if needed.'
              : 'Exact validated revision is ready for Game Test.'
            : (readiness.primaryBlocker?.detail ?? 'Complete the readiness checklist to continue.')}
        </p>
      </section>

      <details className="world-game-test-status-summary">
        <summary>
          Game Test:{' '}
          {props.initialStatus?.gameTestStatus.replaceAll('_', ' ') ?? 'status unavailable'}
        </summary>
        <dl>
          <div>
            <dt>Draft</dt>
            <dd>
              Version {props.versionNumber} · revision {props.editVersion} ·{' '}
              {props.dirty ? 'Unsaved' : 'Saved'}
            </dd>
          </div>
          <div>
            <dt>Last tested</dt>
            <dd>
              {props.initialStatus?.latestEvidence === null || props.initialStatus === null
                ? 'Not tested for this revision'
                : `${new Date(props.initialStatus.latestEvidence.recordedAt).toLocaleString()} by ${props.initialStatus.latestEvidence.testerDisplayName}`}
            </dd>
          </div>
          <div>
            <dt>Public revision</dt>
            <dd>{props.activePublishedVersionId ?? 'None'}</dd>
          </div>
        </dl>
        {props.initialStatus?.gameTestStatus === 'test_outdated' ? (
          <p>This draft changed after its last successful Game Test. Test this exact revision.</p>
        ) : null}
        {activeSessions.length === 0 ? null : (
          <div className="world-game-test-status-summary__sessions">
            <strong>Active or unexchanged sessions</strong>
            {activeSessions.some((session) => session.status === 'active') ? (
              <a
                className="button button--quiet"
                href={props.reopenUrl}
                rel="noreferrer"
                target="_blank"
              >
                Reopen current cookie session
              </a>
            ) : null}
            {activeSessions.map((session) => (
              <div key={session.id}>
                <span>
                  {session.status} · expires {new Date(session.expiresAt).toLocaleTimeString()}
                </span>
                <button
                  className="button button--quiet"
                  disabled={pending}
                  onClick={() => revoke(session.id)}
                  type="button"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </details>
      {confirmationOpen ? (
        <div
          className="world-game-test-modal-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !pending) closeConfirmation();
          }}
          role="presentation"
        >
          <section
            aria-describedby="world-game-test-description"
            aria-labelledby="world-game-test-title"
            aria-modal="true"
            className="world-game-test-modal"
            ref={dialog}
            role="dialog"
          >
            <p className="operations-eyebrow">Private real-client validation</p>
            <h2 id="world-game-test-title">Open in Game Test</h2>
            <p id="world-game-test-description">
              This opens the exact saved revision in the real Starville renderer. It does not
              publish the draft or make it visible to public players.
            </p>
            <dl>
              <div>
                <dt>World</dt>
                <dd>{props.mapDisplayName}</dd>
              </div>
              <div>
                <dt>Draft</dt>
                <dd>
                  Version {props.versionNumber} · revision {props.editVersion}
                </dd>
              </div>
              <div>
                <dt>Currently public</dt>
                <dd>{props.activePublishedVersionId ?? 'No published revision'}</dd>
              </div>
              <div>
                <dt>Environment</dt>
                <dd>{props.environment}</dd>
              </div>
              <div>
                <dt>Session</dt>
                <dd>20 minutes · private solo realtime</dd>
              </div>
            </dl>
            <p className="world-game-test-modal__warning">
              Rewards, DUST, inventory, progression, public chat, parties, trades, and world
              transitions are disabled.
            </p>
            {state?.outcome === 'error' ? (
              <p className="world-game-test-launcher__error" role="alert">
                {state.code}: {state.message}
              </p>
            ) : null}
            <div className="world-game-test-modal__actions">
              <button
                className="button button--quiet"
                disabled={pending}
                onClick={closeConfirmation}
                type="button"
              >
                Cancel
              </button>
              <button
                className="button button--primary"
                disabled={pending}
                onClick={launch}
                type="button"
              >
                {pending ? 'Preparing secure session…' : 'Open exact revision'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {state?.outcome === 'error' ? (
        <p className="world-game-test-launcher__error" role="alert">
          {state.code}: {state.message}
        </p>
      ) : null}
      {evidenceSession !== null ? (
        <section className="world-game-test-evidence" aria-label="Game Test evidence">
          {evidenceSession.returned ? (
            <p role="status">
              Game Test session returned to Admin. Tested world: {props.mapDisplayName}. Tested
              revision: {props.editVersion}. Duration: {returnedDuration}. Game Tested evidence has
              not yet been recorded.
            </p>
          ) : (
            <p>
              Game Test opened in a new tab for version {props.versionNumber}, revision{' '}
              {props.editVersion}. Expires{' '}
              {new Date(evidenceSession.expiresAt).toLocaleTimeString()}. This draft remains
              unpublished.
            </p>
          )}
          <div className="world-game-test-evidence__session-actions">
            <a
              className="button button--quiet"
              href={evidenceSession.reopenUrl}
              rel="noreferrer"
              target="_blank"
            >
              Reopen active session
            </a>
            <span>Environment: {evidenceSession.environment}</span>
          </div>
          <div className="world-game-test-evidence__checks">
            {CHECKS.map(([key, label]) => (
              <label key={key}>
                <input
                  checked={checks[key] === true}
                  onChange={(event) =>
                    setChecks((current) => ({ ...current, [key]: event.target.checked }))
                  }
                  type="checkbox"
                />
                {label}
              </label>
            ))}
          </div>
          <label>
            Test notes
            <textarea
              maxLength={2000}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Record what was verified or what needs changes."
              value={notes}
            />
          </label>
          <div className="world-game-test-evidence__actions">
            {(['passed', 'failed', 'blocked', 'needs_changes'] as const).map((result) => (
              <button
                className="button button--quiet"
                disabled={pending || notes.trim().length === 0}
                key={result}
                onClick={() => record(result)}
                type="button"
              >
                {result.replace('_', ' ')}
              </button>
            ))}
            <button
              className="button button--quiet"
              disabled={pending}
              onClick={() => revoke(evidenceSession.id)}
              type="button"
            >
              Revoke session
            </button>
          </div>
        </section>
      ) : null}
      {state?.outcome === 'recorded' || state?.outcome === 'revoked' ? (
        <p className="world-game-test-launcher__notice" role="status">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
