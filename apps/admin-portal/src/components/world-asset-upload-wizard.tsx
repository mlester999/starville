'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import {
  ASSET_TYPES,
  assetMutationResponseSchema,
  type AssetMutationResponse,
  type AssetType,
} from '@starville/asset-management';

import { assetTypeLabel, assetTypeProfile, formatAssetBytes } from '../lib/world-assets/profiles';
import {
  resolveAssetUploadAttempt,
  type AssetUploadAttempt,
} from '../lib/world-assets/upload-attempt';
import { advisoryFileIssues, uploadSlug } from '../lib/world-assets/upload';
import { PremiumSelect } from './premium-select';

type UploadState = 'idle' | 'checking' | 'uploading' | 'processing' | 'complete' | 'error';

interface UploadEnvelope {
  readonly success?: unknown;
  readonly data?: unknown;
  readonly error?: unknown;
}

function safeUploadMessage(status: number): string {
  if (status === 409) return 'An identical asset version already exists.';
  if (status === 413) return 'This file is larger than the allowed source size.';
  if (status === 415 || status === 422) return 'This is not a supported PNG or WebP image.';
  if (status === 429) return 'Too many uploads were attempted. Wait briefly and try again.';
  return 'The file could not be uploaded. Please try again.';
}

export function WorldAssetUploadWizard() {
  const [assetType, setAssetType] = useState<AssetType>('building');
  const [friendlyName, setFriendlyName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [category, setCategory] = useState('structure');
  const [markerKey, setMarkerKey] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [issues, setIssues] = useState<readonly string[]>([]);
  const [state, setState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState(
    'Choose an asset type to see its production requirements.',
  );
  const [result, setResult] = useState<AssetMutationResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const attemptRef = useRef<AssetUploadAttempt | null>(null);
  const profile = assetTypeProfile(assetType);

  useEffect(() => {
    return () => {
      if (previewUrl !== null) URL.revokeObjectURL(previewUrl);
      xhrRef.current?.abort();
    };
  }, [previewUrl]);

  function changeType(next: AssetType): void {
    setAssetType(next);
    setCategory(assetTypeProfile(next).allowedCategories[0] ?? 'structure');
    setIssues([]);
    setMessage('Review the requirements before selecting a source file.');
  }

  async function selectFile(next: File | null): Promise<void> {
    if (previewUrl !== null) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFile(null);
    setIssues([]);
    setResult(null);
    if (next === null) {
      setState('idle');
      setMessage('No source file selected.');
      return;
    }
    setState('checking');
    setMessage('Running browser advisory checks…');
    try {
      const bytes = new Uint8Array(await next.slice(0, 32).arrayBuffer());
      const nextIssues = advisoryFileIssues(
        {
          name: next.name,
          size: next.size,
          browserMimeType: next.type,
          bytes,
        },
        profile,
      );
      setIssues(nextIssues);
      setFile(next);
      setPreviewUrl(URL.createObjectURL(next));
      setState(nextIssues.length === 0 ? 'idle' : 'error');
      setMessage(
        nextIssues.length === 0
          ? 'Browser advisory checks passed. The server will still decode and validate the file.'
          : 'Fix the advisory file issues before uploading.',
      );
    } catch {
      setState('error');
      setMessage('This file could not be read by the browser.');
    }
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    if (state === 'uploading' || state === 'processing') return;
    void selectFile(event.dataTransfer.files.item(0));
  }

  function startUpload(): void {
    if (
      file === null ||
      issues.length > 0 ||
      friendlyName.trim().length === 0 ||
      slug.length < 3 ||
      !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(slug) ||
      !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u.test(category)
    ) {
      setState('error');
      setMessage('Complete the identity fields and choose a valid source file.');
      return;
    }
    const fingerprint = [
      file.name,
      String(file.size),
      String(file.lastModified),
      file.type,
      friendlyName.trim(),
      slug,
      assetType,
      category,
      markerKey.trim(),
    ].join('|');
    const attempt = resolveAssetUploadAttempt(attemptRef.current, fingerprint, () =>
      globalThis.crypto.randomUUID(),
    );
    attemptRef.current = attempt;
    const body = new FormData();
    body.set('idempotencyKey', attempt.idempotencyKey);
    body.set('friendlyName', friendlyName.trim());
    body.set('slug', slug);
    body.set('assetType', assetType);
    body.set('category', category);
    body.set('developmentMarkerReplacementKey', markerKey.trim());
    body.set('file', file, file.name);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open('POST', '/api/world-assets/upload');
    xhr.responseType = 'json';
    setState('uploading');
    setProgress(0);
    setMessage('Transferring the source to the protected upload gateway…');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.upload.onload = () => {
      setProgress(100);
      setState('processing');
      setMessage(
        'Transfer complete. The trusted API is decoding, sanitizing, hashing, and validating the image…',
      );
    };
    xhr.onload = () => {
      xhrRef.current = null;
      const envelope = (xhr.response ?? {}) as UploadEnvelope;
      const parsed = assetMutationResponseSchema.safeParse(envelope.data);
      if (xhr.status < 200 || xhr.status >= 300 || envelope.success !== true || !parsed.success) {
        setState('error');
        setMessage(safeUploadMessage(xhr.status));
        return;
      }
      setState('complete');
      setMessage(
        'Authoritative processing completed. Continue to the version workspace to review the result.',
      );
      setResult(parsed.data);
      attemptRef.current = null;
    };
    xhr.onerror = () => {
      xhrRef.current = null;
      setState('error');
      setMessage('The file could not be uploaded. Please try again.');
    };
    xhr.onabort = () => {
      xhrRef.current = null;
      setState('idle');
      setMessage('Upload cancelled before completion.');
    };
    xhr.send(body);
  }

  const busy = state === 'checking' || state === 'uploading' || state === 'processing';

  return (
    <div className="world-asset-upload" data-upload-state={state}>
      <ol className="asset-upload-steps" aria-label="Asset upload steps">
        {[
          'Type',
          'Requirements',
          'File',
          'Secure upload',
          'Processing',
          'Configure',
          'Preview',
          'Review',
        ].map((step, index) => (
          <li className={index <= (result === null ? 2 : 4) ? 'is-current' : ''} key={step}>
            <span>{index + 1}</span>
            {step}
          </li>
        ))}
      </ol>

      <div className="asset-upload-layout">
        <section className="detail-card asset-upload-form" aria-labelledby="upload-identity-title">
          <h2 id="upload-identity-title">1. Choose and identify the asset</h2>
          <div className="field">
            <label htmlFor="upload-asset-type">Asset type</label>
            <PremiumSelect
              disabled={busy}
              id="upload-asset-type"
              onChange={(next) => changeType(next as AssetType)}
              options={ASSET_TYPES.map((type) => ({ value: type, label: assetTypeLabel(type) }))}
              value={assetType}
            />
          </div>
          <div className="asset-upload-form__grid">
            <div className="field">
              <label htmlFor="upload-friendly-name">Friendly name</label>
              <input
                disabled={busy}
                id="upload-friendly-name"
                maxLength={100}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  setFriendlyName(next);
                  if (!slugTouched) setSlug(uploadSlug(next));
                }}
                value={friendlyName}
              />
            </div>
            <div className="field">
              <label htmlFor="upload-slug">Slug</label>
              <input
                disabled={busy}
                id="upload-slug"
                maxLength={96}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(uploadSlug(event.currentTarget.value));
                }}
                pattern="[a-z][a-z0-9]*(?:-[a-z0-9]+)*"
                value={slug}
              />
            </div>
            <div className="field">
              <label htmlFor="upload-category">Category</label>
              <PremiumSelect
                disabled={busy}
                id="upload-category"
                onChange={setCategory}
                options={profile.allowedCategories.map((value) => ({
                  value,
                  label: value.replaceAll('_', ' '),
                }))}
                value={category}
              />
            </div>
            <div className="field">
              <label htmlFor="upload-marker-key">
                Development-marker replacement key (optional)
              </label>
              <input
                disabled={busy}
                id="upload-marker-key"
                maxLength={96}
                onChange={(event) => setMarkerKey(event.currentTarget.value)}
                placeholder="phase7-general-store-marker"
                value={markerKey}
              />
            </div>
          </div>
        </section>

        <aside className="asset-requirements" aria-labelledby="asset-requirements-title">
          <p className="eyebrow">Type-specific guide</p>
          <h2 id="asset-requirements-title">{profile.label}</h2>
          <p>{profile.guidance}</p>
          <dl>
            <div>
              <dt>Ratio</dt>
              <dd>{profile.recommendedRatio}</dd>
            </div>
            <div>
              <dt>Dimensions</dt>
              <dd>{profile.recommendedDimensions}</dd>
            </div>
            <div>
              <dt>Formats</dt>
              <dd>PNG or WebP</dd>
            </div>
            <div>
              <dt>Maximum</dt>
              <dd>{formatAssetBytes(profile.maxFileSizeBytes)}</dd>
            </div>
            <div>
              <dt>Transparency</dt>
              <dd>{profile.transparency}</dd>
            </div>
          </dl>
          <p className="field-hint">
            Do not upload SVG, animated images, code, or a flattened full-map screenshot.
          </p>
        </aside>
      </div>

      <section className="detail-card" aria-labelledby="upload-file-title">
        <h2 id="upload-file-title">2. Select the source file</h2>
        <label
          className={`asset-dropzone ${busy ? 'is-disabled' : ''}`}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <input
            accept="image/png,image/webp,.png,.webp"
            disabled={busy}
            onChange={(event) => void selectFile(event.currentTarget.files?.item(0) ?? null)}
            ref={inputRef}
            type="file"
          />
          <span aria-hidden="true" className="asset-dropzone__icon">
            ⇧
          </span>
          <strong>Drop a PNG or WebP here</strong>
          <span>or choose a file · maximum {formatAssetBytes(profile.maxFileSizeBytes)}</span>
        </label>

        {file === null ? null : (
          <div className="asset-selected-file">
            <div className="asset-selected-file__preview">
              {previewUrl === null ? null : (
                // Local object URLs are advisory previews only and never become delivery references.
                <img alt={`Selected source preview for ${file.name}`} src={previewUrl} />
              )}
            </div>
            <div>
              <strong title={file.name}>{file.name}</strong>
              <span>
                {formatAssetBytes(file.size)} · {file.type || 'unknown browser MIME'}
              </span>
            </div>
            <div className="asset-selected-file__actions">
              <button
                className="button button--quiet"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
                type="button"
              >
                Replace
              </button>
              <button
                className="button button--quiet"
                disabled={busy}
                onClick={() => void selectFile(null)}
                type="button"
              >
                Remove
              </button>
            </div>
          </div>
        )}

        {issues.length === 0 ? null : (
          <ul className="asset-validation-list" role="alert">
            {issues.map((issue) => (
              <li className="is-blocking" key={issue}>
                {issue}
              </li>
            ))}
          </ul>
        )}

        <div className="asset-upload-progress" aria-live="polite">
          <strong>{message}</strong>
          {state === 'uploading' ? (
            <progress max={100} value={progress}>
              {progress}%
            </progress>
          ) : null}
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
          {result === null ? (
            <button
              className="button button--primary"
              disabled={busy || file === null || issues.length > 0}
              onClick={startUpload}
              type="button"
            >
              {busy ? 'Preparing…' : 'Upload securely'}
            </button>
          ) : (
            <Link
              className="button button--primary"
              href={
                result.version === null
                  ? `/world-assets/${result.asset.id}`
                  : `/world-assets/${result.asset.id}/versions/${result.version.id}`
              }
            >
              Continue to configuration
            </Link>
          )}
          <Link className="button button--quiet" href="/world-assets">
            Back to assets
          </Link>
        </div>
      </section>
    </div>
  );
}
