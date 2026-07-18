'use client';

import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  ASSET_TYPES,
  assetMutationResponseSchema,
  type AssetMutationResponse,
  type AssetType,
} from '@starville/asset-management';

import {
  inspectClientImage,
  inspectionBlockingMessages,
  type ClientImageInspection,
} from '../lib/world-assets/image-inspection';
import type { PlaceholderMarkerOption } from '../lib/world-assets/placeholder-markers';
import {
  assetCategoryLabel,
  assetTypeLabel,
  assetTypeProfile,
  defaultCategoryForAssetType,
  formatAssetBytes,
} from '../lib/world-assets/profiles';
import { assetRequirementGuide } from '../lib/world-assets/requirements';
import {
  resolveAssetUploadAttempt,
  type AssetUploadAttempt,
} from '../lib/world-assets/upload-attempt';
import {
  assetSlugValidationMessage,
  FRIENDLY_NAME_MAX_LENGTH,
  friendlyNameValidationMessage,
  generateAssetSlug,
  isValidAssetSlug,
  normalizeFriendlyName,
  slugCollisionMessage,
} from '../lib/world-assets/upload';
import { PremiumSelect } from './premium-select';
import { WorldAssetPlaceholderSelector } from './world-asset-placeholder-selector';

type UploadState = 'idle' | 'checking' | 'uploading' | 'processing' | 'complete' | 'error';
type WizardStep = 1 | 2 | 3 | 4;

interface UploadEnvelope {
  readonly success?: unknown;
  readonly data?: unknown;
  readonly error?: unknown;
}

interface SlugAvailabilityData {
  readonly slug: string;
  readonly available: boolean;
  readonly reason: string;
  readonly suggestion: string | null;
}

const WIZARD_STEPS = [
  'Type',
  'Requirements',
  'File',
  'Secure upload',
  'Processing',
  'Configure',
  'Preview',
  'Review',
] as const;

function safeUploadMessage(status: number): string {
  if (status === 409) {
    return 'This asset ID is already in use, or an identical version already exists. Adjust the friendly name and try again.';
  }
  if (status === 413) return 'This file is larger than the allowed source size.';
  if (status === 415 || status === 422) return 'This is not a supported PNG or WebP image.';
  if (status === 429) return 'Too many uploads were attempted. Wait briefly and try again.';
  return 'The file could not be uploaded. Please try again.';
}

function currentStepIndex(
  step: WizardStep,
  state: UploadState,
  result: AssetMutationResponse | null,
): number {
  if (result !== null || state === 'complete') return 4;
  if (state === 'processing') return 4;
  if (state === 'uploading') return 3;
  if (step === 1) return 0;
  if (step === 2) return 1;
  if (step === 3) return 2;
  return 3;
}

