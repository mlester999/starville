'use server';

import {
  BRANDING_ASSET_PROFILES,
  platformConfigurationSchema,
} from '@starville/platform-configuration';
import type { PLATFORM_FONT_REGISTRY, PlatformIconKey } from '@starville/platform-configuration';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { requireAuthorizedAdmin } from '../../lib/auth/authorization';
import {
  applyPlatformVersionAction,
  createPlatformDraft,
  loadPlatformConfiguration,
  updatePlatformDraft,
} from '../../lib/platform-configuration/api';

const uuid = z.uuid();
const sectionSchema = z.enum([
  'branding',
  'theme',
  'typography',
  'admin-login',
  'landing',
  'navigation',
  'modules',
]);
const text = (data: FormData, key: string) =>
  typeof data.get(key) === 'string' ? String(data.get(key)).trim() : '';
const nullable = (value: string) => (value === '' ? null : value);
const number = (data: FormData, key: string) => Number(text(data, key));

function finish(notice: string): never {
  revalidatePath('/platform-settings', 'layout');
  redirect(`/platform-settings?notice=${encodeURIComponent(notice)}`);
}

export async function createPlatformDraftAction(data: FormData): Promise<never> {
  await requireAuthorizedAdmin('platform_configuration.edit');
  const requestId = uuid.safeParse(text(data, 'requestId'));
  const reason = text(data, 'reason');
  if (!requestId.success || reason.length < 3) finish('invalid-request');
  await createPlatformDraft(reason, requestId.data);
  finish('draft-created');
}

