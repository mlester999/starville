// PHASE9BA_NONFUNCTIONAL_SECURITY_FIXTURE: security-shaped text is inert test evidence.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { howToPlayPage } from './how-to-play';
import { docsIndexPage } from './index-page';
import { createDocumentationMetadata } from './metadata';
import {
  createDocumentationSearchIndex,
  DOCUMENTATION_PAGES,
  DOCUMENTATION_ROUTES,
  searchDocumentation,
} from './pages';
import { getPublicStatusPresentation, PUBLIC_FEATURE_STATUSES } from './status';
import type { DocumentationBlock, DocumentationPage } from './types';

const REQUIRED_SLUGS = [
  'getting-started',
  'character-customization',
  'controls-and-hud',
  'worlds-and-exploration',
  'multiplayer',
  'chat-and-safety',
  'friends-and-parties',
  'gifts-and-trading',
  'cooperative-activities',
  'farming-and-cozy-gameplay',
  'dust-economy',
  'village-supply-shop',
  'wallet-and-star',
  'player-safety',
  'accessibility',
  'troubleshooting',
  'game-status',
  'roadmap',
  'technical-overview',
] as const;

const ALL_PUBLIC_PAGES = [docsIndexPage, howToPlayPage, ...DOCUMENTATION_PAGES] as const;

function blockText(block: DocumentationBlock): string {
  if (block.type === 'callout') return `${block.title} ${block.text}`;
  if (block.type === 'list') return block.items.join(' ');
  if (block.type === 'steps')
    return block.items.map((item) => `${item.title} ${item.text}`).join(' ');
  if (block.type === 'keys')
    return block.items
      .map((item) => `${item.label} ${item.keys.join(' ')} ${item.description}`)
      .join(' ');
  if (block.type === 'table')
    return `${block.caption} ${block.columns.join(' ')} ${block.rows.flat().join(' ')}`;
  return block.links.map((link) => `${link.label} ${link.description}`).join(' ');
}

function pageText(page: DocumentationPage): string {
  return [
    page.title,
    page.description,
    ...page.content.flatMap((section) => [
      section.title,
      ...section.paragraphs,
      ...(section.blocks?.map(blockText) ?? []),
    ]),
  ].join(' ');
}

function wordCount(page: DocumentationPage): number {
  return pageText(page).trim().split(/\s+/u).length;
}

function internalBlockLinks(page: DocumentationPage): readonly string[] {
  return page.content.flatMap((section) =>
    (section.blocks ?? []).flatMap((block) =>
      block.type === 'links' ? block.links.map((link) => link.href) : [],
    ),
  );
}

