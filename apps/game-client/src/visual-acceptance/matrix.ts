export const AVATAR_VISUAL_ACCEPTANCE_VIEWPORTS = [
  [360, 800],
  [390, 844],
  [768, 1024],
  [820, 1180],
  [1024, 768],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
] as const;

export const AVATAR_VISUAL_ACCEPTANCE_SCALES = [90, 100, 110, 120] as const;

export const AVATAR_VISUAL_ACCEPTANCE_PREFERENCES = [
  { motion: 'default', contrast: 'default' },
  { motion: 'reduced', contrast: 'default' },
  { motion: 'default', contrast: 'high' },
  { motion: 'reduced', contrast: 'high' },
] as const;

export const AVATAR_VISUAL_ACCEPTANCE_PANELS = ['creator', 'wardrobe', 'cosmetics'] as const;
