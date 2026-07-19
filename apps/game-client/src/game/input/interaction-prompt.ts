import type { WorldInteraction } from '@starville/game-core';

const WARDROBE_INTERACTION_IDS = new Set([
  'phase10b-wardrobe-mirror',
  'phase10b-wardrobe-furniture',
]);

/**
 * Presentation-only verbs for interaction kinds the runtime already supports.
 * This describes the action that opens; it does not claim server availability
 * or success for the action behind the prompt.
 */
export function interactionPromptLabel(interaction: WorldInteraction): string {
  if (WARDROBE_INTERACTION_IDS.has(interaction.id)) return 'Customize character';
  if (interaction.type === 'shop') return 'Shop';
  if (interaction.type === 'cooking_station') return 'Cook';
  if (interaction.type === 'crafting_station') return 'Craft';
  if (interaction.type === 'notice') return 'Read';
  if (interaction.type === 'home_entrance') return 'Enter home';
  if (interaction.type === 'starter_npc') return `Talk to ${interaction.title}`;
  if (interaction.type === 'farm_plot') return 'Inspect garden plot';
  return 'Farm this garden tile';
}