export function WorldAssetUploadWizard(props: {
  readonly markerOptions?: readonly PlaceholderMarkerOption[];
  readonly canBindPlaceholder?: boolean;
}) {
  const markerOptions = props.markerOptions ?? [];
  const canBindPlaceholder = props.canBindPlaceholder === true;
  const slugLiveId = useId();
  const nameErrorId = useId();

  const [step, setStep] = useState<WizardStep>(1);
  const [assetType, setAssetType] = useState<AssetType>('building');
  const [friendlyName, setFriendlyName] = useState('');
  const [category, setCategory] = useState(defaultCategoryForAssetType('building'));
  const [markerKey, setMarkerKey] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageMeta, setImageMeta] = useState<{ width: number; height: number } | null>(null);
  const [inspection, setInspection] = useState<ClientImageInspection | null>(null);
  const [issues, setIssues] = useState<readonly string[]>([]);
  const [state, setState] = useState<UploadState>('idle');
  const requirementGuide = assetRequirementGuide(assetType);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('Choose an asset type and friendly name to begin.');
  const [result, setResult] = useState<AssetMutationResponse | null>(null);
  const [slugAvailability, setSlugAvailability] = useState<SlugAvailabilityData | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);
  const [guideOpen, setGuideOpen] = useState(true);
  const [nameTouched, setNameTouched] = useState(false);
  const [identityAttempted, setIdentityAttempted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const friendlyNameRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const attemptRef = useRef<AssetUploadAttempt | null>(null);
  const profile = assetTypeProfile(assetType);

  const generatedSlug = useMemo(() => generateAssetSlug(friendlyName), [friendlyName]);
  const nameError = friendlyNameValidationMessage(friendlyName);
  const slugError = assetSlugValidationMessage(generatedSlug, friendlyName);
  const collisionError =
    slugAvailability !== null &&
    slugAvailability.slug === generatedSlug &&
    !slugAvailability.available &&
    slugAvailability.reason === 'taken'
      ? slugCollisionMessage(generatedSlug, slugAvailability.suggestion ?? generatedSlug)
      : null;
  const showNameValidation = nameTouched || identityAttempted;
  const visibleNameError = showNameValidation ? nameError : null;
  const visibleSlugError =
    showNameValidation && normalizeFriendlyName(friendlyName).length > 0 ? slugError : null;
  const visibleCollisionError = showNameValidation ? collisionError : null;
  const identityReady =
    nameError === null &&
    slugError === null &&
    isValidAssetSlug(generatedSlug) &&
    collisionError === null &&
    !slugChecking;
  const selectedMarker = markerOptions.find((marker) => marker.key === markerKey) ?? null;
  const guideEssentials = useMemo(() => {
    return [
      requirementGuide.transparency === 'required'
        ? `Transparent ${requirementGuide.formats.join(' or ')}`
        : `${requirementGuide.formats.join(' or ')} source file`,
      requirementGuide.previewMode === 'isometric'
        ? 'Approved isometric perspective with clean padding'
        : 'Keep the subject centered with clean padding',
      'No screenshot or full-map background',
    ];
  }, [requirementGuide]);

  useEffect(() => {
    return () => {
      if (previewUrl !== null) URL.revokeObjectURL(previewUrl);
      xhrRef.current?.abort();
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!isValidAssetSlug(generatedSlug)) {
      setSlugAvailability(null);
      setSlugChecking(false);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setSlugChecking(true);
      void fetch(`/api/world-assets/slug-availability?slug=${encodeURIComponent(generatedSlug)}`, {
        method: 'GET',
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
      })
        .then(async (response) => {
          if (!response.ok) return null;
          const envelope = (await response.json()) as {
            readonly success?: unknown;
            readonly data?: SlugAvailabilityData;
          };
          return envelope.success === true && envelope.data !== undefined ? envelope.data : null;
        })
        .then((data) => {
          if (cancelled) return;
          setSlugAvailability(data);
          setSlugChecking(false);
        })
        .catch(() => {
          if (cancelled) return;
          setSlugAvailability(null);
          setSlugChecking(false);
        });
    }, 320);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [generatedSlug]);

  function changeType(next: AssetType): void {
    setAssetType(next);
    setCategory(defaultCategoryForAssetType(next));
    setMarkerKey(null);
    setMessage('Review the requirements for this asset type.');
    // Re-run advisory inspection against the new type profile when a file is already chosen.
    if (file !== null) {
      void (async () => {
        setState('checking');
        try {
          const nextInspection = await inspectClientImage(file, assetTypeProfile(next));
          setInspection(nextInspection);
          setIssues(inspectionBlockingMessages(nextInspection));
          setState(nextInspection.passed ? 'idle' : 'error');
        } catch {
          setState('error');
        }
      })();
    } else {
      setIssues([]);
      setInspection(null);
    }
  }

  async function selectFile(next: File | null): Promise<void> {
    if (previewUrl !== null) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setImageMeta(null);
    setInspection(null);
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
      const nextInspection = await inspectClientImage(next, profile);
      const nextIssues = inspectionBlockingMessages(nextInspection);
      setInspection(nextInspection);
      setIssues(nextIssues);
      setFile(next);
      setPreviewUrl(URL.createObjectURL(next));
      setImageMeta(
        nextInspection.width === null || nextInspection.height === null
          ? null
          : { width: nextInspection.width, height: nextInspection.height },
      );
      setState(nextIssues.length === 0 ? 'idle' : 'error');
      setMessage(
        nextIssues.length === 0
          ? nextInspection.warningCount > 0
            ? 'Advisory checks found warnings. You can continue; the trusted server still validates the file.'
            : 'Browser advisory checks passed. The server will still decode and validate the file.'
          : 'Fix the blocking advisory issues before uploading.',
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
    const trimmedName = normalizeFriendlyName(friendlyName);
    if (
      file === null ||
      issues.length > 0 ||
      nameError !== null ||
      slugError !== null ||
      collisionError !== null ||
      !isValidAssetSlug(generatedSlug) ||
      !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u.test(category)
    ) {
      setState('error');
      setMessage('Complete the identity fields and choose a valid source file.');
      setStep(1);
      return;
    }
    const fingerprint = [
      file.name,
      String(file.size),
      String(file.lastModified),
      file.type,
      trimmedName,
      generatedSlug,
      assetType,
      category,
      markerKey ?? '',
    ].join('|');
    const attempt = resolveAssetUploadAttempt(attemptRef.current, fingerprint, () =>
      globalThis.crypto.randomUUID(),
    );
    attemptRef.current = attempt;
    const body = new FormData();
    body.set('idempotencyKey', attempt.idempotencyKey);
    body.set('friendlyName', trimmedName);
    body.set('slug', generatedSlug);
    body.set('assetType', assetType);
    body.set('category', category);
    // Ordinary creation omits marker binding unless the owner intentionally selected one.
    if (markerKey !== null && markerKey.length > 0) {
      body.set('developmentMarkerReplacementKey', markerKey);
    }
    body.set('file', file, file.name);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open('POST', '/api/world-assets/upload');
    xhr.responseType = 'json';
    setStep(4);
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
        if (xhr.status === 409) setStep(1);
        return;
      }
      setState('complete');
      setMessage('A draft asset was created. Continue to configuration — nothing is live yet.');
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
  const stepIndex = currentStepIndex(step, state, result);
  const showCharCount = friendlyName.length >= 60;

  function continueFromIdentity(): void {
    setIdentityAttempted(true);
    setNameTouched(true);
    if (!identityReady) {
      friendlyNameRef.current?.focus();
      setMessage('Complete the friendly name before continuing.');
      return;
    }
    setStep(2);
    setMessage('Review the requirements for this asset type.');
  }

  return (
    <div className="world-asset-upload" data-upload-state={state}>
      <ol className="asset-upload-steps" aria-label="Asset upload steps">
        {WIZARD_STEPS.map((label, index) => (
          <li className={index <= stepIndex ? 'is-current' : ''} key={label}>
            <span>{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {!guideOpen ? (
        <div className="asset-upload-toolbar">
          <button
            aria-controls="asset-requirements-panel"
            aria-expanded={false}
            className="button button--quiet asset-requirements__toggle"
            onClick={() => setGuideOpen(true)}
            type="button"
          >
            Show type guide
          </button>
        </div>
      ) : null}

      <div className={`asset-upload-layout ${guideOpen ? '' : 'is-guide-collapsed'}`}>
        <div className="asset-upload-primary">
          {step === 1 ? (
            <section
              className="detail-card asset-upload-form"
              aria-labelledby="upload-identity-title"
            >
              <h2 id="upload-identity-title">1. Identify the asset</h2>
              <p className="field-hint">
                Enter only what you already know. Technical identifiers are generated for you.
              </p>

              <div className="field">
                <label htmlFor="upload-asset-type">Asset type</label>
                <p className="field-hint" id="upload-asset-type-hint">
                  Chooses validation rules, recommended size, and library placement.
                </p>
                <PremiumSelect
                  disabled={busy}
                  id="upload-asset-type"
                  onChange={(next) => changeType(next as AssetType)}
                  options={ASSET_TYPES.map((type) => ({
                    value: type,
                    label: assetTypeLabel(type),
                  }))}
                  value={assetType}
                />
              </div>

              <div
                className={`field ${visibleNameError !== null || visibleCollisionError !== null ? 'field--error' : ''}`}
              >
                <label htmlFor="upload-friendly-name">Friendly name</label>
                <p className="field-hint" id="upload-friendly-name-hint">
                  This is the readable name shown in World Assets and the World Editor.
                </p>
                <input
                  aria-describedby={`upload-friendly-name-hint ${visibleNameError !== null || visibleCollisionError !== null ? nameErrorId : ''}`.trim()}
                  aria-invalid={visibleNameError !== null || visibleCollisionError !== null}
                  disabled={busy}
                  id="upload-friendly-name"
                  maxLength={FRIENDLY_NAME_MAX_LENGTH}
                  onBlur={() => setNameTouched(true)}
                  onChange={(event) => setFriendlyName(event.currentTarget.value)}
                  placeholder="Village Supply Shop"
                  ref={friendlyNameRef}
                  value={friendlyName}
                />
                {showCharCount ? (
                  <p className="field-hint asset-char-count">
                    {friendlyName.length}/{FRIENDLY_NAME_MAX_LENGTH}
                  </p>
                ) : null}
                {visibleNameError === null && visibleCollisionError === null ? null : (
                  <p className="field-error" id={nameErrorId} role="alert">
                    {visibleNameError ?? visibleCollisionError}
                  </p>
                )}
              </div>

              <div className="field asset-id-preview">
                <span className="asset-id-preview__label" id={`${slugLiveId}-label`}>
                  Asset ID
                </span>
                <p className="field-hint" id={`${slugLiveId}-hint`}>
                  Generated automatically from the friendly name. It becomes stable after the asset
                  is created.
                </p>
                <output
                  aria-atomic="true"
                  aria-describedby={`${slugLiveId}-hint`}
                  aria-labelledby={`${slugLiveId}-label`}
                  aria-live="polite"
                  className={`asset-id-preview__value ${generatedSlug.length === 0 ? 'is-empty' : ''}`}
                  htmlFor="upload-friendly-name"
                  id={slugLiveId}
                >
                  {generatedSlug.length === 0
                    ? 'Will be generated from the friendly name'
                    : generatedSlug}
                </output>
                {slugChecking ? <p className="field-hint">Checking availability…</p> : null}
                {visibleSlugError === null ? null : (
                  <p className="field-error" role="alert">
                    {visibleSlugError}
                  </p>
                )}
                {showNameValidation &&
                slugAvailability?.available === true &&
                generatedSlug === slugAvailability.slug ? (
                  <p className="field-hint asset-id-preview__ok">Available</p>
                ) : null}
              </div>

              <div className="field">
                <label htmlFor="upload-category">Category</label>
                <p className="field-hint" id="upload-category-hint">
                  Controls where this asset appears in the asset library.
                </p>
                <PremiumSelect
                  disabled={busy}
                  id="upload-category"
                  onChange={setCategory}
                  options={profile.allowedCategories.map((value) => ({
                    value,
                    label: assetCategoryLabel(value),
                  }))}
                  value={category}
                />
              </div>

              {canBindPlaceholder ? (
                <WorldAssetPlaceholderSelector
                  assetType={assetType}
                  canSelect={canBindPlaceholder}
                  disabled={busy}
                  markers={markerOptions}
                  onSelect={setMarkerKey}
                  selectedKey={markerKey}
                />
              ) : null}

              <footer className="wizard-actions">
                <button
                  className="button button--primary"
                  disabled={busy}
                  onClick={continueFromIdentity}
                  type="button"
                >
                  Continue to requirements
                </button>
              </footer>
            </section>
          ) : null}

          {step === 2 ? (
            <section
              className="detail-card asset-upload-form"
              aria-labelledby="upload-requirements-title"
            >
              <h2 id="upload-requirements-title">2. Requirements for {profile.label}</h2>
              <p className="field-hint">
                Recommended targets only. The trusted server remains authoritative.
              </p>
              <div>
                <h3 className="asset-id-preview__label">Essentials</h3>
                <ul className="asset-guide-essentials">
                  {guideEssentials.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <dl className="asset-requirements-inline">
                <div>
                  <dt>Formats</dt>
                  <dd>{requirementGuide.formats.join(' or ')}</dd>
                </div>
                <div>
                  <dt>Recommended dimensions</dt>
                  <dd>{requirementGuide.recommendedDimensionsLabel}</dd>
                </div>
                <div>
                  <dt>Recommended ratio</dt>
                  <dd>{requirementGuide.recommendedRatio}</dd>
                </div>
                <div>
                  <dt>Transparency</dt>
                  <dd>{requirementGuide.transparency === 'required' ? 'Required' : 'Optional'}</dd>
                </div>
                <div>
                  <dt>Maximum size</dt>
                  <dd>{requirementGuide.maxFileSizeLabel}</dd>
                </div>
              </dl>
              <p className="asset-guide-mistake">
                Common mistake: clipped roofs, solid black backgrounds, or flattened full-map
                screenshots.
              </p>
              <p className="field-hint">
                Need a blank canvas? Open the{' '}
                <Link href="/world-assets/guide">Asset Guide &amp; Templates</Link> page to download
                a local transparent PNG template.
              </p>
              <footer className="wizard-actions">
                <button
                  className="button button--quiet"
                  disabled={busy}
                  onClick={() => setStep(1)}
                  type="button"
                >
                  Back
                </button>
                <button
                  className="button button--primary"
                  disabled={busy}
                  onClick={() => setStep(3)}
                  type="button"
                >
                  Continue to file
                </button>
              </footer>
            </section>
          ) : null}

          {step === 3 || step === 4 ? (
            <section className="detail-card" aria-labelledby="upload-file-title">
              <h2 id="upload-file-title">
                {step === 4 ? '4–5. Secure upload and processing' : '3. Select the source file'}
              </h2>
              {step === 3 ? (
                <>
                  <label
                    className={`asset-dropzone ${busy ? 'is-disabled' : ''}`}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={handleDrop}
                  >
                    <input
                      accept="image/png,image/webp,.png,.webp"
                      disabled={busy}
                      onChange={(event) =>
                        void selectFile(event.currentTarget.files?.item(0) ?? null)
                      }
                      ref={inputRef}
                      type="file"
                    />
                    <span aria-hidden="true" className="asset-dropzone__icon">
                      ⇧
                    </span>
                    <strong>Drop a PNG or WebP here</strong>
                    <span>
                      or choose a file · maximum {formatAssetBytes(profile.maxFileSizeBytes)}
                    </span>
                    <span className="button button--secondary asset-dropzone__choose">
                      Choose file
                    </span>
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
                          {formatAssetBytes(file.size)}
                          {imageMeta === null
                            ? ''
                            : ` · ${String(imageMeta.width)} × ${String(imageMeta.height)}`}
                          {` · ${file.type || 'unknown browser MIME'}`}
                        </span>
                        <span
                          className={
                            issues.length === 0
                              ? inspection !== null && inspection.warningCount > 0
                                ? 'asset-file-status asset-file-status--warn'
                                : 'asset-file-status asset-file-status--ok'
                              : 'asset-file-status asset-file-status--error'
                          }
                        >
                          {issues.length === 0
                            ? inspection !== null && inspection.warningCount > 0
                              ? `${String(inspection.warningCount)} advisory warning(s)`
                              : 'Advisory checks passed'
                            : 'Blocking advisory issues found'}
                        </span>
                        {inspection === null ? null : (
                          <span>
                            Transparency:{' '}
                            {inspection.hasTransparency === null
                              ? 'not sampled'
                              : inspection.hasTransparency
                                ? 'detected'
                                : 'not detected'}
                          </span>
                        )}
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
                </>
              ) : null}

              <div className="asset-upload-progress" aria-live="polite">
                <strong>{message}</strong>
                {state === 'uploading' ? (
                  <progress max={100} value={progress}>
                    {progress}%
                  </progress>
                ) : null}
                {state === 'processing' ? <progress>Processing</progress> : null}
              </div>

              {result === null && step === 3 ? (
                <aside className="asset-upload-review" aria-label="Draft creation summary">
                  <h3>Review before upload</h3>
                  <dl>
                    <div>
                      <dt>Friendly name</dt>
                      <dd>{normalizeFriendlyName(friendlyName) || '—'}</dd>
                    </div>
                    <div>
                      <dt>Asset ID</dt>
                      <dd>
                        <code>{generatedSlug || '—'}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Type</dt>
                      <dd>{assetTypeLabel(assetType)}</dd>
                    </div>
                    <div>
                      <dt>Category</dt>
                      <dd>{assetCategoryLabel(category)}</dd>
                    </div>
                    <div>
                      <dt>Source file</dt>
                      <dd>{file?.name ?? 'None selected'}</dd>
                    </div>
                    <div>
                      <dt>Dimensions</dt>
                      <dd>
                        {imageMeta === null
                          ? 'Pending selection'
                          : `${String(imageMeta.width)} × ${String(imageMeta.height)}`}
                      </dd>
                    </div>
                    <div>
                      <dt>Placeholder replacement</dt>
                      <dd>
                        {selectedMarker === null
                          ? 'Not replacing a placeholder'
                          : selectedMarker.friendlyName}
                      </dd>
                    </div>
                    <div>
                      <dt>Result</dt>
                      <dd>A draft asset only — not live, not activated</dd>
                    </div>
                  </dl>
                </aside>
              ) : null}

              <footer className="wizard-actions">
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
                  <>
                    <button
                      className="button button--quiet"
                      disabled={busy}
                      onClick={() => setStep(step === 4 ? 3 : 2)}
                      type="button"
                    >
                      Back
                    </button>
                    <button
                      className="button button--primary"
                      disabled={busy || file === null || issues.length > 0 || !identityReady}
                      onClick={startUpload}
                      type="button"
                    >
                      {busy ? 'Preparing…' : 'Upload securely as draft'}
                    </button>
                  </>
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
              </footer>
            </section>
          ) : null}
        </div>

        {guideOpen ? (
          <aside
            className="asset-requirements detail-card"
            aria-labelledby="asset-requirements-title"
            id="asset-requirements-panel"
          >
            <div className="asset-requirements__header">
              <div>
                <p className="eyebrow">Type-specific guide</p>
                <h2 id="asset-requirements-title">{profile.label}</h2>
              </div>
              <button
                aria-controls="asset-requirements-body"
                aria-expanded={true}
                aria-label={`Hide ${profile.label} type guide`}
                className="button button--quiet asset-requirements__toggle"
                onClick={() => setGuideOpen(false)}
                type="button"
              >
                Hide
              </button>
            </div>
            <div className="asset-requirements__body" id="asset-requirements-body">
              <p>{profile.description}</p>
              <div>
                <h3 className="asset-id-preview__label">Essentials</h3>
                <ul className="asset-guide-essentials">
                  {guideEssentials.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <dl>
                <div>
                  <dt>Recommended ratio</dt>
                  <dd>{profile.recommendedRatio}</dd>
                </div>
                <div>
                  <dt>Recommended dimensions</dt>
                  <dd>{profile.recommendedDimensions}</dd>
                </div>
                <div>
                  <dt>Maximum size</dt>
                  <dd>{formatAssetBytes(profile.maxFileSizeBytes)}</dd>
                </div>
                <div>
                  <dt>Transparency</dt>
                  <dd>{profile.transparency === 'required' ? 'Required' : 'Optional'}</dd>
                </div>
              </dl>
              <p className="asset-guide-mistake">
                Common mistake: clipped roof, opaque background, or full-map screenshot.
              </p>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