describe('public documentation content architecture', () => {
  it('registers the complete required nested route set exactly once', () => {
    expect(DOCUMENTATION_PAGES).toHaveLength(19);
    expect(DOCUMENTATION_PAGES.map((page) => page.slug)).toEqual(REQUIRED_SLUGS);
    expect(new Set(DOCUMENTATION_ROUTES).size).toBe(DOCUMENTATION_ROUTES.length);
    expect(DOCUMENTATION_ROUTES).toContain('/how-to-play');
    expect(DOCUMENTATION_ROUTES).toContain('/docs');
    expect(DOCUMENTATION_ROUTES).toContain('/game-status');
    expect(DOCUMENTATION_ROUTES).not.toContain('/docs/game-status');
  });

  it('renders the substantive documentation home and How to Play guide', () => {
    const docsRoute = readFileSync(resolve(process.cwd(), 'src/app/docs/page.tsx'), 'utf8');
    const howToRoute = readFileSync(resolve(process.cwd(), 'src/app/how-to-play/page.tsx'), 'utf8');

    expect(docsRoute).toContain('<DocsShell index page={docsIndexPage} />');
    expect(howToRoute).toContain('<DocsShell howTo page={howToPlayPage} />');
    expect(pageText(docsIndexPage)).toContain('Important clarifications');
    expect(pageText(howToPlayPage)).toContain('How to Play Starville');
    expect(pageText(howToPlayPage)).toContain('Moonpetal Harvest Help');
    expect(pageText(howToPlayPage)).toContain('Enter Starville');
  });

  it('renders every expected focused guide with one H1 and stable table-of-contents anchors', () => {
    const shell = readFileSync(
      resolve(process.cwd(), 'src/components/docs/docs-shell.tsx'),
      'utf8',
    );
    const tableOfContents = readFileSync(
      resolve(process.cwd(), 'src/components/docs/docs-table-of-contents.tsx'),
      'utf8',
    );
    const renderer = readFileSync(
      resolve(process.cwd(), 'src/components/docs/doc-content.tsx'),
      'utf8',
    );
    expect(shell.match(/<h1(?:\s|>)/gu)).toHaveLength(1);
    expect(renderer).not.toContain('<h1');
    expect(tableOfContents).toContain('href={`#${section.id}`}');
    expect(renderer).toContain('id={section.id}');
    const contentRenderer = renderer.slice(renderer.indexOf('export function DocContent'));
    expect(contentRenderer.indexOf('<h2')).toBeLessThan(
      contentRenderer.indexOf('section.blocks?.map'),
    );
    expect(renderer).toContain('<h3>{item.title}</h3>');

    for (const page of DOCUMENTATION_PAGES) {
      expect(new Set(page.content.map((section) => section.id)).size).toBe(page.content.length);
      for (const section of page.content) {
        expect(section.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
      }
    }
  });

  it('keeps all internal content and related links on registered public routes', () => {
    const routes = new Set<string>(DOCUMENTATION_ROUTES);
    routes.add('/');
    for (const page of ALL_PUBLIC_PAGES) {
      for (const link of internalBlockLinks(page)) {
        expect(link.startsWith('/')).toBe(true);
        expect(routes.has(link)).toBe(true);
      }
      for (const slug of page.related) {
        expect(REQUIRED_SLUGS).toContain(slug as (typeof REQUIRED_SLUGS)[number]);
      }
    }
  });

  it('keeps the typed status source unique and routes every feature to an existing guide', () => {
    const keys = PUBLIC_FEATURE_STATUSES.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const entry of PUBLIC_FEATURE_STATUSES) {
      expect(DOCUMENTATION_ROUTES).toContain(entry.route);
      expect(entry.explanation.trim().length).toBeGreaterThan(30);
    }
    expect(PUBLIC_FEATURE_STATUSES.find((entry) => entry.key === 'realtime-presence')?.status).toBe(
      'owner_tested',
    );
    expect(PUBLIC_FEATURE_STATUSES.find((entry) => entry.key === 'dust-economy')?.status).toBe(
      'local_only',
    );
    expect(
      PUBLIC_FEATURE_STATUSES.find((entry) => entry.key === 'character-customization')?.status,
    ).toBe('local_only');
    expect(PUBLIC_FEATURE_STATUSES.find((entry) => entry.key === 'token-rewards')?.status).toBe(
      'disabled',
    );
    expect(
      PUBLIC_FEATURE_STATUSES.find((entry) => entry.key === 'wallet-access-verification')?.status,
    ).toBe('available');
    expect(
      PUBLIC_FEATURE_STATUSES.find((entry) => entry.key === 'token-rewards')?.explanation,
    ).toContain('not an active player feature');
    expect(getPublicStatusPresentation('local_only').label).toBe('Coming later');
    expect(getPublicStatusPresentation('disabled').label).toBe('Currently unavailable');
  });

  it('searches titles, descriptions, keywords, and section headings without a remote service', () => {
    const index = createDocumentationSearchIndex([howToPlayPage]);
    expect(searchDocumentation(index, 'WASD quickbar').map((entry) => entry.route)).toContain(
      '/docs/controls-and-hud',
    );
    expect(searchDocumentation(index, 'Moonpetal reward').map((entry) => entry.route)).toContain(
      '/docs/cooperative-activities',
    );
    expect(searchDocumentation(index, 'Solana eligibility').map((entry) => entry.route)).toContain(
      '/docs/wallet-and-star',
    );
    expect(
      searchDocumentation(index, 'disabled token claims').map((entry) => entry.route),
    ).toContain('/docs/wallet-and-star');
    expect(
      searchDocumentation(index, 'treasury trust boundary').map((entry) => entry.route),
    ).toContain('/docs/technical-overview');
    expect(
      searchDocumentation(index, 'wardrobe eight directions').map((entry) => entry.route),
    ).toContain('/docs/character-customization');
    expect(searchDocumentation(index, 'definitely absent')).toEqual([]);
  });

  it('provides canonical, Open Graph, Twitter, and indexable metadata for every route', () => {
    for (const page of ALL_PUBLIC_PAGES) {
      const metadata = createDocumentationMetadata(page);
      expect(metadata.alternates?.canonical).toBe(page.route);
      expect(metadata.openGraph).toMatchObject({
        title: expect.any(String),
        description: page.description,
      });
      expect(metadata.twitter).toMatchObject({
        title: expect.any(String),
        description: page.description,
      });
      expect(metadata.robots).toMatchObject({ index: true, follow: true });
    }
  });

  it('uses the current controls and labels Moonpetal amounts as configurable examples', () => {
    const howTo = pageText(howToPlayPage);
    for (const control of ['WASD', 'Shift', 'E', '1–8', 'Enter', 'Escape']) {
      expect(howTo).toContain(control);
    }
    expect(howTo).toContain('A configurable example grants 15 DUST, 2 Moonbeans');
    expect(howTo).toContain('current game may use different published values');
  });

  it('meets long-form depth without empty or placeholder sections', () => {
    expect(wordCount(howToPlayPage)).toBeGreaterThanOrEqual(2_500);
    expect(wordCount(howToPlayPage)).toBeLessThanOrEqual(4_200);
    expect(wordCount(docsIndexPage)).toBeGreaterThanOrEqual(1_500);
    expect(wordCount(docsIndexPage)).toBeLessThanOrEqual(2_700);
    expect(DOCUMENTATION_PAGES.reduce((total, page) => total + wordCount(page), 0)).toBeGreaterThan(
      8_000,
    );
    for (const page of ALL_PUBLIC_PAGES) {
      expect(page.content.length).toBeGreaterThanOrEqual(4);
      for (const section of page.content) {
        expect(section.title.trim().length).toBeGreaterThan(2);
        expect(section.paragraphs.join(' ').trim().length).toBeGreaterThan(100);
      }
      expect(pageText(page)).not.toMatch(/coming soon|lorem ipsum|placeholder section/iu);
    }
  });

  it('keeps public content free of sensitive internals and false economy claims', () => {
    const publicText = ALL_PUBLIC_PAGES.map(pageText).join('\n');
    expect(publicText).not.toMatch(
      /\/Users\/|service[- ]role|authorization header|database password/iu,
    );
    expect(publicText).not.toMatch(/Within 3 tiles/iu);
    expect(publicText).not.toMatch(/(?:enter|paste|provide|send) (?:your )?seed phrase/iu);
    expect(publicText).not.toMatch(/DUST (?:is )?(?:withdrawable|converts? to STAR)/iu);
    expect(publicText).not.toMatch(/(?:token rewards|Play-to-Earn) (?:is|are) active/iu);
    expect(publicText).not.toMatch(
      /local build|owner[- ]tested|acceptance pending|owner acceptance|hosted validation|hosted deployment|internal validation|dev-only|phase[- ]?gate/iu,
    );
    expect(publicText).not.toMatch(/phase\s?10|phase\s?9/iu);
    expect(publicText).toContain('DUST is not withdrawable');
    expect(publicText).toContain('Token claims are disabled');
    expect(publicText).toContain('There is no player token reward');
    expect(publicText).toContain('No claim transaction is required');
    expect(publicText).toContain('no DUST conversion');
    expect(publicText).toContain('never asks for a seed phrase');
    expect(publicText).toContain('security, treasury, legal, and compliance review');
    expect(publicText).toContain('no player Claim action');
  });
});

