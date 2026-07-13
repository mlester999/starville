import { z } from 'zod';

import type { Point } from './contracts';

const interactionIdentifierSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u);
const interactionSafeTextSchema = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .regex(/^[^<>\p{Cc}]+$/u)
    .refine(
      (value) => !/(?:javascript\s*:|data\s*:\s*text\/html|on[a-z]+\s*=)/iu.test(value),
      'Interaction text must remain non-executable data',
    );
const interactionAnchorFields = {
  id: interactionIdentifierSchema,
  x: z.number().finite(),
  y: z.number().finite(),
  range: z.number().positive().max(4),
  title: interactionSafeTextSchema(80),
  content: interactionSafeTextSchema(280),
} as const;

export const noticeInteractionSchema = z
  .object({
    ...interactionAnchorFields,
    type: z.literal('notice'),
  })
  .strict();
export const farmPlotInteractionSchema = z
  .object({
    ...interactionAnchorFields,
    type: z.literal('farm_plot'),
    farmPlotKey: interactionIdentifierSchema,
    slot: z.number().int().min(1).max(64),
  })
  .strict();
export const shopInteractionSchema = z
  .object({
    ...interactionAnchorFields,
    type: z.literal('shop'),
    shopSlug: interactionIdentifierSchema,
  })
  .strict();
export const cookingStationInteractionSchema = z
  .object({
    ...interactionAnchorFields,
    type: z.literal('cooking_station'),
    stationType: z.literal('cooking_hearth'),
  })
  .strict();
export const craftingStationInteractionSchema = z
  .object({
    ...interactionAnchorFields,
    type: z.literal('crafting_station'),
    stationType: z.literal('crafting_workbench'),
  })
  .strict();
export const homeEntranceInteractionSchema = z
  .object({
    ...interactionAnchorFields,
    type: z.literal('home_entrance'),
    homeTemplateSlug: interactionIdentifierSchema,
  })
  .strict();

export const worldInteractionSchema = z.discriminatedUnion('type', [
  noticeInteractionSchema,
  farmPlotInteractionSchema,
  shopInteractionSchema,
  cookingStationInteractionSchema,
  craftingStationInteractionSchema,
  homeEntranceInteractionSchema,
]);
export type WorldInteraction = z.infer<typeof worldInteractionSchema>;
export const mapInteractionSchema = worldInteractionSchema;
export type MapInteraction = WorldInteraction;

export function sanitizeInteractionText(value: string): string {
  return value
    .replace(/[<>]/gu, '')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 280);
}

export function closestInteraction(
  position: Point,
  interactions: readonly WorldInteraction[],
): WorldInteraction | undefined {
  return interactions
    .map((interaction) => ({
      interaction,
      distance: Math.hypot(position.x - interaction.x, position.y - interaction.y),
    }))
    .filter(({ interaction, distance }) => distance <= interaction.range)
    .sort(
      (left, right) =>
        left.distance - right.distance || left.interaction.id.localeCompare(right.interaction.id),
    )[0]?.interaction;
}
