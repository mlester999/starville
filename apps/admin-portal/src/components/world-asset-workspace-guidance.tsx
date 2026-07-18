'use client';

import Link from 'next/link';
import { useActionState, useState, type ReactNode } from 'react';

import {
  createWorldAssetVersionFromExistingAction,
  type WorldAssetActionState,
} from '../app/actions/world-assets';
import type { WorldAssetType } from '../lib/world-assets/contracts';
import {
  defaultAssetGuidanceType,
  type AssetDraftAssessment,
  type AssetGuidanceType,
  type AssetSaveStateModel,
  type AssetVersionEditabilityModel,
} from '../lib/world-assets/workspace-model';
import { PremiumSelect } from './premium-select';
import { WorldAssetNewVersionUpload } from './world-asset-new-version-upload';

const GUIDANCE_TYPES: readonly AssetGuidanceType[] = [
  'Tree',
  'Bush',
  'Cottage',
  'Large Building',
  'Small Prop',
  'Workstation',
  'Crop',
  'Flower',
  'Ground Decoration',
  'Interactive Entrance',
  'Custom',
];

const TYPE_GUIDANCE: Readonly<Record<AssetGuidanceType, readonly string[]>> = {
  Tree: [
    'Foot anchor: bottom-center of the trunk.',
    'Depth anchor: lower-center of the trunk.',
    'Collision: trunk and immediate base only; branches normally do not collide.',
    'Rotation: normally 0° unless directional variants exist.',
    'Transparency is required. Compare scale intentionally against the reference player.',
    'Confirm the silhouette remains readable on mobile.',
    'An interaction point is usually unnecessary unless the tree is harvestable.',
  ],
  Bush: [
    'Choose explicitly whether the bush is decorative/passable or blocking.',
    'Keep collision near the visible ground base, not the full foliage silhouette.',
    'Use the lower center for initial foot and depth anchor review.',
  ],
  Cottage: [
    'Foot anchor: bottom-center of the ground footprint.',
    'Depth anchor: lower-center of the building footprint.',
    'Collision: physical building footprint; roof overhang is normally visual only.',
    'Keep doorway interaction space accessible and compare door scale with the player.',
    'Test the player both in front of and behind the building.',
    'Confirm the silhouette and doorway remain readable on mobile.',
  ],
  'Large Building': [
    'Use footprint-aware anchors and bounded collision without invisible blocked zones.',
    'Preserve accessible entrances and test player depth on every walkable side.',
  ],
  'Small Prop': [
    'Anchor at the visible ground contact and avoid unintended scene-dominating scale.',
    'Use collision only for the physical base when gameplay needs it.',
  ],
  Workstation: [
    'Collide with the furniture footprint and preserve the intended interaction side.',
    'The working surface should generally align near player waist height.',
  ],
  Crop: [
    'Keep the ground contact stable across growth stages and verify mobile readability.',
    'Crop visuals are normally passable unless the established gameplay policy differs.',
  ],
  Flower: [
    'Use the bottom-center of the stem cluster and normally keep flowers passable.',
    'Ensure the flower does not unintentionally approach full player height.',
  ],
  'Ground Decoration': [
    'Keep the visual close to its occupied ground area and normally use no collision.',
  ],
  'Interactive Entrance': [
    'Place the foot anchor below the doorway and preserve usable approach space.',
    'The repository currently stores interaction compatibility, not a separate point.',
  ],
  Custom: [
    'Review ground contact, depth behavior, physical collision, scale, and mobile readability intentionally.',
  ],
};

const LIFECYCLE_STEPS = [
  'Uploaded',
  'Draft',
  'Validated',
  'In Review',
  'Approved',
  'Active',
  'Used in World Draft',
  'Game Tested',
  'World Published',
  'Superseded',
  'Archived',
] as const;

function currentStep(model: AssetVersionEditabilityModel): string {
  if (model.isDraft) return 'Draft';
  if (model.isValidated) return 'Validated';
  if (model.isInReview) return 'In Review';
  if (model.isApproved) return 'Approved';
  if (model.isActive) return 'Active';
  if (model.isArchived) return 'Archived';
  return model.isRejected || model.isRetired ? 'Superseded' : 'Uploaded';
}

