'use client';

import type { AdminLiveOperations } from '@starville/live-operations';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useMemo, useRef, useState } from 'react';

import { updateMaintenanceAction } from '../app/actions/live-operations';
import {
  buildMaintenanceHelpSteps,
  defaultActivationMode,
  INITIAL_MAINTENANCE_ACTION_STATE,
  maintenanceFieldLabel,
  type MaintenanceActivationMode,
} from '../lib/live-operations/maintenance-form';

type Maintenance = AdminLiveOperations['maintenance'];

/** Timezone-stable datetime-local seed (UTC). Safe for SSR + first client paint. */
const utcInput = (value: string | null) => {
  if (value === null || Number.isNaN(new Date(value).valueOf())) return '';
  return new Date(value).toISOString().slice(0, 16);
};

/** Browser-local datetime-local value. Call only after mount. */
const localInput = (value: string | null) => {
  if (value === null || Number.isNaN(new Date(value).valueOf())) return '';
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatUtc = (value: string) => {
  if (value === '') return 'Not configured';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return 'Not configured';
  return date.toISOString();
};

const formatLocal = (value: string) => {
  if (value === '') return 'Not configured';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return 'Not configured';
  return date.toLocaleString();
};

function authorityStatus(maintenance: Maintenance): {
  readonly tone: 'active' | 'scheduled' | 'live' | 'error';
  readonly label: string;
  readonly detail: string;
} {
  if (maintenance.state === 'configuration_error') {
    return {
      tone: 'error',
      label: 'Configuration unavailable',
      detail: 'The trusted backend could not load maintenance state.',
    };
  }
  if (maintenance.state === 'scheduled' || (maintenance.enabled && !maintenance.active)) {
    return {
      tone: 'scheduled',
      label: 'Scheduled',
      detail: 'Maintenance is armed and will begin at the configured start time.',
    };
  }
  if (maintenance.active) {
    return {
      tone: 'active',
      label: 'ACTIVE',
      detail: 'Players are blocked from entering the playable world.',
    };
  }
  return {
    tone: 'live',
    label: 'LIVE',
    detail: 'Normal entry is open. Token, session, and moderation checks still apply.',
  };
}

export function MaintenanceControl({
  maintenance,
  canManage,
  requestId,
}: {
  readonly maintenance: Maintenance;
  readonly canManage: boolean;
  readonly requestId: string;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [actionState, formAction, pending] = useActionState(
    updateMaintenanceAction,
    INITIAL_MAINTENANCE_ACTION_STATE,
  );
  // Hydration-stable seed: only compare schedule presence, not wall-clock "now".
  const [activationMode, setActivationMode] = useState<MaintenanceActivationMode>(() =>
    maintenance.scheduledStartAt !== null ? 'scheduled' : 'immediate',
  );
  const [enabled, setEnabled] = useState(maintenance.enabled);
  const [title, setTitle] = useState(maintenance.title);
  const [message, setMessage] = useState(maintenance.message);
  const [updateDetails, setUpdateDetails] = useState(maintenance.updateDetails.join('\n'));
  const [expectedReturnMessage, setExpectedReturnMessage] = useState(
    maintenance.expectedReturnMessage ?? '',
  );
  // Seed with UTC slices so server HTML and first client render match.
  const [scheduledStartAt, setScheduledStartAt] = useState(() =>
    utcInput(maintenance.scheduledStartAt),
  );
  const [expectedEndAt, setExpectedEndAt] = useState(() => utcInput(maintenance.expectedEndAt));
  const [autoDisableAtEnd, setAutoDisableAtEnd] = useState(maintenance.autoDisableAtEnd);
  const [showReturnToLanding, setShowReturnToLanding] = useState(maintenance.showReturnToLanding);
  const [ctaLabel, setCtaLabel] = useState(maintenance.ctaLabel ?? '');
  const [ctaUrl, setCtaUrl] = useState(maintenance.ctaUrl ?? '');
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [hasMounted, setHasMounted] = useState(false);

  const fieldErrors = actionState.fieldErrors ?? {};
  const hasExpectedEnd = expectedEndAt.trim() !== '';
  const immediateActivation = enabled && activationMode === 'immediate';
  const validReason = reason.trim().length >= 12;
  const validConfirmation = !immediateActivation || confirmation === 'MAINTENANCE';
  const canSubmit = validReason && validConfirmation && !pending;

  const dirty = useMemo(() => {
    const baselineMode =
      maintenance.scheduledStartAt !== null
        ? defaultActivationMode({
            enabled: maintenance.enabled,
            scheduledStartAt: maintenance.scheduledStartAt,
          })
        : 'immediate';
    const baselineStart = hasMounted
      ? localInput(maintenance.scheduledStartAt)
      : utcInput(maintenance.scheduledStartAt);
    const baselineEnd = hasMounted
      ? localInput(maintenance.expectedEndAt)
      : utcInput(maintenance.expectedEndAt);
    return (
      enabled !== maintenance.enabled ||
      activationMode !== baselineMode ||
      title !== maintenance.title ||
      message !== maintenance.message ||
      updateDetails !== maintenance.updateDetails.join('\n') ||
      expectedReturnMessage !== (maintenance.expectedReturnMessage ?? '') ||
      scheduledStartAt !== baselineStart ||
      expectedEndAt !== baselineEnd ||
      autoDisableAtEnd !== maintenance.autoDisableAtEnd ||
      showReturnToLanding !== maintenance.showReturnToLanding ||
      ctaLabel !== (maintenance.ctaLabel ?? '') ||
      ctaUrl !== (maintenance.ctaUrl ?? '')
    );
  }, [
    activationMode,
    autoDisableAtEnd,
    ctaLabel,
    ctaUrl,
    enabled,
    expectedEndAt,
    expectedReturnMessage,
    hasMounted,
    maintenance,
    message,
    scheduledStartAt,
    showReturnToLanding,
    title,
    updateDetails,
  ]);

  useEffect(() => {
    setHasMounted(true);
    // After hydration, switch datetime fields to the administrator's local timezone.
    setScheduledStartAt(localInput(maintenance.scheduledStartAt));
    setExpectedEndAt(localInput(maintenance.expectedEndAt));
    setActivationMode(
      defaultActivationMode({
        enabled: maintenance.enabled,
        scheduledStartAt: maintenance.scheduledStartAt,
      }),
    );
  }, [maintenance]);

  useEffect(() => {
    if (!hasExpectedEnd && autoDisableAtEnd) setAutoDisableAtEnd(false);
  }, [autoDisableAtEnd, hasExpectedEnd]);

  useEffect(() => {
    if (actionState.outcome === 'error') {
      dialog.current?.close();
      const summary = document.getElementById('maintenance-form-errors');
      summary?.focus();
      summary?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    if (actionState.outcome === 'success') {
      dialog.current?.close();
      const notice = actionState.notice ?? 'maintenance-updated';
      router.replace(`/operations/live?notice=${notice}`);
      router.refresh();
    }
  }, [actionState, router]);

  function selectActivationMode(mode: MaintenanceActivationMode) {
    setActivationMode(mode);
    if (mode === 'immediate') setScheduledStartAt('');
  }

  function openReview() {
    setReason('');
    setConfirmation('');
    dialog.current?.showModal();
  }

  /** What this draft will do relative to the live server config. */
  const draftIntent = !enabled
    ? ('disable' as const)
    : maintenance.enabled
      ? ('update' as const)
      : ('enable' as const);

  const reviewTitle =
    draftIntent === 'disable'
      ? 'Disable Maintenance'
      : draftIntent === 'update'
        ? activationMode === 'scheduled'
          ? 'Update Scheduled Maintenance'
          : 'Update Maintenance'
        : activationMode === 'scheduled'
          ? 'Schedule Maintenance'
          : 'Enable Maintenance Immediately';

  const reviewSubmitLabel =
    draftIntent === 'disable'
      ? 'Disable Maintenance'
      : draftIntent === 'update'
        ? activationMode === 'scheduled'
          ? 'Update Schedule'
          : 'Update Maintenance'
        : activationMode === 'scheduled'
          ? 'Schedule Maintenance'
          : 'Enable Maintenance';

  const reviewButtonLabel =
    draftIntent === 'disable'
      ? 'Review disable maintenance'
      : draftIntent === 'update'
        ? 'Review maintenance update'
        : 'Review maintenance change';

  const newGameState =
    draftIntent === 'disable'
      ? 'Normal entry resumes'
      : draftIntent === 'update'
        ? activationMode === 'immediate'
          ? 'Maintenance stays active with the updated configuration'
          : 'Maintenance stays enabled and the schedule is updated'
        : activationMode === 'immediate'
          ? 'Maintenance will be enabled immediately'
          : 'Maintenance will be scheduled';

  const reviewBody =
    draftIntent === 'disable'
      ? 'Normal access resumes through existing token, session, suspension, and rename checks. Announcements are not deleted.'
      : draftIntent === 'update'
        ? 'These edits replace the live maintenance configuration after confirmation. They are not applied from the draft switch alone.'
        : 'New entry will be blocked and current clients will leave gameplay after reconciliation. Latest valid progress remains preserved.';

  const status = authorityStatus(maintenance);
  const scheduleMeta = [
    maintenance.scheduledStartAt
      ? `Starts ${hasMounted ? formatLocal(maintenance.scheduledStartAt) : formatUtc(maintenance.scheduledStartAt)}`
      : null,
    maintenance.expectedEndAt
      ? `Ends ${hasMounted ? formatLocal(maintenance.expectedEndAt) : formatUtc(maintenance.expectedEndAt)}`
      : null,
    `Revision ${maintenance.revision}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <form action={formAction} className="live-operations-form">
      <input name="requestId" type="hidden" value={requestId} />
      <input name="expectedRevision" type="hidden" value={maintenance.revision} />
      <input name="activationMode" type="hidden" value={activationMode} />
      {/* Explicit boolean serialization so unchecked switches submit as "false". */}
      <input name="enabled" type="hidden" value={enabled ? 'true' : 'false'} />
      <input name="autoDisableAtEnd" type="hidden" value={autoDisableAtEnd ? 'true' : 'false'} />
      <input
        name="showReturnToLanding"
        type="hidden"
        value={showReturnToLanding ? 'true' : 'false'}
      />

      <section
        className={`maintenance-status-banner maintenance-status-banner--${status.tone}`}
        aria-labelledby="maintenance-status-label"
      >
        <div className="maintenance-status-banner__pulse" aria-hidden="true" />
        <div className="maintenance-status-banner__copy">
          <p className="maintenance-status-banner__eyebrow">Authoritative game access</p>
          <h3 id="maintenance-status-label">{status.label}</h3>
          <p>{status.detail}</p>
          {scheduleMeta ? <p className="maintenance-status-banner__meta">{scheduleMeta}</p> : null}
        </div>
      </section>

      {actionState.outcome === 'success' ? (
        <div
          className="live-ops-notice live-ops-notice--success live-ops-notice--compact"
          role="status"
        >
          <strong>Saved</strong>
          <p>{actionState.message}</p>
        </div>
      ) : null}

      {actionState.outcome === 'error' ? (
        <div className="form-error-summary" id="maintenance-form-errors" role="alert" tabIndex={-1}>
          <strong>Nothing was saved — fix these items first</strong>
          <p>{actionState.message}</p>
          {Object.keys(fieldErrors).length > 0 ? (
            <ul className="form-error-summary__fields">
              {Object.entries(fieldErrors).map(([field, message]) => (
                <li key={field}>
                  <strong>{maintenanceFieldLabel(field)}:</strong> {message}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="form-error-summary__next">
            <p>
              <strong>What to do next</strong>
            </p>
            <ol>
              {buildMaintenanceHelpSteps(fieldErrors).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}

      <section className="live-ops-section" aria-labelledby="maintenance-state-heading">
        <div className="live-ops-section__header">
          <h3 id="maintenance-state-heading">Change draft</h3>
        </div>
        <div className="field field--switch">
          <div>
            <label htmlFor="maintenance-enabled">Enable maintenance</label>
            <p id="maintenance-enabled-desc">
              {enabled
                ? 'Draft only. Nothing goes live until you review and confirm below.'
                : 'Off means you are preparing to disable maintenance. Only a reason is required.'}
            </p>
          </div>
          <input
            aria-describedby="maintenance-enabled-desc"
            checked={enabled}
            className="admin-switch"
            disabled={!canManage || pending}
            id="maintenance-enabled"
            onChange={(event) => setEnabled(event.currentTarget.checked)}
            type="checkbox"
          />
        </div>
        {dirty ? (
          <p className="unsaved-changes-banner" role="status">
            <strong>Unsaved draft</strong>
            {draftIntent === 'disable'
              ? 'Review and confirm to disable. Title, message, and schedule are not required.'
              : draftIntent === 'update'
                ? 'Edits do not apply yet. Use Review maintenance update, then confirm to replace the live config.'
                : 'Edits do not apply yet. Use Review maintenance change, then confirm to enable.'}
          </p>
        ) : (
          <p className="field-hint">
            Live state is the banner above. Form fields are a draft until you review and confirm.
          </p>
        )}
        <details className="maintenance-howto">
          <summary>
            <span className="maintenance-howto__lead">
              <span aria-hidden="true" className="maintenance-howto__icon">
                ?
              </span>
              <span className="maintenance-howto__copy">
                <strong>How to apply a change</strong>
                <small>Click to expand step-by-step instructions</small>
              </span>
            </span>
            <span aria-hidden="true" className="maintenance-howto__chevron">
              <svg fill="none" height="16" viewBox="0 0 20 20" width="16">
                <path
                  d="M5.5 7.75 10 12.25l4.5-4.5"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.75"
                />
              </svg>
            </span>
          </summary>
          {enabled ? (
            <ol>
              <li>Leave the switch on and choose a schedule mode.</li>
              <li>Edit the player-facing title and message if needed.</li>
              <li>
                Click <strong>Review maintenance change</strong>.
              </li>
              <li>
                Enter a reason (12+ characters). For immediate enable, type{' '}
                <strong>MAINTENANCE</strong>.
              </li>
              <li>Confirm. The banner above updates after a successful save.</li>
            </ol>
          ) : (
            <ol>
              <li>Leave the switch off.</li>
              <li>
                Click <strong>Review maintenance change</strong>.
              </li>
              <li>Enter a reason (12+ characters).</li>
              <li>
                Confirm <strong>Disable Maintenance</strong>. No title, message, or schedule is
                required.
              </li>
            </ol>
          )}
        </details>
      </section>

      {!enabled ? (
        <>
          <input name="title" type="hidden" value={title} />
          <input name="message" type="hidden" value={message} />
          <input name="updateDetails" type="hidden" value={updateDetails} />
          <input name="expectedReturnMessage" type="hidden" value={expectedReturnMessage} />
          <input name="ctaLabel" type="hidden" value={ctaLabel} />
          <input name="ctaUrl" type="hidden" value={ctaUrl} />
          <section className="live-ops-section">
            <p className="disable-only-note" role="status">
              <strong>Disabling maintenance</strong>
              You only need a review reason. Player message and schedule settings stay stored for
              the next time you enable maintenance.
            </p>
          </section>
        </>
      ) : null}

      {enabled ? (
        <>
          <section className="live-ops-section" aria-labelledby="maintenance-message-heading">
            <h3 id="maintenance-message-heading">Player-facing message</h3>
            <div className={`field${fieldErrors['title'] ? ' field--error' : ''}`}>
              <label htmlFor="maintenance-title">Title</label>
              <input
                aria-invalid={fieldErrors['title'] ? true : undefined}
                disabled={!canManage || pending}
                id="maintenance-title"
                maxLength={80}
                name="title"
                onChange={(event) => setTitle(event.currentTarget.value)}
                required
                value={title}
              />
              {fieldErrors['title'] ? <p className="field-error">{fieldErrors['title']}</p> : null}
            </div>
            <div className={`field${fieldErrors['message'] ? ' field--error' : ''}`}>
              <label htmlFor="maintenance-message">Player message</label>
              <textarea
                aria-invalid={fieldErrors['message'] ? true : undefined}
                disabled={!canManage || pending}
                id="maintenance-message"
                maxLength={1000}
                name="message"
                onChange={(event) => setMessage(event.currentTarget.value)}
                required
                rows={4}
                value={message}
              />
              {fieldErrors['message'] ? (
                <p className="field-error">{fieldErrors['message']}</p>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="maintenance-update-details">Update details</label>
              <textarea
                disabled={!canManage || pending}
                id="maintenance-update-details"
                maxLength={1600}
                name="updateDetails"
                onChange={(event) => setUpdateDetails(event.currentTarget.value)}
                placeholder="One detail per line"
                rows={3}
                value={updateDetails}
              />
              <p className="field__guidance">
                One item per line. Shown as a list in the player view.
              </p>
            </div>
            <div className="field">
              <label htmlFor="maintenance-return-message">Expected return message</label>
              <input
                disabled={!canManage || pending}
                id="maintenance-return-message"
                maxLength={240}
                name="expectedReturnMessage"
                onChange={(event) => setExpectedReturnMessage(event.currentTarget.value)}
                value={expectedReturnMessage}
              />
            </div>
          </section>

          <section className="live-ops-section" aria-labelledby="maintenance-schedule-heading">
            <h3 id="maintenance-schedule-heading">Schedule</h3>
            <fieldset className="activation-mode" disabled={!canManage || pending}>
              <legend id="activation-mode-legend">When should maintenance begin?</legend>
              <div
                className="activation-mode__options"
                role="radiogroup"
                aria-labelledby="activation-mode-legend"
              >
                <button
                  aria-checked={activationMode === 'immediate'}
                  className={`activation-mode__card${activationMode === 'immediate' ? ' is-selected' : ''}`}
                  disabled={!canManage || pending}
                  onClick={() => selectActivationMode('immediate')}
                  role="radio"
                  type="button"
                >
                  <span className="activation-mode__indicator" aria-hidden="true" />
                  <span className="activation-mode__copy">
                    <strong>Start immediately</strong>
                    <small>Maintenance begins as soon as the change is confirmed.</small>
                  </span>
                </button>
                <button
                  aria-checked={activationMode === 'scheduled'}
                  className={`activation-mode__card${activationMode === 'scheduled' ? ' is-selected' : ''}`}
                  disabled={!canManage || pending}
                  onClick={() => selectActivationMode('scheduled')}
                  role="radio"
                  type="button"
                >
                  <span className="activation-mode__indicator" aria-hidden="true" />
                  <span className="activation-mode__copy">
                    <strong>Schedule for later</strong>
                    <small>
                      Maintenance begins automatically at the selected future date and time.
                    </small>
                  </span>
                </button>
              </div>
              {!enabled ? (
                <p className="field-hint">
                  Choose a start mode now. Enable maintenance above before reviewing and confirming
                  the change.
                </p>
              ) : null}
            </fieldset>

            {activationMode === 'immediate' ? (
              <div className="schedule-status-callout" role="status">
                <span aria-hidden="true" className="schedule-status-callout__icon">
                  ⚡
                </span>
                <div>
                  <strong>Starts immediately</strong>
                  <p>Maintenance will begin as soon as you review and confirm this change.</p>
                </div>
              </div>
            ) : (
              <div className={`field${fieldErrors['scheduledStartAt'] ? ' field--error' : ''}`}>
                <label htmlFor="maintenance-scheduled-start">Scheduled start</label>
                <input
                  aria-invalid={fieldErrors['scheduledStartAt'] ? true : undefined}
                  className="admin-datetime"
                  disabled={!canManage || pending}
                  id="maintenance-scheduled-start"
                  name="scheduledStartAt"
                  onChange={(event) => setScheduledStartAt(event.currentTarget.value)}
                  required={activationMode === 'scheduled'}
                  type="datetime-local"
                  value={scheduledStartAt}
                />
                <p className="field__guidance">
                  {hasMounted
                    ? 'Browser local time. Stored and enforced as UTC.'
                    : 'Loading local timezone… values shown in UTC until ready.'}
                </p>
                {scheduledStartAt ? (
                  <p className="field__guidance" suppressHydrationWarning>
                    UTC equivalent: {formatUtc(scheduledStartAt)}
                  </p>
                ) : null}
                {fieldErrors['scheduledStartAt'] ? (
                  <p className="field-error">{fieldErrors['scheduledStartAt']}</p>
                ) : null}
              </div>
            )}

            <div className={`field${fieldErrors['expectedEndAt'] ? ' field--error' : ''}`}>
              <label htmlFor="maintenance-expected-end">Expected end</label>
              <input
                aria-invalid={fieldErrors['expectedEndAt'] ? true : undefined}
                className="admin-datetime"
                disabled={!canManage || pending}
                id="maintenance-expected-end"
                name="expectedEndAt"
                onChange={(event) => setExpectedEndAt(event.currentTarget.value)}
                type="datetime-local"
                value={expectedEndAt}
              />
              <p className="field__guidance">
                Optional. Leave blank when the maintenance end time is not yet known.
              </p>
              {expectedEndAt ? (
                <p className="field__guidance" suppressHydrationWarning>
                  {hasMounted
                    ? `Local: ${formatLocal(expectedEndAt)} · UTC: ${formatUtc(expectedEndAt)}`
                    : `UTC: ${formatUtc(expectedEndAt)}`}
                </p>
              ) : (
                <p className="field__guidance">No expected end is currently configured.</p>
              )}
              {fieldErrors['expectedEndAt'] ? (
                <p className="field-error">{fieldErrors['expectedEndAt']}</p>
              ) : null}
            </div>

            <div className="field field--switch">
              <div>
                <label htmlFor="maintenance-auto-disable">Auto-disable at expected end</label>
                <p id="maintenance-auto-disable-desc">
                  {hasExpectedEnd
                    ? 'Automatically disables maintenance when the configured end time is reached.'
                    : 'Add an expected end time to enable automatic maintenance shutdown.'}
                </p>
              </div>
              <input
                aria-describedby="maintenance-auto-disable-desc"
                checked={autoDisableAtEnd}
                className="admin-switch"
                disabled={!canManage || pending || !hasExpectedEnd}
                id="maintenance-auto-disable"
                onChange={(event) => setAutoDisableAtEnd(event.currentTarget.checked)}
                type="checkbox"
              />
            </div>
            {fieldErrors['autoDisableAtEnd'] ? (
              <p className="field-error">{fieldErrors['autoDisableAtEnd']}</p>
            ) : null}
          </section>

          <section className="live-ops-section" aria-labelledby="maintenance-actions-heading">
            <h3 id="maintenance-actions-heading">Player actions</h3>
            <div className="field field--switch">
              <div>
                <label htmlFor="maintenance-return-landing">Show return-to-landing action</label>
                <p id="maintenance-return-landing-desc">
                  Shows a safe button that returns the player to the Starville landing page. Custom
                  CTA fields below remain optional.
                </p>
              </div>
              <input
                aria-describedby="maintenance-return-landing-desc"
                checked={showReturnToLanding}
                className="admin-switch"
                disabled={!canManage || pending}
                id="maintenance-return-landing"
                onChange={(event) => setShowReturnToLanding(event.currentTarget.checked)}
                type="checkbox"
              />
            </div>
            <div className="live-ops-form-grid live-ops-form-grid--paired">
              <div className={`field${fieldErrors['ctaLabel'] ? ' field--error' : ''}`}>
                <label htmlFor="maintenance-cta-label">Custom CTA label</label>
                <input
                  aria-describedby="maintenance-cta-guidance"
                  disabled={!canManage || pending}
                  id="maintenance-cta-label"
                  maxLength={40}
                  name="ctaLabel"
                  onChange={(event) => setCtaLabel(event.currentTarget.value)}
                  placeholder="Optional custom action"
                  value={ctaLabel}
                />
                {fieldErrors['ctaLabel'] ? (
                  <p className="field-error">{fieldErrors['ctaLabel']}</p>
                ) : null}
              </div>
              <div className={`field${fieldErrors['ctaUrl'] ? ' field--error' : ''}`}>
                <label htmlFor="maintenance-cta-url">Custom CTA URL</label>
                <input
                  aria-describedby="maintenance-cta-guidance"
                  disabled={!canManage || pending}
                  id="maintenance-cta-url"
                  maxLength={500}
                  name="ctaUrl"
                  onChange={(event) => setCtaUrl(event.currentTarget.value)}
                  placeholder="https://… or /internal-path"
                  value={ctaUrl}
                />
                {fieldErrors['ctaUrl'] ? (
                  <p className="field-error">{fieldErrors['ctaUrl']}</p>
                ) : null}
              </div>
              <p
                className="field__guidance live-ops-form-grid__guidance"
                id="maintenance-cta-guidance"
              >
                Optional. HTTPS or an internal absolute path. Provide both label and URL together.
              </p>
            </div>
          </section>
        </>
      ) : null}

      {canManage ? (
        <div className="live-ops-form-actions">
          <button
            className={
              draftIntent === 'update' ? 'button button--primary' : 'button button--danger'
            }
            disabled={pending || (!dirty && draftIntent === 'update')}
            onClick={openReview}
            type="button"
          >
            {reviewButtonLabel}
          </button>
          {!dirty && draftIntent === 'update' ? (
            <p className="field-hint">Change a field to enable review for an update.</p>
          ) : null}
        </div>
      ) : (
        <p className="read-only-notice">
          Read-only access. Maintenance changes require <code>live_operations.manage</code>.
        </p>
      )}

      <dialog
        aria-labelledby="maintenance-confirm-title"
        className={`operation-dialog operation-dialog--${draftIntent === 'update' ? 'caution' : 'critical'}`}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        ref={dialog}
      >
        <div className="operation-dialog__form">
          <header>
            <p className="eyebrow">
              {draftIntent === 'update' ? 'Update live configuration' : 'Critical live operation'}
            </p>
            <h2 id="maintenance-confirm-title">{reviewTitle}</h2>
          </header>
          <dl className="detail-list">
            <div>
              <dt>Current live state</dt>
              <dd>{maintenance.state}</dd>
            </div>
            <div>
              <dt>After confirmation</dt>
              <dd>{newGameState}</dd>
            </div>
            {draftIntent !== 'disable' ? (
              <div>
                <dt>Start</dt>
                <dd>
                  {activationMode === 'immediate'
                    ? draftIntent === 'update'
                      ? 'Immediate (already live or becomes live on confirm)'
                      : 'Immediately after confirmation'
                    : formatLocal(scheduledStartAt)}
                </dd>
              </div>
            ) : null}
            {draftIntent !== 'disable' && activationMode === 'scheduled' ? (
              <div>
                <dt>Start UTC</dt>
                <dd>{formatUtc(scheduledStartAt)}</dd>
              </div>
            ) : null}
            {draftIntent !== 'disable' ? (
              <>
                <div>
                  <dt>Expected end</dt>
                  <dd>{hasExpectedEnd ? formatLocal(expectedEndAt) : 'Not configured'}</dd>
                </div>
                <div>
                  <dt>Automatic shutdown</dt>
                  <dd>{autoDisableAtEnd && hasExpectedEnd ? 'Enabled' : 'Disabled'}</dd>
                </div>
                <div>
                  <dt>Player title</dt>
                  <dd>{title}</dd>
                </div>
                <div>
                  <dt>Player message</dt>
                  <dd>{message}</dd>
                </div>
              </>
            ) : null}
          </dl>
          <p>{reviewBody}</p>
          <div className={`field${fieldErrors['reason'] ? ' field--error' : ''}`}>
            <label htmlFor="maintenance-reason">Administrator reason</label>
            <textarea
              aria-invalid={fieldErrors['reason'] ? true : undefined}
              id="maintenance-reason"
              maxLength={500}
              minLength={12}
              name="reason"
              onChange={(event) => setReason(event.currentTarget.value)}
              readOnly={pending}
              required
              rows={4}
              value={reason}
            />
            {fieldErrors['reason'] ? <p className="field-error">{fieldErrors['reason']}</p> : null}
          </div>
          {immediateActivation ? (
            <div className={`field${fieldErrors['confirmation'] ? ' field--error' : ''}`}>
              <label htmlFor="maintenance-confirmation">Type MAINTENANCE to confirm</label>
              <input
                autoComplete="off"
                id="maintenance-confirmation"
                name="confirmation"
                onChange={(event) => setConfirmation(event.currentTarget.value)}
                readOnly={pending}
                required
                value={confirmation}
              />
              {fieldErrors['confirmation'] ? (
                <p className="field-error">{fieldErrors['confirmation']}</p>
              ) : null}
            </div>
          ) : null}
          <footer>
            <button
              className="button button--quiet"
              disabled={pending}
              onClick={() => dialog.current?.close()}
              type="button"
            >
              Cancel
            </button>
            <button
              className={
                draftIntent === 'update' ? 'button button--primary' : 'button button--danger'
              }
              disabled={!canSubmit}
              type="submit"
            >
              {pending ? 'Applying…' : reviewSubmitLabel}
            </button>
          </footer>
        </div>
      </dialog>
    </form>
  );
}
