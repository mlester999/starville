'use client';

import { useRef, useState } from 'react';

import { announcementStatusAction } from '../app/actions/live-operations';

type Action = 'publish' | 'deactivate' | 'archive';

export function AnnouncementStatusControl(props: {
  readonly id: string;
  readonly revision: number;
  readonly requestId: string;
  readonly title: string;
  readonly message: string;
  readonly severity: string;
  readonly mandatory: boolean;
  readonly status: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState<Action>('publish');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function open(next: Action) {
    setAction(next);
    setReason('');
    dialog.current?.showModal();
  }

  const critical = action === 'publish' && props.severity === 'critical' && props.mandatory;
  const actionLabel = `${action[0]?.toUpperCase() ?? ''}${action.slice(1)}`;

  return (
    <>
      <div className="table-actions">
        {props.status === 'draft' || props.status === 'deactivated' ? (
          <button
            className="button button--secondary"
            onClick={() => open('publish')}
            type="button"
          >
            Publish
          </button>
        ) : null}
        {props.status === 'published' ? (
          <button
            className="button button--secondary"
            onClick={() => open('deactivate')}
            type="button"
          >
            Deactivate
          </button>
        ) : null}
        {props.status !== 'archived' ? (
          <button className="button button--quiet" onClick={() => open('archive')} type="button">
            Archive
          </button>
        ) : null}
      </div>
      <dialog
        aria-labelledby={`announcement-action-${props.id}`}
        className={`operation-dialog operation-dialog--${critical ? 'critical' : 'caution'}`}
        onCancel={(event) => {
          if (submitting) event.preventDefault();
        }}
        ref={dialog}
      >
        <form
          action={announcementStatusAction}
          className="operation-dialog__form"
          onSubmit={() => setSubmitting(true)}
        >
          <input name="id" type="hidden" value={props.id} />
          <input name="expectedRevision" type="hidden" value={props.revision} />
          <input name="requestId" type="hidden" value={props.requestId} />
          <input name="action" type="hidden" value={action} />
          <header>
            <p className="eyebrow">Announcement lifecycle</p>
            <h2 id={`announcement-action-${props.id}`}>{actionLabel} announcement</h2>
          </header>
          <p>
            <strong>{props.title}</strong>
          </p>
          <p>{props.message}</p>
          {critical ? (
            <p role="alert">This is a mandatory critical player message and cannot be dismissed.</p>
          ) : null}
          <div className="field">
            <label htmlFor={`announcement-action-reason-${props.id}`}>Administrator reason</label>
            <textarea
              autoFocus
              disabled={submitting}
              id={`announcement-action-reason-${props.id}`}
              maxLength={500}
              minLength={12}
              name="reason"
              onChange={(event) => setReason(event.currentTarget.value)}
              required
              rows={4}
              value={reason}
            />
          </div>
          <footer>
            <button
              className="button button--quiet"
              disabled={submitting}
              onClick={() => dialog.current?.close()}
              type="button"
            >
              Cancel
            </button>
            <button
              className={critical ? 'button button--danger' : 'button button--primary'}
              disabled={reason.trim().length < 12 || submitting}
              type="submit"
            >
              {submitting ? 'Applying…' : `${actionLabel} Announcement`}
            </button>
          </footer>
        </form>
      </dialog>
    </>
  );
}
