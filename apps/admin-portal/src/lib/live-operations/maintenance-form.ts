import {
  MAINTENANCE_FALLBACK_MESSAGE,
  MAINTENANCE_FALLBACK_TITLE,
  maintenanceMutationSchema,
  type MaintenanceMutation,
} from '@starville/live-operations';
import { z } from 'zod';

export type MaintenanceActivationMode = 'immediate' | 'scheduled';

export interface MaintenanceFieldErrors {
  readonly [field: string]: string;
}

/** Client-safe action state (must not live in a "use server" module). */
export interface MaintenanceActionState {
  readonly outcome: 'idle' | 'error' | 'success';
  readonly message?: string;
  readonly fieldErrors?: MaintenanceFieldErrors;
  readonly notice?:
    | 'maintenance-enabled'
    | 'maintenance-scheduled'
    | 'maintenance-disabled'
    | 'maintenance-updated';
}

export const INITIAL_MAINTENANCE_ACTION_STATE: MaintenanceActionState = { outcome: 'idle' };

export interface MaintenanceFormParseResult {
  readonly success: true;
  readonly data: MaintenanceMutation;
  readonly requestId: string;
  readonly activationMode: MaintenanceActivationMode;
}

export interface MaintenanceFormParseFailure {
  readonly success: false;
  readonly message: string;
  readonly fieldErrors: MaintenanceFieldErrors;
  readonly activationMode: MaintenanceActivationMode;
}

const FIELD_MESSAGES: Readonly<Record<string, string>> = {
  expectedRevision:
    'Someone else updated maintenance while you were editing. Refresh the page, then review and submit again.',
  enabled: 'Turn on Enable maintenance if you want to activate it, or leave it off to disable.',
  activationMode: 'Choose Start immediately or Schedule for later.',
  scheduledStartAt:
    'Choose Schedule for later, then pick a future date and time in Scheduled start.',
  expectedEndAt:
    'Expected end is optional. If set, it must be later than the start. If Auto-disable is on, Expected end is required.',
  autoDisableAtEnd: 'Turn Auto-disable off, or set a valid Expected end time first.',
  title: 'Enter a player-facing title (1–80 characters, no < or >).',
  message:
    'Enter a player-facing message (1–1000 characters). Use plain text only — no < or > characters.',
  updateDetails: 'Update details must be short plain-text lines without markup.',
  expectedReturnMessage: 'Expected return message must be plain text up to 240 characters.',
  showReturnToLanding: 'Return-to-landing could not be read. Toggle it off and on again.',
  ctaLabel:
    'Custom CTA label and URL must both be filled, or both left blank. Return-to-landing does not need a custom CTA.',
  ctaUrl:
    'Custom CTA URL must start with https:// or an internal path like /help. Pair it with a label.',
  reason:
    'Click Review maintenance change, then enter a reason of at least 12 characters in the dialog.',
  confirmation:
    'For immediate enable, open Review maintenance change and type MAINTENANCE exactly (all caps).',
  requestId: 'This review session expired. Close the dialog, refresh the page, and try again.',
};

export const MAINTENANCE_FIELD_LABELS: Readonly<Record<string, string>> = {
  expectedRevision: 'Configuration version',
  enabled: 'Enable maintenance',
  activationMode: 'Start mode',
  scheduledStartAt: 'Scheduled start',
  expectedEndAt: 'Expected end',
  autoDisableAtEnd: 'Auto-disable',
  title: 'Title',
  message: 'Player message',
  updateDetails: 'Update details',
  expectedReturnMessage: 'Expected return message',
  showReturnToLanding: 'Return to landing',
  ctaLabel: 'Custom CTA label',
  ctaUrl: 'Custom CTA URL',
  reason: 'Administrator reason',
  confirmation: 'Typed confirmation',
  requestId: 'Request session',
};

export function maintenanceFieldLabel(field: string): string {
  return MAINTENANCE_FIELD_LABELS[field] ?? field;
}

export function buildMaintenanceHelpSteps(fieldErrors: MaintenanceFieldErrors): readonly string[] {
  const steps: string[] = [];
  const add = (step: string) => {
    if (!steps.includes(step)) steps.push(step);
  };

  if (fieldErrors['expectedRevision'] || fieldErrors['requestId']) {
    add('Refresh this page to load the latest maintenance configuration.');
  }
  if (fieldErrors['title'] || fieldErrors['message']) {
    add('Fill in the player-facing Title and Player message.');
  }
  if (fieldErrors['scheduledStartAt'] || fieldErrors['activationMode']) {
    add('Under Schedule, choose Schedule for later and set a future Scheduled start time.');
  }
  if (fieldErrors['expectedEndAt'] || fieldErrors['autoDisableAtEnd']) {
    add('Either set a valid Expected end, or turn Auto-disable off.');
  }
  if (fieldErrors['ctaLabel'] || fieldErrors['ctaUrl']) {
    add('For a custom CTA, fill both label and URL, or clear both fields.');
  }
  if (fieldErrors['reason']) {
    add('Click Review maintenance change and enter a reason of at least 12 characters.');
  }
  if (fieldErrors['confirmation']) {
    add('In the review dialog, type MAINTENANCE in all caps, then click Enable Maintenance.');
  }
  if (steps.length === 0) {
    add('Turn on Enable maintenance if you want it active.');
    add('Choose Start immediately or Schedule for later.');
    add('Click Review maintenance change.');
    add('Enter a reason (12+ characters). For immediate enable, also type MAINTENANCE.');
  }
  return steps;
}