function checklist(model: AssetVersionEditabilityModel): readonly string[] {
  if (model.isValidated) {
    return [
      'Review validation results',
      'Inspect the final preview on light, dark, and checkerboard terrain',
      'Confirm foot anchor, depth anchor, collision, and player scale',
      'Compare against the active version',
      'Continue to human review',
      'Create a new version only when changes are required',
    ];
  }
  if (model.isApproved) {
    return [
      'Confirm owner acceptance',
      'Confirm pinned references',
      'Activate only when authorized',
      'Update a world draft separately',
      'Test in the actual game and publish the world separately',
    ];
  }
  if (model.isActive) {
    return [
      'Confirm the active version and inspect references',
      'Use it only in world drafts first',
      'Create the next version for future changes',
      'Never modify the active version directly',
    ];
  }
  if (model.isArchived || model.isRetired) {
    return [
      'Treat this version as retained historical evidence',
      'Inspect whether pinned references remain',
      'Open the current active version for production work',
    ];
  }
  return [
    'Review source artwork, format, transparency, and dimensions',
    'Confirm visual scale against the reference player',
    'Set foot and depth anchors',
    'Configure collision or explicitly keep the asset passable',
    'Preview light, dark, checkerboard, and mobile modes',
    'Save the draft, run validation, and submit for review',
  ];
}

