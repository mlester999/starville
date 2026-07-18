import type { z } from 'zod';
import type {
  onboardingStepSchema,
  dailyObjectiveCategorySchema,
  guidanceTargetKeySchema,
} from './contracts';

type GuidanceTargetKey = z.infer<typeof guidanceTargetKeySchema>;
type DailyCategory = z.infer<typeof dailyObjectiveCategorySchema>;

export interface OnboardingStepDefinition {
  readonly key: z.infer<typeof onboardingStepSchema>['key'];
  readonly chapter: z.infer<typeof onboardingStepSchema>['chapter'];
  readonly title: string;
  readonly instruction: string;
  readonly eventKey: string;
  readonly target: GuidanceTargetKey | null;
  readonly optional: boolean;
  readonly recoveryHint: string;
}

export const ONBOARDING_STEPS = Object.freeze([
  {
    key: 'enter_lantern_square',
    chapter: 'welcome',
    title: 'Welcome to Starville',
    instruction: 'Take in Lantern Square and find the glowing objective marker.',
    eventKey: 'player_entered_lantern_square',
    target: 'location.lantern_square_spawn',
    optional: false,
    recoveryHint: 'Reload the published world to return to the safe Lantern Square spawn.',
  },
  {
    key: 'practice_movement',
    chapter: 'welcome',
    title: 'Stretch your legs',
    instruction: 'Move with WASD, arrow keys, or the touch movement controls.',
    eventKey: 'player_movement_verified',
    target: 'interactable.willow_guide',
    optional: false,
    recoveryHint: 'Open the Guide for keyboard and touch movement controls.',
  },
  {
    key: 'interact_with_guide',
    chapter: 'welcome',
    title: 'Meet Willow Guide',
    instruction: 'Move near Willow Guide and use the Interact prompt.',
    eventKey: 'npc_interacted',
    target: 'interactable.willow_guide',
    optional: false,
    recoveryHint: 'The quest tracker remains available if the guide marker is unavailable.',
  },
  {
    key: 'enter_personal_home',
    chapter: 'your_home',
    title: 'Find your home',
    instruction: 'Follow the home marker and enter your personal home plot.',
    eventKey: 'player_entered_personal_home',
    target: 'interactable.home_entrance',
    optional: false,
    recoveryHint: 'Use Open Guide to locate the canonical home entrance.',
  },
  {
    key: 'inspect_inventory',
    chapter: 'your_home',
    title: 'Check your starter kit',
    instruction: 'Open Inventory and review your hoe, watering can, seeds, and starter furniture.',
    eventKey: 'inventory_reviewed',
    target: 'interactable.farm_plot',
    optional: false,
    recoveryHint:
      'Starter recovery only restores verified missing eligible items and never duplicates grants.',
  },
  {
    key: 'plant_first_crop',
    chapter: 'first_harvest',
    title: 'Plant a Moonbean',
    instruction: 'Prepare a garden tile, select a Moonbean Seed, and plant it.',
    eventKey: 'crop_planted',
    target: 'interactable.farm_plot',
    optional: false,
    recoveryHint: 'Choose another eligible tile or request bounded starter-seed recovery.',
  },
  {
    key: 'water_first_crop',
    chapter: 'first_harvest',
    title: 'Water your crop',
    instruction: 'Select the watering can and water the planted Moonbean once.',
    eventKey: 'crop_watered',
    target: 'interactable.farm_plot',
    optional: false,
    recoveryHint: 'Refresh the home state if the crop no longer needs water.',
  },
  {
    key: 'harvest_first_crop',
    chapter: 'first_harvest',
    title: 'Harvest your Moonbean',
    instruction: 'Growth uses server time. Explore while it grows, then return when it is ready.',
    eventKey: 'crop_harvested',
    target: 'interactable.farm_plot',
    optional: false,
    recoveryHint: 'The objective waits safely through reconnects and shows remaining growth time.',
  },
  {
    key: 'collect_first_recipe',
    chapter: 'make_something',
    title: 'Make something useful',
    instruction: 'Start and collect Garden Soup or Garden Twine at a home workstation.',
    eventKey: 'workstation_job_collected',
    target: 'interactable.cooking_hearth',
    optional: false,
    recoveryHint: 'Use the compatible starter recipe or free inventory capacity before collection.',
  },
  {
    key: 'complete_store_transaction',
    chapter: 'general_store',
    title: 'Trade at the General Store',
    instruction: 'Inspect prices and complete one safe purchase or sale.',
    eventKey: 'shop_transaction_completed',
    target: 'interactable.general_store',
    optional: false,
    recoveryHint:
      'If the shop is paused, continue another activity and return after live ops resumes.',
  },
  {
    key: 'review_progression',
    chapter: 'grow_your_starvillian',
    title: 'Review your progress',
    instruction:
      'Open My Journey to see Player Level, skill XP, quests, achievements, and unlocks.',
    eventKey: 'progression_reviewed',
    target: 'control.progression',
    optional: false,
    recoveryHint: 'The Guide explains locked content when progression is temporarily unavailable.',
  },
  {
    key: 'save_first_layout',
    chapter: 'make_it_home',
    title: 'Make it home',
    instruction: 'Enter Decoration Mode, place your Willow Chair, and save the layout.',
    eventKey: 'decoration_layout_saved',
    target: 'control.decoration_mode',
    optional: false,
    recoveryHint: 'Free inventory or storage space and retry the exact saved-layout revision.',
  },
  {
    key: 'review_home_visits',
    chapter: 'starville_together',
    title: 'Starville together',
    instruction:
      'Review visibility and interaction modes. This solo-safe step never requires another player.',
    eventKey: 'home_visit_settings_reviewed',
    target: 'control.home_visits',
    optional: true,
    recoveryHint: 'Settings review remains available when visits or social systems are paused.',
  },
  {
    key: 'complete_daily_objective',
    chapter: 'daily_rhythm',
    title: 'Begin your daily rhythm',
    instruction: 'Complete one server-assigned daily objective and review the next reset time.',
    eventKey: 'daily_objective_completed',
    target: 'control.daily_rhythm',
    optional: false,
    recoveryHint:
      'Daily assignments regenerate lazily after the UTC boundary without losing earned history.',
  },
] satisfies readonly OnboardingStepDefinition[]);

