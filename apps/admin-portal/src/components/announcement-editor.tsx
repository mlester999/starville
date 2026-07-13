'use client';

import type { AdminLiveOperations } from '@starville/live-operations';
import { useState, type ReactNode } from 'react';

import { saveAnnouncementAction } from '../app/actions/live-operations';
import { PremiumSelect } from './premium-select';

type Announcement = AdminLiveOperations['announcements'][number];

const utcInput = (value: string | null) =>
  value === null || Number.isNaN(new Date(value).valueOf())
    ? ''
    : new Date(value).toISOString().slice(0, 16);

const SEVERITY_OPTIONS = [
  { value: 'information', label: 'Information' },
  { value: 'success', label: 'Success' },
  { value: 'warning', label: 'Warning' },
  { value: 'critical', label: 'Critical' },
] as const;

const PRESENTATION_OPTIONS = [
  { value: 'ticker', label: 'Ticker' },
  { value: 'banner', label: 'Banner' },
] as const;

function AnnouncementFormFields({
  announcement,
  duplicate,
  editing,
  requestId,
  message,
  setMessage,
  severity,
  setSeverity,
  presentation,
  setPresentation,
  dismissible,
  setDismissible,
  submitLabel,
  intent,
}: {
  readonly announcement?: Announcement;
  readonly duplicate: boolean;
  readonly editing: boolean;
  readonly requestId: string;
  readonly message: string;
  readonly setMessage: (value: string) => void;
  readonly severity: Announcement['severity'];
  readonly setSeverity: (value: Announcement['severity']) => void;
  readonly presentation: Announcement['presentation'];
  readonly setPresentation: (value: Announcement['presentation']) => void;
  readonly dismissible: boolean;
  readonly setDismissible: (value: boolean) => void;
  readonly submitLabel: string;
  readonly intent: 'create' | 'update' | 'duplicate';
}) {
  const guideTitle =
    intent === 'update'
      ? 'How to update this draft'
      : intent === 'duplicate'
        ? 'How to save a copy as a new draft'
        : 'How to create this draft';
  const guideLead =
    intent === 'update'
      ? 'Saving updates this draft only. It does not publish to players.'
      : intent === 'duplicate'
        ? 'Saving creates a separate new draft you can publish later.'
        : 'Players will not see this until you Publish it from the list below.';

  return (
    <form action={saveAnnouncementAction} className="live-operations-form">
      {editing ? <input name="id" type="hidden" value={announcement?.id} /> : null}
      <input name="requestId" type="hidden" value={requestId} />
      <input
        name="expectedRevision"
        type="hidden"
        value={editing ? (announcement?.revision ?? 0) : 0}
      />

      <details className="maintenance-howto announcement-guide">
        <summary>
          <span className="maintenance-howto__lead">
            <span aria-hidden="true" className="maintenance-howto__icon">
              ?
            </span>
            <span className="maintenance-howto__copy">
              <strong>{guideTitle}</strong>
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
        <div className="announcement-guide__body">
          <p>{guideLead}</p>
          <ol>
            <li>
              <strong>Internal title</strong> — staff-only label so you can find this draft later.
            </li>
            <li>
              <strong>Player message</strong> — the text players read after publish.
            </li>
            <li>
              <strong>Administrator reason</strong> — at least 12 characters for the audit trail.
            </li>
            <li>
              Click <strong>{submitLabel}</strong>.
            </li>
            <li>
              In the list below, use <strong>Publish</strong> when you want it live in the game.
            </li>
          </ol>
          <p className="announcement-guide__optional">
            Optional: severity, presentation, start/end time, CTA, and dismissible.
          </p>
        </div>
      </details>

      <div className="live-ops-form-grid">
        <div className="field">
          <label htmlFor={`announcement-title-${requestId}`}>Internal title</label>
          <input
            defaultValue={
              duplicate
                ? `${announcement?.internalTitle ?? ''} copy`
                : (announcement?.internalTitle ?? '')
            }
            id={`announcement-title-${requestId}`}
            maxLength={100}
            name="internalTitle"
            placeholder="Staff-only label, not shown to players"
            required
          />
          <p className="field__guidance">Staff-only. Players never see this title.</p>
        </div>
        <div className="field">
          <label htmlFor={`announcement-priority-${requestId}`}>Priority</label>
          <input
            defaultValue={announcement?.priority ?? 100}
            id={`announcement-priority-${requestId}`}
            max={1000}
            min={0}
            name="priority"
            type="number"
          />
          <p className="field__guidance">Higher priority is returned first. Default 100.</p>
        </div>
        <div className="field">
          <label htmlFor={`announcement-severity-${requestId}`}>Severity</label>
          <PremiumSelect
            id={`announcement-severity-${requestId}`}
            name="severity"
            onChange={(next) => setSeverity(next as Announcement['severity'])}
            options={SEVERITY_OPTIONS}
            value={severity}
          />
          <p className="field__guidance">Visual tone in the game client. Click to choose.</p>
        </div>
        <div className="field">
          <label htmlFor={`announcement-presentation-${requestId}`}>Presentation</label>
          <PremiumSelect
            id={`announcement-presentation-${requestId}`}
            name="presentation"
            onChange={(next) => setPresentation(next as Announcement['presentation'])}
            options={PRESENTATION_OPTIONS}
            value={presentation}
          />
          <p className="field__guidance">
            Ticker scrolls; banner is a fixed strip. Click to choose.
          </p>
        </div>
      </div>

      <div className="field">
        <label htmlFor={`announcement-message-${requestId}`}>Player message</label>
        <textarea
          id={`announcement-message-${requestId}`}
          maxLength={500}
          name="message"
          onChange={(event) => setMessage(event.currentTarget.value)}
          placeholder="What players will read in the game client"
          required
          rows={3}
          value={message}
        />
        <p className="field__guidance">Shown to players after this draft is published.</p>
      </div>

      <div className="live-ops-form-grid live-ops-form-grid--paired">
        <div className="field">
          <label htmlFor={`announcement-starts-${requestId}`}>Starts at</label>
          <input
            className="admin-datetime"
            defaultValue={utcInput(announcement?.startsAt ?? null)}
            id={`announcement-starts-${requestId}`}
            name="startsAt"
            type="datetime-local"
          />
          <p className="field__guidance">Optional. Blank means starts when published.</p>
        </div>
        <div className="field">
          <label htmlFor={`announcement-ends-${requestId}`}>Ends at</label>
          <input
            className="admin-datetime"
            defaultValue={utcInput(announcement?.endsAt ?? null)}
            id={`announcement-ends-${requestId}`}
            name="endsAt"
            type="datetime-local"
          />
          <p className="field__guidance">Optional. Blank means open-ended.</p>
        </div>
        <div className="field">
          <label htmlFor={`announcement-cta-label-${requestId}`}>CTA label</label>
          <input
            defaultValue={announcement?.ctaLabel ?? ''}
            id={`announcement-cta-label-${requestId}`}
            maxLength={40}
            name="ctaLabel"
            placeholder="Optional"
          />
        </div>
        <div className="field">
          <label htmlFor={`announcement-cta-url-${requestId}`}>CTA URL</label>
          <input
            defaultValue={announcement?.ctaUrl ?? ''}
            id={`announcement-cta-url-${requestId}`}
            maxLength={500}
            name="ctaUrl"
            placeholder="https://… or /path"
          />
        </div>
        <p className="field__guidance live-ops-form-grid__guidance">
          Optional CTA pair. Provide both label and URL, or leave both blank.
        </p>
      </div>

      <div className="field field--switch">
        <div>
          <label htmlFor={`announcement-dismissible-${requestId}`}>
            Dismissible on this device
          </label>
          <p id={`announcement-dismissible-desc-${requestId}`}>
            When on, players may hide this announcement on the current device for this revision.
          </p>
        </div>
        <input
          aria-describedby={`announcement-dismissible-desc-${requestId}`}
          checked={dismissible}
          className="admin-switch"
          id={`announcement-dismissible-${requestId}`}
          name="dismissible"
          onChange={(event) => setDismissible(event.currentTarget.checked)}
          type="checkbox"
        />
      </div>

      <section className="announcement-previews" aria-label="Player announcement previews">
        {(['desktop', 'tablet', 'mobile'] as const).map((width) => (
          <div
            className={`announcement-preview announcement-preview--${width} announcement-preview--${severity}`}
            key={width}
          >
            <small>
              {width} game shell preview · {presentation}
            </small>
            <p>{message || 'Player-facing announcement preview'}</p>
            {dismissible ? <span aria-hidden="true">×</span> : <strong>Mandatory</strong>}
          </div>
        ))}
      </section>
      <p className="field-hint">
        Preview is layout only. It does not claim touch gameplay support.
      </p>

      <div className="field">
        <label htmlFor={`announcement-reason-${requestId}`}>Administrator reason</label>
        <textarea
          id={`announcement-reason-${requestId}`}
          maxLength={500}
          minLength={12}
          name="reason"
          placeholder="Why this draft is being saved (12–500 characters)"
          required
          rows={3}
        />
        <p className="field__guidance">Required for the audit trail. Not shown to players.</p>
      </div>

      <div className="live-ops-form-actions">
        <button className="button button--primary" type="submit">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function CollapsibleShell({
  title,
  subtitle,
  icon = '✎',
  children,
  defaultOpen = false,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly icon?: string;
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
}) {
  // Same expandable control pattern as maintenance "How to apply a change".
  return (
    <details className="maintenance-howto announcement-editor" open={defaultOpen || undefined}>
      <summary>
        <span className="maintenance-howto__lead">
          <span aria-hidden="true" className="maintenance-howto__icon">
            {icon}
          </span>
          <span className="maintenance-howto__copy">
            <strong>{title}</strong>
            <small>{subtitle}</small>
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
      <div className="announcement-editor__body">{children}</div>
    </details>
  );
}

export function AnnouncementEditor({
  announcement,
  duplicate = false,
  requestId,
  defaultOpen = false,
  variant = 'inline',
}: {
  readonly announcement?: Announcement;
  readonly duplicate?: boolean;
  readonly requestId: string;
  readonly defaultOpen?: boolean;
  /** `panel` = always-open create form without a second title. `inline` = collapsible in the list. */
  readonly variant?: 'panel' | 'inline';
}) {
  const [message, setMessage] = useState(announcement?.message ?? '');
  const [severity, setSeverity] = useState(announcement?.severity ?? 'information');
  const [presentation, setPresentation] = useState(announcement?.presentation ?? 'ticker');
  const [dismissible, setDismissible] = useState(announcement?.dismissible ?? true);
  const editing = announcement !== undefined && !duplicate;
  const intent = editing ? 'update' : duplicate ? 'duplicate' : 'create';
  const submitLabel =
    intent === 'update'
      ? 'Update draft'
      : intent === 'duplicate'
        ? 'Save as new draft'
        : 'Save draft';
  const toggleTitle =
    intent === 'update'
      ? 'Edit draft'
      : intent === 'duplicate'
        ? 'Duplicate announcement'
        : 'Create announcement';
  const toggleSubtitle = 'Click to expand step-by-step form';
  const toggleIcon = intent === 'update' ? '✎' : intent === 'duplicate' ? '⧉' : '+';

  const fields = (
    <AnnouncementFormFields
      {...(announcement === undefined ? {} : { announcement })}
      dismissible={dismissible}
      duplicate={duplicate}
      editing={editing}
      intent={intent}
      message={message}
      presentation={presentation}
      requestId={requestId}
      setDismissible={setDismissible}
      setMessage={setMessage}
      setPresentation={setPresentation}
      setSeverity={setSeverity}
      severity={severity}
      submitLabel={submitLabel}
    />
  );

  if (variant === 'panel') {
    return <div className="announcement-create-panel">{fields}</div>;
  }

  return (
    <CollapsibleShell
      defaultOpen={defaultOpen}
      icon={toggleIcon}
      subtitle={toggleSubtitle}
      title={toggleTitle}
    >
      {fields}
    </CollapsibleShell>
  );
}