export function WorldAssetWorkspaceGuidance(props: {
  readonly assetId: string;
  readonly assetRevision: number;
  readonly assetType: WorldAssetType;
  readonly sourceVersionId: string;
  readonly editability: AssetVersionEditabilityModel;
  readonly primaryAction?: ReactNode;
  readonly assessment: AssetDraftAssessment;
  readonly saveState: AssetSaveStateModel;
}) {
  const [guidanceType, setGuidanceType] = useState(() => defaultAssetGuidanceType(props.assetType));
  const [showVersionFlow, setShowVersionFlow] = useState(false);
  const [newVersionMode, setNewVersionMode] = useState<'copy' | 'replace' | 'defaults'>('copy');
  const [successorRequestId, setSuccessorRequestId] = useState(() =>
    globalThis.crypto.randomUUID(),
  );
  const [successorState, createSuccessor, creatingSuccessor] = useActionState(
    createWorldAssetVersionFromExistingAction,
    { outcome: 'idle' } satisfies WorldAssetActionState,
  );
  const step = currentStep(props.editability);
  const editabilityLabel = props.editability.isImmutable
    ? 'Locked by lifecycle'
    : props.editability.hasEditPermission
      ? 'Editable'
      : 'Locked by permission';

  return (
    <>
      <section className="asset-workflow-hero" aria-labelledby="asset-workflow-status-title">
        <div>
          <p className="eyebrow">Guided production status</p>
          <h2 id="asset-workflow-status-title">
            Version {props.editability.versionNumber}: {step}
          </h2>
          <p>{props.editability.lifecycleMessage}</p>
          {props.editability.isValidated ? (
            <>
              <p className="field-hint">
                This version is locked because validation has completed. Its artwork and
                configuration are immutable. To change anchors, collision, scale, metadata, or
                rendering configuration, a separate draft version is required.
              </p>
            </>
          ) : null}
        </div>
        <dl className="asset-workflow-hero__facts">
          <div>
            <dt>Status</dt>
            <dd>{step}</dd>
          </div>
          <div>
            <dt>Editability</dt>
            <dd>{editabilityLabel}</dd>
          </div>
          <div>
            <dt>Your role</dt>
            <dd>{props.editability.administratorRoleName}</dd>
          </div>
        </dl>
        <div className="asset-workflow-hero__actions">
          {props.primaryAction}
          {props.editability.canCreateNextVersion ? (
            <button
              aria-expanded={showVersionFlow}
              className="button button--secondary"
              onClick={() => setShowVersionFlow((shown) => !shown)}
              type="button"
            >
              Create new draft version
            </button>
          ) : null}
        </div>
        {showVersionFlow ? (
          <div className="asset-new-version-choice" role="region" aria-label="New version choices">
            <h3>Create Version {props.editability.versionNumber + 1}</h3>
            <p>
              Nothing is created until you explicitly confirm in the protected version flow. The
              current version, active version, and published references remain unchanged; no
              activation or world publication occurs automatically.
            </p>
            <fieldset>
              <legend>Starting point</legend>
              {(
                [
                  ['copy', 'Copy source artwork and configuration'],
                  ['replace', 'Upload replacement artwork'],
                  ['defaults', 'Start with default configuration'],
                ] as const
              ).map(([value, label]) => (
                <label className="asset-checkbox" key={value}>
                  <input
                    checked={newVersionMode === value}
                    name="new-version-mode"
                    onChange={() => {
                      setNewVersionMode(value);
                      setSuccessorRequestId(globalThis.crypto.randomUUID());
                    }}
                    type="radio"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            <ul className="asset-confirmation-list">
              <li>The current version remains unchanged.</li>
              <li>The current active version remains active.</li>
              <li>Published references remain pinned.</li>
              <li>The new version begins as Draft.</li>
              <li>No activation or world publication occurs automatically.</li>
            </ul>
            {newVersionMode === 'replace' ? (
              <WorldAssetNewVersionUpload
                assetId={props.assetId}
                assetRevision={props.assetRevision}
                assetType={props.assetType}
                sourceVersionId={props.sourceVersionId}
              />
            ) : (
              <form action={createSuccessor} className="asset-successor-form">
                <input name="assetId" type="hidden" value={props.assetId} />
                <input name="sourceVersionId" type="hidden" value={props.sourceVersionId} />
                <input name="expectedAssetRevision" type="hidden" value={props.assetRevision} />
                <input name="configurationMode" type="hidden" value={newVersionMode} />
                <input name="requestId" type="hidden" value={successorRequestId} />
                <label className="field">
                  <span>Reason for Version {props.editability.versionNumber + 1}</span>
                  <textarea maxLength={500} minLength={12} name="reason" required rows={3} />
                  <small>Required · 12–500 characters · stored in the audit trail.</small>
                </label>
                <label className="asset-checkbox">
                  <input name="confirmed" required type="checkbox" value="yes" />
                  <span>
                    I understand this creates only a new draft and does not activate or publish it.
                  </span>
                </label>
                <button
                  className="button button--primary"
                  disabled={creatingSuccessor || successorState.outcome === 'success'}
                  type="submit"
                >
                  {creatingSuccessor
                    ? 'Creating draft…'
                    : `Create Version ${String(props.editability.versionNumber + 1)} draft`}
                </button>
                {successorState.message === undefined ? null : (
                  <p
                    aria-live="polite"
                    className={
                      successorState.outcome === 'error' ? 'notice notice--error' : 'notice'
                    }
                    role={successorState.outcome === 'error' ? 'alert' : 'status'}
                  >
                    {successorState.message}
                    {successorState.requestId === undefined
                      ? null
                      : ` Request ID: ${successorState.requestId}.`}
                  </p>
                )}
                {successorState.createdVersionId === undefined ? null : (
                  <Link
                    className="button button--secondary"
                    href={`/world-assets/${encodeURIComponent(props.assetId)}/versions/${encodeURIComponent(successorState.createdVersionId)}`}
                  >
                    Open Version {successorState.createdVersionNumber}
                  </Link>
                )}
              </form>
            )}
          </div>
        ) : null}
      </section>

      <nav className="asset-lifecycle-ribbon" aria-label="Asset lifecycle">
        <ol>
          {LIFECYCLE_STEPS.map((item) => (
            <li aria-current={item === step ? 'step' : undefined} key={item}>
              <span aria-hidden="true">{item === step ? '●' : '○'}</span>
              {item}
            </li>
          ))}
        </ol>
        <p>
          Validated does not mean Active. Active does not update published worlds. Existing world
          references remain pinned until an authorized world-draft change and separate publication.
        </p>
      </nav>

      <div className="asset-guidance-grid">
        <section
          className="detail-card asset-setup-guide"
          aria-labelledby="asset-setup-guide-title"
        >
          <p className="eyebrow">Contextual checklist</p>
          <h2 id="asset-setup-guide-title">Asset Setup Guide</h2>
          <ol>
            {checklist(props.editability).map((item) => (
              <li key={item}>
                <span aria-hidden="true">◇</span>
                {item}
              </li>
            ))}
          </ol>
        </section>

        <section
          className="detail-card asset-next-action"
          aria-labelledby="asset-next-action-title"
        >
          <p className="eyebrow">One safe step</p>
          <h2 id="asset-next-action-title">Next Safe Action</h2>
          <p>{props.editability.nextRecommendedAction}</p>
          {props.editability.isValidated ? (
            <p className="field-hint">
              Review Version {props.editability.versionNumber} and continue to human review when it
              is correct. Create Version {props.editability.versionNumber + 1} only when changes are
              required.
            </p>
          ) : null}
        </section>
      </div>

      <section
        className="detail-card asset-type-guidance"
        aria-labelledby="asset-type-guidance-title"
      >
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Recommendations only</p>
            <h2 id="asset-type-guidance-title">Asset Type Guidance</h2>
          </div>
          <PremiumSelect
            aria-label="Asset Type Guidance"
            onChange={(value) => setGuidanceType(value as AssetGuidanceType)}
            options={GUIDANCE_TYPES.map((value) => ({ value, label: value }))}
            value={guidanceType}
          />
        </div>
        <p className="field-hint">
          Selecting guidance never changes saved configuration. Apply suggestions manually only on
          an authorized draft, then review before saving.
        </p>
        <ul>
          {TYPE_GUIDANCE[guidanceType].map((guidance) => (
            <li key={guidance}>{guidance}</li>
          ))}
        </ul>
      </section>

      <div className="asset-education-grid">
        <details className="detail-card">
          <summary>Understanding Anchors</summary>
          <div className="asset-anchor-diagram">
            <svg aria-labelledby="anchor-diagram-title" role="img" viewBox="0 0 320 170">
              <title id="anchor-diagram-title">
                Object silhouette with foot anchor at ground contact and depth anchor just above it
              </title>
              <path d="M120 20h80l38 100H82z" fill="currentColor" opacity=".18" />
              <path d="M145 65h30v70h-30z" fill="currentColor" opacity=".55" />
              <line x1="45" x2="275" y1="135" y2="135" stroke="currentColor" />
              <circle cx="160" cy="135" fill="#d9a640" r="8" />
              <circle cx="160" cy="112" fill="#b45b54" r="8" />
              <text x="176" y="139">
                Foot anchor
              </text>
              <text x="176" y="116">
                Depth anchor
              </text>
            </svg>
          </div>
          <p>
            <strong>Foot anchor:</strong> the point where the object physically touches the ground.
            For a tree, use the bottom-center of the trunk; for a cottage, use the ground footprint
            or doorway base.
          </p>
          <p>
            <strong>Depth anchor:</strong> determines when a player appears in front of or behind
            the object. Too high hides players too early; too low renders them in front incorrectly.
          </p>
        </details>

        <details className="detail-card">
          <summary>Understanding Collision</summary>
          <p>
            Collision represents the physical ground obstacle, not the complete visible image. Trees
            normally collide at the trunk, cottages at the footprint, and flowers are usually
            passable.
          </p>
          <ul>
            <li>Avoid collision substantially larger than the visible ground footprint.</li>
            <li>Keep collision near the foot anchor and inside normalized bounds.</li>
            <li>Blocking assets need deliberate collision; passable assets should not block.</li>
            <li>Preserve a usable entrance or interaction side.</li>
          </ul>
        </details>

        <details className="detail-card">
          <summary>Player Scale Check</summary>
          <p>
            The reference player is only a size comparison and is never stored with the asset.
            Doorways should look usable, workstation surfaces generally sit near waist height, and
            flowers should remain readable without approaching full player height unintentionally.
          </p>
          <p className="field-hint">
            These are recommendations, not universal enforced values. Trees may intentionally range
            from player height to several times taller.
          </p>
        </details>
      </div>
    </>
  );
}

export function BeforeAssetSave(props: {
  readonly assessment: AssetDraftAssessment;
  readonly saveState: AssetSaveStateModel;
  readonly onGoToFirstIssue: () => void;
}) {
  return (
    <section className="detail-card asset-before-save" aria-labelledby="asset-before-save-title">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Authoritative requirements</p>
          <h2 id="asset-before-save-title">Before You Can Save</h2>
        </div>
        <span
          className={`requirement-state requirement-state--${props.saveState.state.toLowerCase()}`}
        >
          {props.saveState.state.replaceAll('_', ' ')}
        </span>
      </div>
      {props.saveState.issues.length > 0 ? (
        <div className="asset-error-summary" role="alert" aria-live="assertive">
          <strong>
            Save is blocked by {props.saveState.issues.length} issue
            {props.saveState.issues.length === 1 ? '' : 's'}:
          </strong>
          <ol>
            {props.saveState.issues.map((issue) => (
              <li key={`${issue.path}-${issue.message}`}>{issue.message}</li>
            ))}
          </ol>
          <button className="button button--quiet" onClick={props.onGoToFirstIssue} type="button">
            Go to first issue
          </button>
        </div>
      ) : null}
      <ul className="asset-requirement-list">
        {props.assessment.requirements.map((requirement) => (
          <li key={requirement.key}>
            <span className={`requirement-state requirement-state--${requirement.state}`}>
              {requirement.state.replaceAll('_', ' ')}
            </span>
            <div>
              <strong>{requirement.label}</strong>
              <small>{requirement.detail}</small>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