export interface DailyObjectiveDefinition {
  readonly key: string;
  readonly category: DailyCategory;
  readonly title: string;
  readonly description: string;
  readonly eventKey: string;
  readonly required: number;
  readonly soloSafe: boolean;
  readonly social: boolean;
  readonly minimumPlayerLevel: number;
  readonly target: GuidanceTargetKey | null;
}

export const DAILY_OBJECTIVE_CATALOG = Object.freeze([
  {
    key: 'daily-plant-crop',
    category: 'farming',
    title: 'Plant for tomorrow',
    description: 'Plant one eligible crop on your personal home plot.',
    eventKey: 'crop_planted',
    required: 1,
    soloSafe: true,
    social: false,
    minimumPlayerLevel: 1,
    target: 'interactable.farm_plot',
  },
  {
    key: 'daily-water-crop',
    category: 'farming',
    title: 'A little water',
    description: 'Water one eligible crop that still needs care.',
    eventKey: 'crop_watered',
    required: 1,
    soloSafe: true,
    social: false,
    minimumPlayerLevel: 1,
    target: 'interactable.farm_plot',
  },
  {
    key: 'daily-harvest-crop',
    category: 'farming',
    title: 'Gather the harvest',
    description: 'Harvest one mature crop from your personal plot.',
    eventKey: 'crop_harvested',
    required: 1,
    soloSafe: true,
    social: false,
    minimumPlayerLevel: 1,
    target: 'interactable.farm_plot',
  },
  {
    key: 'daily-collect-output',
    category: 'production',
    title: 'Make something',
    description: 'Collect one completed cooking or crafting output.',
    eventKey: 'workstation_job_collected',
    required: 1,
    soloSafe: true,
    social: false,
    minimumPlayerLevel: 1,
    target: 'interactable.cooking_hearth',
  },
  {
    key: 'daily-store-transaction',
    category: 'general_store',
    title: 'Visit the General Store',
    description: 'Complete one eligible purchase or sale.',
    eventKey: 'shop_transaction_completed',
    required: 1,
    soloSafe: true,
    social: false,
    minimumPlayerLevel: 1,
    target: 'interactable.general_store',
  },
  {
    key: 'daily-gain-xp',
    category: 'progression',
    title: 'Grow your Starvillian',
    description: 'Gain 10 trusted XP through normal gameplay.',
    eventKey: 'trusted_xp_gained',
    required: 10,
    soloSafe: true,
    social: false,
    minimumPlayerLevel: 1,
    target: 'control.progression',
  },
  {
    key: 'daily-save-layout',
    category: 'housing',
    title: 'Tend your home',
    description: 'Save one valid Decoration Mode layout revision.',
    eventKey: 'decoration_layout_saved',
    required: 1,
    soloSafe: true,
    social: false,
    minimumPlayerLevel: 1,
    target: 'control.decoration_mode',
  },
  {
    key: 'daily-social-readiness',
    category: 'social',
    title: 'Open your visitor guide',
    description: 'Review home-visit readiness or participate in one live visit.',
    eventKey: 'home_visit_settings_reviewed',
    required: 1,
    soloSafe: true,
    social: true,
    minimumPlayerLevel: 1,
    target: 'control.home_visits',
  },
] satisfies readonly DailyObjectiveDefinition[]);

