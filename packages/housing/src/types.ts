import type { z } from 'zod';

import type {
  housingFurnitureCategorySchema,
  housingFurnitureDefinitionSchema,
  housingLayoutValidationSchema,
  housingPlacementSchema,
  housingStorageSchema,
  housingUpgradeSchema,
} from './contracts';

export type HousingFurnitureCategory = z.infer<typeof housingFurnitureCategorySchema>;
export type HousingFurnitureDefinition = z.infer<typeof housingFurnitureDefinitionSchema>;
export type HousingLayoutValidation = z.infer<typeof housingLayoutValidationSchema>;
export type HousingPlacement = z.infer<typeof housingPlacementSchema>;
export type HousingStorage = z.infer<typeof housingStorageSchema>;
export type HousingUpgrade = z.infer<typeof housingUpgradeSchema>;