describe('documentation responsive and accessibility boundaries', () => {
  it('provides a modal mobile drawer with Escape handling, focus containment, and restoration', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/docs/docs-mobile-navigation.tsx'),
      'utf8',
    );
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain("event.key === 'Escape'");
    expect(source).toContain("event.key !== 'Tab'");
    expect(source).toContain('triggerRef.current?.focus()');
    expect(source).toContain("document.body.style.overflow = 'hidden'");
    expect(source).toContain(
      "drawer.querySelectorAll<HTMLElement>('a, button:not([disabled]), input:not([disabled])')",
    );
  });

  it('keeps section navigation synchronized with scrolling, hashes, and browser history', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/docs/docs-table-of-contents.tsx'),
      'utf8',
    );
    expect(source).toContain('new IntersectionObserver');
    expect(source).toContain("aria-current={activeId === section.id ? 'location' : undefined}");
    expect(source).toContain("window.addEventListener('hashchange'");
    expect(source).toContain("window.addEventListener('popstate'");
    expect(source).toContain('ACTIVE_SECTION_DELAY_MS = 90');
    expect(source).toContain('prefers-reduced-motion: reduce');
    expect(source).toContain("behavior: prefersReducedMotion() ? 'auto' : 'smooth'");
    expect(source).toContain('role="progressbar"');
  });

  it('keeps public search keyboard-friendly and free of internal status badges', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/docs/docs-search.tsx'),
      'utf8',
    );
    expect(source).toContain('Search guides, controls, parties, DUST…');
    expect(source).toContain("event.key === 'Escape'");
    expect(source).toContain('<mark');
    expect(source).toContain('{entry.section}');
    expect(source).not.toContain('StatusBadge');
  });

  it('presents related guides as complete categorized links without release-gate badges', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/docs/docs-shell.tsx'),
      'utf8',
    );
    const relatedSource = source.slice(source.indexOf('function GuideFooter'));
    expect(relatedSource).toContain('DOCUMENTATION_GLYPHS[entry.icon]');
    expect(relatedSource).toContain('{entry.section}');
    expect(relatedSource).toContain('docs-related__action');
    expect(relatedSource).not.toContain('<StatusBadge status={entry.status}');
  });

  it('uses a readable gold primary action with visible focus treatment', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

    function luminance(hex: string) {
      const channels = hex
        .slice(1)
        .match(/.{2}/gu)
        ?.map((value) => Number.parseInt(value, 16) / 255)
        .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
      if (channels?.length !== 3) throw new Error('Invalid test color');
      const [red = 0, green = 0, blue = 0] = channels;
      return red * 0.2126 + green * 0.7152 + blue * 0.0722;
    }

    const background = luminance('#efd081');
    const foreground = luminance('#102018');
    const ratio =
      (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(css).toContain('--docs-primary-bg: #efd081');
    expect(css).toContain('--docs-primary-fg: #102018');
    expect(css).toContain('.docs-button--primary:focus-visible');
  });

  it('keeps responsive pages fluid and makes wide tables independently scrollable', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');
    expect(css).toContain('.docs-site');
    expect(css).toContain('grid-template-columns: minmax(14rem, 17rem) minmax(0, 52rem)');
    expect(css).toContain('.docs-table-wrap');
    expect(css).toContain('overflow-x: auto');
    expect(css).toContain('@media (max-width: 980px)');
    expect(css).toContain('@media (max-width: 1280px)');
    expect(css).toContain('.docs-toc-mobile');
    expect(css).toMatch(
      /@media \(max-width: 980px\)[\s\S]*?\.docs-topbar\s*\{[\s\S]*?backdrop-filter: none;/u,
    );
    expect(css).toContain('@media (max-width: 720px)');
    expect(css).toContain('@media (max-width: 430px)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