export const GUIDE_ENTRIES = Object.freeze([
  [
    'controls',
    'Movement and controls',
    'Move in eight directions with WASD, arrow keys, or touch controls. Use E or the visible Interact prompt.',
    '/how-to-play#controls',
  ],
  [
    'farming',
    'Farming',
    'Prepare soil, plant a seed, water once to begin server-timed growth, then harvest when mature.',
    '/how-to-play#farming',
  ],
  [
    'production',
    'Cooking and crafting',
    'Jobs consume ingredients on start, continue while offline, and settle output exactly once on collection.',
    '/how-to-play#cooking-and-crafting',
  ],
  [
    'general-store',
    'General Store',
    'Prices, stock, limits, receipts, and DUST settlement are selected by the server.',
    '/how-to-play#general-store',
  ],
  [
    'dust',
    'DUST',
    'DUST is Starville’s off-chain in-game currency. Earn and spend it through approved gameplay; it is not crypto and cannot be withdrawn.',
    '/how-to-play#dust',
  ],
  [
    'progression',
    'Progression',
    'Trusted gameplay grants Player Level and skill XP, quest progress, achievements, titles, badges, and unlocks.',
    '/how-to-play#progression',
  ],
  [
    'housing',
    'Housing',
    'Decoration Mode edits a private draft. Save a valid revision to make it active; visitors cannot enter while decorating.',
    '/how-to-play#housing',
  ],
  [
    'home-visits',
    'Home visits',
    'Owners control Public, Friends Only, Invite Only, or Private visibility and View Only, Social, or Helper interactions.',
    '/how-to-play#home-visits',
  ],
  [
    'daily-rhythm',
    'Daily rhythm',
    'Three eligible objectives are selected for each UTC game day, including solo-safe play and at most one social option.',
    '/how-to-play#daily-rhythm',
  ],
  [
    'troubleshooting',
    'Troubleshooting',
    'Refresh authoritative state after a conflict. Pending rewards and ready jobs remain safe through reconnects.',
    '/how-to-play#troubleshooting',
  ],
] as const);

export const GUIDANCE_TARGETS = Object.freeze([
  [
    'location.lantern_square_spawn',
    'Safe arrival',
    'default',
    'lantern-square',
    'You are at the safe Lantern Square arrival point.',
  ],
  [
    'interactable.willow_guide',
    'Willow Guide',
    'phase11-willow-guide',
    'lantern-square',
    'Find Willow Guide near the central plaza.',
  ],
  [
    'interactable.home_entrance',
    'Personal home entrance',
    'phase7-home-entrance',
    'lantern-square',
    'Follow the home marker at the edge of Lantern Square.',
  ],
  [
    'interactable.farm_plot',
    'Home farm plot',
    'home-tile-*',
    'personal-home',
    'Enter your home and approach one of the eight garden tiles.',
  ],
  [
    'interactable.cooking_hearth',
    'Cooking Hearth',
    'phase7-cooking-hearth-object',
    'personal-home',
    'The Cooking Hearth is inside your personal home plot.',
  ],
  [
    'interactable.crafting_workbench',
    'Crafting Workbench',
    'phase7-crafting-workbench-object',
    'personal-home',
    'The Crafting Workbench is inside your personal home plot.',
  ],
  [
    'interactable.general_store',
    'General Store',
    'phase7-general-store',
    'lantern-square',
    'Follow the store marker in Lantern Square.',
  ],
  [
    'control.progression',
    'My Journey',
    'hud.player-progression',
    'game-client',
    'Open My Journey from the player status dock.',
  ],
  [
    'control.decoration_mode',
    'Decoration Mode',
    'housing.decoration-mode',
    'personal-home',
    'Open Housing while inside your personal home.',
  ],
  [
    'control.home_visits',
    'Home visit settings',
    'home-visits.settings',
    'personal-home',
    'Open Home Visits from your housing workspace.',
  ],
  [
    'control.daily_rhythm',
    'Daily Rhythm',
    'player-experience.daily',
    'game-client',
    'Open the Guide and choose Daily Rhythm.',
  ],
] as const);
