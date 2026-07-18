import type { PlayerEconomyView } from '../app/economy-client';

type EconomyHistoryEntry = PlayerEconomyView['history'][number];

export type ShopOfferStatusKey =
  'available' | 'insufficient_dust' | 'inventory_full' | 'daily_limit' | 'cooldown' | 'shop_closed';

export interface ShopOfferStatus {
  readonly key: ShopOfferStatusKey;
  readonly label: string;
  readonly detail: string;
  readonly purchasable: boolean;
}

const DUST_SOURCE_LABELS: Readonly<Record<string, string>> = {
  'starter-grant': 'Starter Balance',
  'shop-sale': 'Village Supply Shop Sale',
  'moonpetal-harvest-help': 'Moonpetal Harvest Help',
  'system-refund': 'System Refund',
  'administrative-correction-credit': 'Administrative Correction',
  'migration-adjustment-credit': 'Account Migration',
};

const DUST_SINK_LABELS: Readonly<Record<string, string>> = {
  'village-supply-shop': 'Village Supply Shop',
  'administrative-correction-debit': 'Administrative Correction',
  'crafting-fee': 'Village Crafting',
  'migration-adjustment-debit': 'Account Migration',
};

const DUST_OPERATION_LABELS: Readonly<Record<string, string>> = {
  starter_grant: 'Starter Balance',
  shop_sale: 'Village Supply Shop Sale',
  moonpetal_harvest_help: 'Moonpetal Harvest Help',
  system_refund: 'System Refund',
  administrative_correction: 'Administrative Correction',
  shop_purchase: 'Village Supply Shop',
  migration_adjustment: 'Account Migration',
};

const DUST_REFERENCE_LABELS: Readonly<Record<string, string>> = {
  player_bootstrap: 'Player setup',
  shop_transaction: 'Village shop transaction',
  cooperative_activity: 'Cooperative activity',
  activity_completion: 'Cooperative activity completion',
  correction_settlement: 'Reviewed correction',
  recipe_action: 'Recipe action',
  system_operation: 'System operation',
  migration: 'Historical migration',
};

export function titleFromEconomyKey(value: string): string {
  return value
    .split(/[-_]/u)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function dustHistoryEntryLabel(entry: EconomyHistoryEntry): string {
  return (
    entry.referenceLabel ??
    (entry.sourceKey === null ? undefined : DUST_SOURCE_LABELS[entry.sourceKey]) ??
    (entry.sinkKey === null ? undefined : DUST_SINK_LABELS[entry.sinkKey]) ??
    DUST_OPERATION_LABELS[entry.operationKey] ??
    titleFromEconomyKey(entry.operationKey)
  );
}

export function dustReferenceLabel(referenceType: string): string {
  return DUST_REFERENCE_LABELS[referenceType] ?? titleFromEconomyKey(referenceType);
}

function formatClockTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function deriveShopOfferStatus(input: {
  readonly shopOpen: boolean;
  readonly balance: number;
  readonly totalPrice: number;
  readonly inventoryFits: boolean;
  readonly remainingToday?: number;
  readonly availableAt?: string | null;
  readonly now?: number;
}): ShopOfferStatus {
  if (!input.shopOpen) {
    return {
      key: 'shop_closed',
      label: 'Shop Temporarily Closed',
      detail: 'Purchases are paused. Your DUST and inventory have not changed.',
      purchasable: false,
    };
  }
  if (input.remainingToday === 0) {
    return {
      key: 'daily_limit',
      label: 'Daily Limit Reached',
      detail: 'This offer will refresh after the daily limit resets.',
      purchasable: false,
    };
  }
  if (
    input.availableAt !== undefined &&
    input.availableAt !== null &&
    Date.parse(input.availableAt) > (input.now ?? Date.now())
  ) {
    return {
      key: 'cooldown',
      label: 'Available Again Soon',
      detail: `Try again after ${formatClockTime(input.availableAt)}.`,
      purchasable: false,
    };
  }
  if (!input.inventoryFits) {
    return {
      key: 'inventory_full',
      label: 'Inventory Full',
      detail: 'Make room in your bag before purchasing this quantity.',
      purchasable: false,
    };
  }
  if (input.totalPrice > input.balance) {
    return {
      key: 'insufficient_dust',
      label: 'Not Enough DUST',
      detail: `You need ${(input.totalPrice - input.balance).toLocaleString()} more DUST.`,
      purchasable: false,
    };
  }
  return {
    key: 'available',
    label: 'Available',
    detail: 'The server will recheck the price, limits, balance, and bag before settlement.',
    purchasable: true,
  };
}
