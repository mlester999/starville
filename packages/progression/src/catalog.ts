export const STARTER_SKILL_THRESHOLDS = Object.freeze([
  0, 40, 100, 180, 280, 400, 550, 730, 940, 1180, 1450, 1750, 2080, 2440, 2830, 3250, 3700, 4180,
  4690, 5230,
]);

export const STARTER_PLAYER_THRESHOLDS = Object.freeze([
  0, 80, 190, 330, 500, 700, 930, 1190, 1480, 1800, 2150, 2530, 2940, 3380, 3850, 4350, 4880, 5440,
  6030, 6650,
]);

export const STARTER_XP_RULES = Object.freeze({
  soil_prepared: { baseXp: 2, perUnitXp: 0, eventCap: 2 },
  crop_planted: { baseXp: 3, perUnitXp: 0, eventCap: 3 },
  crop_watered: { baseXp: 1, perUnitXp: 0, eventCap: 1 },
  crop_harvested: { baseXp: 6, perUnitXp: 2, eventCap: 20 },
  cooking_job_collected: { baseXp: 10, perUnitXp: 4, eventCap: 40 },
  crafting_job_collected: { baseXp: 8, perUnitXp: 4, eventCap: 40 },
  quest_completed: { baseXp: 20, perUnitXp: 0, eventCap: 20 },
});
