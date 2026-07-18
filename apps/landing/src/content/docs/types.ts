export const DOCUMENTATION_REVIEW_DATE = '2026-07-15' as const;
export const DOCUMENTATION_REVISION = 'Player field guide · July 2026' as const;

export type DocumentationStatus =
  | 'available'
  | 'owner_tested'
  | 'testing'
  | 'local_only'
  | 'planned'
  | 'deferred'
  | 'disabled'
  | 'admin_only';

export type DocumentationAudience = 'New players' | 'Players' | 'Community' | 'Technical readers';

export type DocumentationSection =
  'Start here' | 'Gameplay' | 'Multiplayer' | 'Economy' | 'Wallet & safety' | 'Help' | 'Project';

export type DocumentationIcon =
  | 'accessibility'
  | 'architecture'
  | 'book'
  | 'chat'
  | 'compass'
  | 'controls'
  | 'dust'
  | 'gift'
  | 'leaf'
  | 'map'
  | 'moonpetal'
  | 'party'
  | 'players'
  | 'roadmap'
  | 'shield'
  | 'shop'
  | 'spark'
  | 'status'
  | 'tools'
  | 'wallet';

export type DocumentationCalloutTone =
  'tip' | 'important' | 'safety' | 'status' | 'coming_later' | 'admin_only';

export interface DocumentationCallout {
  readonly type: 'callout';
  readonly tone: DocumentationCalloutTone;
  readonly title: string;
  readonly text: string;
}

export interface DocumentationList {
  readonly type: 'list';
  readonly ordered?: boolean;
  readonly items: readonly string[];
}

export interface DocumentationSteps {
  readonly type: 'steps';
  readonly items: readonly {
    readonly title: string;
    readonly text: string;
  }[];
}

export interface DocumentationKeys {
  readonly type: 'keys';
  readonly items: readonly {
    readonly label: string;
    readonly keys: readonly string[];
    readonly description: string;
  }[];
}

export interface DocumentationTable {
  readonly type: 'table';
  readonly caption: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export interface DocumentationLinks {
  readonly type: 'links';
  readonly links: readonly {
    readonly label: string;
    readonly href: string;
    readonly description: string;
  }[];
}

export type DocumentationBlock =
  | DocumentationCallout
  | DocumentationList
  | DocumentationSteps
  | DocumentationKeys
  | DocumentationTable
  | DocumentationLinks;

export interface DocumentationContentSection {
  readonly id: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly blocks?: readonly DocumentationBlock[];
}

export interface DocumentationPage {
  readonly slug: string;
  readonly route: string;
  readonly title: string;
  readonly eyebrow: string;
  readonly description: string;
  readonly section: DocumentationSection;
  readonly audience: DocumentationAudience;
  readonly status: DocumentationStatus;
  readonly icon: DocumentationIcon;
  readonly keywords: readonly string[];
  readonly related: readonly string[];
  readonly lastReviewed: typeof DOCUMENTATION_REVIEW_DATE;
  readonly content: readonly DocumentationContentSection[];
}

export interface PublicFeatureStatus {
  readonly key: string;
  readonly name: string;
  readonly status: DocumentationStatus;
  readonly explanation: string;
  readonly route: string;
  readonly lastReviewed: typeof DOCUMENTATION_REVIEW_DATE;
}

export interface DocumentationSearchEntry {
  readonly title: string;
  readonly route: string;
  readonly description: string;
  readonly section: DocumentationSection | 'Player guide';
  readonly status: DocumentationStatus;
  readonly searchText: string;
}
