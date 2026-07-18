import {
  accessibilityPage,
  controlsAndHudPage,
  farmingAndCozyGameplayPage,
  gettingStartedPage,
  worldsAndExplorationPage,
} from './pages-gameplay';
import { characterCustomizationPage } from './pages-avatar';
import {
  dustEconomyPage,
  playerSafetyPage,
  troubleshootingPage,
  villageSupplyShopPage,
  walletAndStarPage,
} from './pages-economy-safety';
import { gameStatusPage, roadmapPage, technicalOverviewPage } from './pages-project';
import {
  chatAndSafetyPage,
  cooperativeActivitiesPage,
  friendsAndPartiesPage,
  giftsAndTradingPage,
  multiplayerPage,
} from './pages-social';
import type { DocumentationPage, DocumentationSearchEntry, DocumentationSection } from './types';

export const DOCUMENTATION_PAGES = [
  gettingStartedPage,
  characterCustomizationPage,
  controlsAndHudPage,
  worldsAndExplorationPage,
  multiplayerPage,
  chatAndSafetyPage,
  friendsAndPartiesPage,
  giftsAndTradingPage,
  cooperativeActivitiesPage,
  farmingAndCozyGameplayPage,
  dustEconomyPage,
  villageSupplyShopPage,
  walletAndStarPage,
  playerSafetyPage,
  accessibilityPage,
  troubleshootingPage,
  gameStatusPage,
  roadmapPage,
  technicalOverviewPage,
] as const satisfies readonly DocumentationPage[];

export const DOCUMENTATION_SECTIONS = [
  'Start here',
  'Gameplay',
  'Multiplayer',
  'Economy',
  'Wallet & safety',
  'Help',
  'Project',
] as const satisfies readonly DocumentationSection[];

export const DOCUMENTATION_ROUTES = [
  '/docs',
  '/how-to-play',
  ...DOCUMENTATION_PAGES.map((page) => page.route),
] as const;

export function getDocumentationPage(slug: string): DocumentationPage | undefined {
  return DOCUMENTATION_PAGES.find((page) => page.slug === slug);
}

export function getRelatedDocumentationPages(
  page: DocumentationPage,
): readonly DocumentationPage[] {
  return page.related.map((slug) => {
    const related = getDocumentationPage(slug);
    if (related === undefined) throw new Error(`Unknown related documentation page: ${slug}`);
    return related;
  });
}

export function getDocumentationNeighbors(page: DocumentationPage): {
  readonly previous: DocumentationPage | undefined;
  readonly next: DocumentationPage | undefined;
} {
  const index = DOCUMENTATION_PAGES.findIndex((candidate) => candidate.slug === page.slug);
  return {
    previous: index > 0 ? DOCUMENTATION_PAGES[index - 1] : undefined,
    next: index < DOCUMENTATION_PAGES.length - 1 ? DOCUMENTATION_PAGES[index + 1] : undefined,
  };
}

export function createDocumentationSearchIndex(
  additional: readonly DocumentationPage[] = [],
): readonly DocumentationSearchEntry[] {
  return [...additional, ...DOCUMENTATION_PAGES].map((page) => ({
    title: page.title,
    route: page.route,
    description: page.description,
    section: page.route === '/how-to-play' ? 'Player guide' : page.section,
    status: page.status,
    searchText: [
      page.title,
      page.description,
      page.section,
      page.audience,
      ...page.keywords,
      ...page.content.map((section) => section.title),
    ]
      .join(' ')
      .toLocaleLowerCase('en'),
  }));
}

export function searchDocumentation(
  entries: readonly DocumentationSearchEntry[],
  query: string,
  limit = 8,
): readonly DocumentationSearchEntry[] {
  const terms = query.trim().toLocaleLowerCase('en').split(/\s+/u).filter(Boolean);
  if (terms.length === 0) return [];
  return entries
    .filter((entry) => terms.every((term) => entry.searchText.includes(term)))
    .slice(0, limit);
}