export async function savePlatformSectionAction(data: FormData): Promise<never> {
  await requireAuthorizedAdmin('platform_configuration.edit');
  const versionId = uuid.safeParse(text(data, 'versionId'));
  const requestId = uuid.safeParse(text(data, 'requestId'));
  const section = sectionSchema.safeParse(text(data, 'section'));
  const expectedRevision = number(data, 'expectedRevision');
  const reason = text(data, 'reason');
  if (
    !versionId.success ||
    !requestId.success ||
    !section.success ||
    !Number.isInteger(expectedRevision) ||
    reason.length < 3
  ) {
    finish('invalid-request');
  }

  const state = await loadPlatformConfiguration();
  const selected = state.versions.find(({ id }) => id === versionId.data);
  if (selected === undefined || selected.lifecycleStatus !== 'draft') finish('draft-changed');
  const configuration = structuredClone(selected.configuration);

  switch (section.data) {
    case 'branding':
      configuration.branding = {
        fullGameName: text(data, 'fullGameName'),
        shortGameName: text(data, 'shortGameName'),
        administrationName: text(data, 'administrationName'),
        tagline: text(data, 'tagline'),
        shortDescription: text(data, 'shortDescription'),
        supportEmail: nullable(text(data, 'supportEmail')),
        copyrightText: text(data, 'copyrightText'),
        primaryWebsiteUrl: nullable(text(data, 'primaryWebsiteUrl')),
        documentationUrl: nullable(text(data, 'documentationUrl')),
        discordUrl: nullable(text(data, 'discordUrl')),
        xUrl: nullable(text(data, 'xUrl')),
        communityUrl: nullable(text(data, 'communityUrl')),
        legalUrl: nullable(text(data, 'legalUrl')),
        privacyUrl: nullable(text(data, 'privacyUrl')),
        termsUrl: nullable(text(data, 'termsUrl')),
      };
      for (const profile of BRANDING_ASSET_PROFILES) {
        const value = nullable(text(data, `asset_${profile}`));
        configuration.brandingAssets[profile] = value;
      }
      break;
    case 'theme':
      configuration.theme.preset = text(data, 'preset') as typeof configuration.theme.preset;
      for (const key of Object.keys(
        configuration.theme.tokens,
      ) as (keyof typeof configuration.theme.tokens)[]) {
        configuration.theme.tokens[key] = text(data, `token_${key}`);
      }
      break;
    case 'typography':
      for (const key of ['display', 'heading', 'body', 'monospace'] as const) {
        configuration.typography[key] = text(data, key) as keyof typeof PLATFORM_FONT_REGISTRY;
      }
      break;
    case 'admin-login':
      configuration.adminLogin = {
        eyebrow: text(data, 'eyebrow'),
        title: text(data, 'title'),
        subtitle: text(data, 'subtitle'),
        supportingDescription: text(data, 'supportingDescription'),
        backgroundFocalPointX: number(data, 'backgroundFocalPointX'),
        backgroundFocalPointY: number(data, 'backgroundFocalPointY'),
        overlayStrength: number(data, 'overlayStrength'),
        supportLink: nullable(text(data, 'supportLink')),
        documentationLink: nullable(text(data, 'documentationLink')),
        securityNotice: text(data, 'securityNotice'),
        footerCopy: text(data, 'footerCopy'),
      };
      break;
    case 'landing': {
      for (const landingSection of configuration.landing.sections) {
        const prefix = `landing_${landingSection.key}`;
        landingSection.enabled = data.get(`${prefix}_enabled`) === 'on';
        landingSection.order = number(data, `${prefix}_order`);
        landingSection.heading = nullable(text(data, `${prefix}_heading`));
        landingSection.description = nullable(text(data, `${prefix}_description`));
        landingSection.ctaLabel = nullable(text(data, `${prefix}_ctaLabel`));
        landingSection.ctaDestination = nullable(text(data, `${prefix}_ctaDestination`));
        const selectedAsset = nullable(text(data, `${prefix}_assetVersionId`));
        landingSection.assetVersionId = selectedAsset;
        landingSection.items = Array.from({ length: 8 }, (_, index) => ({
          heading: text(data, `${prefix}_itemHeading_${String(index)}`),
          description: text(data, `${prefix}_itemDescription_${String(index)}`),
        })).filter(({ heading, description }) => heading !== '' || description !== '');
      }
      break;
    }
    case 'navigation':
      configuration.navigation.collapsedByDefault = data.get('collapsedByDefault') === 'on';
      for (const item of configuration.navigation.items) {
        item.label = text(data, `label_${item.routeKey}`);
        item.order = number(data, `order_${item.routeKey}`);
        item.group = text(data, `group_${item.routeKey}`);
        item.badgeLabel = nullable(text(data, `badge_${item.routeKey}`));
        item.icon = text(data, `icon_${item.routeKey}`) as PlatformIconKey;
      }
      break;
    case 'modules':
      for (const module of configuration.modules) {
        module.enabled = data.get(`module_${module.key}`) === 'on';
        module.label = text(data, `module_label_${module.key}`);
      }
      break;
  }

  if (!platformConfigurationSchema.safeParse(configuration).success) finish('validation-required');
  await updatePlatformDraft(
    versionId.data,
    { expectedRevision, configuration, reason },
    requestId.data,
  );
  finish('draft-saved');
}

export async function platformLifecycleAction(data: FormData): Promise<never> {
  const action = z
    .enum(['validate', 'submit-review', 'review', 'publish', 'rollback'])
    .safeParse(text(data, 'action'));
  if (!action.success) finish('invalid-request');
  const permission = {
    validate: 'platform_configuration.validate',
    'submit-review': 'platform_configuration.edit',
    review: 'platform_configuration.review',
    publish: 'platform_configuration.publish',
    rollback: 'platform_configuration.rollback',
  } as const;
  await requireAuthorizedAdmin(permission[action.data]);
  const versionId = uuid.safeParse(text(data, 'versionId'));
  const requestId = uuid.safeParse(text(data, 'requestId'));
  const expectedRevision = number(data, 'expectedRevision');
  const expectedActiveRevision = number(data, 'expectedActiveRevision');
  const reason = text(data, 'reason');
  if (!versionId.success || !requestId.success || reason.length < 3) finish('invalid-request');
  const input =
    action.data === 'rollback'
      ? { expectedActiveRevision, reason }
      : action.data === 'publish'
        ? { expectedRevision, expectedActiveRevision, reason }
        : { expectedRevision, reason };
  await applyPlatformVersionAction(versionId.data, action.data, input, requestId.data);
  finish(`draft-${action.data}`);
}