/**
 * Normalize browser FormData text:
 * - convert Windows/Mac line endings to \n (safeText only allows LF, not CR)
 * - trim outer whitespace
 */
export function normalizeFormText(value: string): string {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim();
}

export function readFormText(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === 'string' ? normalizeFormText(value) : '';
}

/** True when non-empty text still fails the shared safeText character rules. */
export function hasUnsafePlainText(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return (
      character === '<' ||
      character === '>' ||
      !(code === 10 || (code >= 32 && (code < 127 || code > 159)))
    );
  });
}

/**
 * Safe boolean parsing for browser form controls.
 * Supports "on", "true", "false", and absent fields.
 * Does not treat the string "false" as true.
 */
export function readFormBoolean(data: FormData, key: string): boolean {
  const value = data.get(key);
  if (value === null) return false;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === 'on' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (
    normalized === 'false' ||
    normalized === 'off' ||
    normalized === '0' ||
    normalized === 'no' ||
    normalized === ''
  ) {
    return false;
  }
  return false;
}

export function readActivationMode(data: FormData): MaintenanceActivationMode {
  const raw = readFormText(data, 'activationMode');
  return raw === 'scheduled' ? 'scheduled' : 'immediate';
}

/** Convert datetime-local or ISO input to offset ISO datetime, or null when blank. */
export function normalizeOptionalDateTime(value: string): string | null | 'invalid' {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.valueOf())) return 'invalid';
  return parsed.toISOString();
}

