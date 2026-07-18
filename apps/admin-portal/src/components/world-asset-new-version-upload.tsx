'use client';

import {
  assetMutationResponseSchema,
  type AssetMutationResponse,
} from '@starville/asset-management';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import type { WorldAssetType } from '../lib/world-assets/contracts';
import {
  inspectClientImage,
  inspectionBlockingMessages,
  type ClientImageInspection,
} from '../lib/world-assets/image-inspection';
import { assetTypeProfile, formatAssetBytes } from '../lib/world-assets/profiles';
import {
  resolveAssetUploadAttempt,
  type AssetUploadAttempt,
} from '../lib/world-assets/upload-attempt';
import { assetVersionUploadErrorMessage } from '../lib/world-assets/version-upload-errors';

type VersionUploadState = 'idle' | 'checking' | 'uploading' | 'processing' | 'complete' | 'error';

interface UploadEnvelope {
  readonly success?: unknown;
  readonly data?: unknown;
  readonly error?: unknown;
}

function errorCode(envelope: UploadEnvelope): string | undefined {
  if (typeof envelope.error !== 'object' || envelope.error === null) return undefined;
  const code = Reflect.get(envelope.error, 'code');
  return typeof code === 'string' ? code : undefined;
}

export function WorldAssetNewVersionUpload(props: {
  readonly assetId: string;
  readonly assetRevision: number;
  readonly assetType: WorldAssetType;
  readonly sourceVersionId: string;
  readonly configurationMode?: 'copy' | 'defaults';
}) {
  const profile = assetTypeProfile(props.assetType);
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const attemptRef = useRef<AssetUploadAttempt | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [inspection, setInspection] = useState<ClientImageInspection | null>(null);
  const [issues, setIssues] = useState<readonly string[]>([]);
  const [reason, setReason] = useState('');
  const [state, setState] = useState<VersionUploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState(
    'Choose a replacement source. The current active version remains unchanged.',
  );
  const [result, setResult] = useState<AssetMutationResponse | null>(null);

  useEffect(
    () => () => {
      if (previewUrl !== null) URL.revokeObjectURL(previewUrl);
      xhrRef.current?.abort();
    },
    [previewUrl],
  );

  async function selectFile(next: File | null): Promise<void> {
    if (previewUrl !== null) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFile(null);
    setInspection(null);
    setIssues([]);
    setResult(null);
    if (next === null) {
      setState('idle');
      setMessage('No replacement source selected.');
      return;
    }
    setState('checking');
    setMessage('Running browser advisory checks…');
    try {
      const nextInspection = await inspectClientImage(next, profile);
      const nextIssues = inspectionBlockingMessages(nextInspection);
      setFile(next);
      setInspection(nextInspection);
      setIssues(nextIssues);
      setPreviewUrl(URL.createObjectURL(next));
      setState(nextIssues.length === 0 ? 'idle' : 'error');
      setMessage(
        nextIssues.length === 0
          ? nextInspection.warningCount > 0
            ? 'Advisory warnings found. Server-side decoding and validation still apply.'
            : 'Advisory checks passed. Server-side decoding and validation still apply.'
          : 'Fix the blocking advisory issues before uploading.',
      );
    } catch {
      setState('error');
      setMessage('This file could not be read by the browser.');
    }
  }

  function upload(): void {
    const trimmedReason = reason.trim();
    if (file === null || issues.length > 0 || trimmedReason.length < 12) {
      setState('error');
      setMessage('Choose a valid source and provide a clear reason of at least 12 characters.');
      return;
    }
    const fingerprint = [
      props.assetId,
      props.sourceVersionId,
      props.configurationMode ?? 'copy',
      String(props.assetRevision),
      file.name,
      String(file.size),
      String(file.lastModified),
      file.type,
      trimmedReason,
    ].join('|');
    const attempt = resolveAssetUploadAttempt(attemptRef.current, fingerprint, () =>
      globalThis.crypto.randomUUID(),
    );
    attemptRef.current = attempt;

    const body = new FormData();
    body.set('expectedAssetRevision', String(props.assetRevision));
    body.set('sourceVersionId', props.sourceVersionId);
    body.set('configurationMode', props.configurationMode ?? 'copy');
    body.set('reason', trimmedReason);
    body.set('idempotencyKey', attempt.idempotencyKey);
    body.set('file', file, file.name);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open('POST', `/api/world-assets/${encodeURIComponent(props.assetId)}/versions`);
    xhr.setRequestHeader('x-request-id', attempt.idempotencyKey);
    xhr.responseType = 'json';
    setProgress(0);
    setState('uploading');
    setMessage('Transferring the source through the protected upload gateway…');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.upload.onload = () => {
      setProgress(100);
      setState('processing');
      setMessage('Transfer complete. The trusted service is preparing an immutable candidate…');
    };
    xhr.onload = () => {
      xhrRef.current = null;
      const envelope = (xhr.response ?? {}) as UploadEnvelope;
      const parsed = assetMutationResponseSchema.safeParse(envelope.data);
      if (xhr.status < 200 || xhr.status >= 300 || envelope.success !== true || !parsed.success) {
        setState('error');
        setMessage(assetVersionUploadErrorMessage(xhr.status, errorCode(envelope)));
        return;
      }
      setResult(parsed.data);
      setState('complete');
      setMessage('The new draft version is ready for configuration and trusted validation.');
      attemptRef.current = null;
    };
    xhr.onerror = () => {
      xhrRef.current = null;
      setState('error');
      setMessage('The new version could not be uploaded. Please try again.');
    };
    xhr.onabort = () => {
      xhrRef.current = null;
      setState('idle');
      setMessage('Version upload cancelled before completion.');
    };
    xhr.send(body);
  }

  const busy = state === 'checking' || state === 'uploading' || state === 'processing';

  return (
    <section className="detail-card asset-new-version" aria-labelledby="asset-new-version-title">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Immutable versioning</p>
          <h2 id="asset-new-version-title">Create the next version</h2>
        </div>
        <span className="state-chip state-chip--draft">New draft only</span>
      </div>
      <p>
        Uploading a replacement source creates Version N+1. The current active version and every
        published world reference remain pinned until a later explicit activation and publication.
      </p>
      <div className="asset-new-version__grid">
        <label className="field">
          <span>Replacement source</span>
          <input
            accept="image/png,image/webp,.png,.webp"
            disabled={busy}
            onChange={(event) => void selectFile(event.currentTarget.files?.item(0) ?? null)}
            ref={inputRef}
            type="file"
          />
          <small>
            PNG or WebP · maximum {formatAssetBytes(profile.maxFileSizeBytes)} for{' '}
            {profile.label.toLowerCase()}
          </small>
        </label>
        <label className="field">
          <span>Reason for the new version</span>
          <textarea
            disabled={busy}
            maxLength={500}
            minLength={12}
            onChange={(event) => setReason(event.currentTarget.value)}
            required
            rows={4}
            value={reason}
          />
        </label>
        {previewUrl === null || file === null ? null : (
          <div className="asset-selected-file">
            <div className="asset-selected-file__preview">
              <img alt={`Local replacement preview for ${file.name}`} src={previewUrl} />
            </div>
            <div>
              <strong title={file.name}>{file.name}</strong>
              <span>{formatAssetBytes(file.size)}</span>
            </div>
            <button
              className="button button--quiet"
              disabled={busy}
              onClick={() => void selectFile(null)}
              type="button"
            >
              Remove
            </button>
          </div>
        )}
      </div>
      {inspection === null || inspection.findings.length === 0 ? null : (
        <ul
          className="asset-validation-list asset-inspection-list"
          aria-label="Browser advisory validation results"
        >
          {inspection.findings.map((finding) => (
            <li
              className={
                finding.level === 'blocking'
                  ? 'is-blocking'
                  : finding.level === 'warning'
                    ? 'is-warning'
                    : 'is-pass'
              }
              key={finding.id}
              role={finding.level === 'blocking' ? 'alert' : undefined}
            >
              <strong>
                <span className="sr-only">{finding.level}. </span>
                {finding.label}
              </strong>
              <span>{finding.detail}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="asset-upload-progress" aria-live="polite">
        <strong>{message}</strong>
        {state === 'uploading' ? <progress max={100} value={progress} /> : null}
        {state === 'processing' ? <progress>Processing</progress> : null}
      </div>
      <div className="asset-upload-actions">
        {state === 'uploading' ? (
          <button
            className="button button--quiet"
            onClick={() => xhrRef.current?.abort()}
            type="button"
          >
            Cancel upload
          </button>
        ) : null}
        {result?.version === null || result === null ? (
          <button
            className="button button--primary"
            disabled={busy || file === null || issues.length > 0 || reason.trim().length < 12}
            onClick={upload}
            type="button"
          >
            Upload as new draft version
          </button>
        ) : (
          <Link
            className="button button--primary"
            href={`/world-assets/${props.assetId}/versions/${result.version.id}`}
          >
            Configure Version {result.version.versionNumber}
          </Link>
        )}
      </div>
    </section>
  );
}