export function nullableOptionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function parseMaintenanceFormData(
  data: FormData,
  options: { readonly now?: Date } = {},
): MaintenanceFormParseResult | MaintenanceFormParseFailure {
  const now = options.now ?? new Date();
  const activationMode = readActivationMode(data);
  const fieldErrors: Record<string, string> = {};

  const requestIdResult = z.uuid().safeParse(readFormText(data, 'requestId'));
  if (!requestIdResult.success) {
    fieldErrors['requestId'] = FIELD_MESSAGES['requestId'] ?? 'Invalid request.';
  }

  const enabled = readFormBoolean(data, 'enabled');
  const expectedRevisionRaw = readFormText(data, 'expectedRevision');
  const expectedRevision = Number(expectedRevisionRaw);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    fieldErrors['expectedRevision'] =
      FIELD_MESSAGES['expectedRevision'] ?? 'Invalid configuration revision.';
  }

  // Disabling only needs a reason. Keep stored content safe for the next enable without
  // forcing the administrator to re-edit title/message/schedule.
  let scheduledStartAt: string | null = null;
  let expectedEndAt: string | null = null;
  let autoDisableAtEnd = false;
  const showReturnToLanding = readFormBoolean(data, 'showReturnToLanding');
  let ctaLabel = nullableOptionalText(readFormText(data, 'ctaLabel'));
  let ctaUrl = nullableOptionalText(readFormText(data, 'ctaUrl'));
  let title = readFormText(data, 'title');
  let message = readFormText(data, 'message');
  const updateDetails = readFormText(data, 'updateDetails')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

  if (enabled) {
    if (activationMode === 'scheduled') {
      const start = normalizeOptionalDateTime(readFormText(data, 'scheduledStartAt'));
      if (start === null) {
        fieldErrors['scheduledStartAt'] = 'Scheduled start is required for scheduled maintenance.';
      } else if (start === 'invalid') {
        fieldErrors['scheduledStartAt'] = 'Scheduled start must be a valid date and time.';
      } else if (new Date(start).valueOf() <= now.valueOf()) {
        fieldErrors['scheduledStartAt'] = 'Scheduled start must be in the future.';
      } else {
        scheduledStartAt = start;
      }
    }

    const endRaw = normalizeOptionalDateTime(readFormText(data, 'expectedEndAt'));
    if (endRaw === 'invalid') {
      fieldErrors['expectedEndAt'] = 'Expected end must be a valid date and time.';
    } else if (endRaw !== null) {
      expectedEndAt = endRaw;
    }

    autoDisableAtEnd = readFormBoolean(data, 'autoDisableAtEnd');
    if (expectedEndAt === null) {
      autoDisableAtEnd = false;
    }

    if (expectedEndAt !== null) {
      if (activationMode === 'immediate' && new Date(expectedEndAt).valueOf() <= now.valueOf()) {
        fieldErrors['expectedEndAt'] = 'Expected end must be in the future.';
      }
      if (
        activationMode === 'scheduled' &&
        scheduledStartAt !== null &&
        new Date(expectedEndAt).valueOf() <= new Date(scheduledStartAt).valueOf()
      ) {
        fieldErrors['expectedEndAt'] = 'Expected end must be later than scheduled start.';
      }
    }

    if (autoDisableAtEnd && expectedEndAt === null) {
      fieldErrors['autoDisableAtEnd'] =
        'Expected end is required when automatic shutdown is enabled.';
      fieldErrors['expectedEndAt'] =
        fieldErrors['expectedEndAt'] ??
        'Expected end is required when automatic shutdown is enabled.';
    }

    // Return-to-landing is a built-in client action and does not require custom CTA fields.
    // Custom CTA label/URL remain optional and must stay paired when provided.
    if ((ctaLabel === null) !== (ctaUrl === null)) {
      fieldErrors['ctaLabel'] = FIELD_MESSAGES['ctaLabel'] ?? 'CTA fields must be paired.';
      fieldErrors['ctaUrl'] = FIELD_MESSAGES['ctaUrl'] ?? 'CTA URL is invalid.';
    }

    if (title.length < 1) {
      fieldErrors['title'] = FIELD_MESSAGES['title'] ?? 'Title is required.';
    } else if (hasUnsafePlainText(title)) {
      fieldErrors['title'] =
        'Title contains unsupported characters. Remove <, >, and control characters.';
    }
    if (message.length < 1) {
      fieldErrors['message'] = FIELD_MESSAGES['message'] ?? 'Message is required.';
    } else if (hasUnsafePlainText(message)) {
      fieldErrors['message'] =
        'Player message contains unsupported characters. Multi-line text is allowed; remove <, >, and control characters.';
    } else if (message.length > 1000) {
      fieldErrors['message'] = 'Player message must be 1000 characters or fewer.';
    }
  } else {
    // Disable path: clear schedule, keep/fallback content for storage, ignore CTA pairing.
    scheduledStartAt = null;
    expectedEndAt = null;
    autoDisableAtEnd = false;
    if (title.length < 1 || hasUnsafePlainText(title)) title = MAINTENANCE_FALLBACK_TITLE;
    if (message.length < 1 || hasUnsafePlainText(message)) message = MAINTENANCE_FALLBACK_MESSAGE;
    if ((ctaLabel === null) !== (ctaUrl === null)) {
      ctaLabel = null;
      ctaUrl = null;
    }
  }

  const reason = readFormText(data, 'reason');
  if (reason.length < 12) {
    fieldErrors['reason'] = FIELD_MESSAGES['reason'] ?? 'Reason is required.';
  }

  const confirmationRaw = readFormText(data, 'confirmation');
  const confirmation = confirmationRaw === '' ? undefined : confirmationRaw;
  const immediateActivation = enabled && activationMode === 'immediate';
  if (immediateActivation && confirmation !== 'MAINTENANCE') {
    fieldErrors['confirmation'] = FIELD_MESSAGES['confirmation'] ?? 'Confirmation required.';
  }

  const payload = {
    expectedRevision: Number.isInteger(expectedRevision) ? expectedRevision : -1,
    enabled,
    scheduledStartAt,
    expectedEndAt,
    autoDisableAtEnd,
    title,
    message,
    updateDetails,
    expectedReturnMessage: nullableOptionalText(readFormText(data, 'expectedReturnMessage')),
    showReturnToLanding,
    ctaLabel,
    ctaUrl,
    reason,
    confirmation,
  };

  const parsed = maintenanceMutationSchema.safeParse(payload);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'form');
      if (fieldErrors[key] === undefined) {
        fieldErrors[key] = FIELD_MESSAGES[key] ?? 'This field is invalid.';
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0 || !parsed.success || !requestIdResult.success) {
    const primaryField =
      [
        'confirmation',
        'reason',
        'scheduledStartAt',
        'expectedEndAt',
        'ctaLabel',
        'ctaUrl',
        'title',
        'message',
        'expectedRevision',
        'requestId',
      ].find((field) => fieldErrors[field] !== undefined) ?? Object.keys(fieldErrors)[0];
    const summary =
      (primaryField !== undefined ? fieldErrors[primaryField] : undefined) ??
      'Fix the items below, then click Review maintenance change again.';
    return {
      success: false,
      message: summary,
      fieldErrors,
      activationMode,
    };
  }

  return {
    success: true,
    data: parsed.data,
    requestId: requestIdResult.data,
    activationMode,
  };
}

export function defaultActivationMode(options: {
  readonly enabled: boolean;
  readonly scheduledStartAt: string | null;
  readonly now?: Date;
}): MaintenanceActivationMode {
  const now = options.now ?? new Date();
  if (
    options.scheduledStartAt !== null &&
    !Number.isNaN(new Date(options.scheduledStartAt).valueOf()) &&
    new Date(options.scheduledStartAt).valueOf() > now.valueOf()
  ) {
    return 'scheduled';
  }
  return 'immediate';
}
