import Link from 'next/link';

import {
  createDocumentationSearchIndex,
  DOCUMENTATION_PAGES,
  DOCUMENTATION_SECTIONS,
  getDocumentationNeighbors,
  getRelatedDocumentationPages,
} from '../../content/docs/pages';
import { howToPlayPage } from '../../content/docs/how-to-play';
import { serializeStructuredData } from '../../content/docs/metadata';
import {
  DOCUMENTATION_REVISION,
  type DocumentationIcon,
  type DocumentationPage,
} from '../../content/docs/types';
import { StarvilleMark } from '../starville-mark';
import { DocContent } from './doc-content';
import { DocsMobileNavigation, type DocsNavigationItem } from './docs-mobile-navigation';
import { DocsMotionState } from './docs-motion-state';
import { DocsSearch } from './docs-search';
import { StatusBadge } from './status-badge';
import { DocsBackToTop, DocsTableOfContents } from './docs-table-of-contents';

interface DocsShellProps {
  readonly page: DocumentationPage;
  readonly index?: boolean;
  readonly howTo?: boolean;
}

const NAVIGATION_ITEMS: readonly DocsNavigationItem[] = DOCUMENTATION_PAGES.map((page) => ({
  title: page.title,
  route: page.route,
  section: page.section,
}));

const SEARCH_ENTRIES = createDocumentationSearchIndex([howToPlayPage]);

const DOCUMENTATION_GLYPHS: Readonly<Record<DocumentationIcon, string>> = {
  accessibility: '◌',
  architecture: '◇',
  book: '▤',
  chat: '◍',
  compass: '✦',
  controls: '⌘',
  dust: '✧',
  gift: '□',
  leaf: '❧',
  map: '⌖',
  moonpetal: '✿',
  party: '♧',
  players: '◉',
  roadmap: '↗',
  shield: '⬡',
  shop: '⌂',
  spark: '✺',
  status: '◎',
  tools: '⚙',
  wallet: '▣',
};

function DocumentationNavigation({ currentRoute }: { readonly currentRoute: string }) {
  return (
    <nav className="docs-navigation" aria-label="Documentation guides">
      <Link
        aria-current={currentRoute === '/docs' ? 'page' : undefined}
        className={
          currentRoute === '/docs' ? 'is-active docs-navigation__home' : 'docs-navigation__home'
        }
        href="/docs"
      >
        <span aria-hidden="true">✦</span>
        Documentation home
      </Link>
      {DOCUMENTATION_SECTIONS.map((section) => (
        <div className="docs-navigation__group" key={section}>
          <strong>{section}</strong>
          {NAVIGATION_ITEMS.filter((item) => item.section === section).map((item) => (
            <Link
              aria-current={currentRoute === item.route ? 'page' : undefined}
              className={currentRoute === item.route ? 'is-active' : undefined}
              href={item.route}
              key={item.route}
            >
              {item.title}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

function Breadcrumbs({
  page,
  howTo,
}: {
  readonly page: DocumentationPage;
  readonly howTo: boolean;
}) {
  const crumbs = howTo
    ? [
        { name: 'Home', route: '/' },
        { name: 'How to Play', route: page.route },
      ]
    : [
        { name: 'Home', route: '/' },
        { name: 'Documentation', route: '/docs' },
        ...(page.route === '/docs' ? [] : [{ name: page.title, route: page.route }]),
      ];
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: crumb.route,
    })),
  };
  return (
    <>
      <nav className="docs-breadcrumbs" aria-label="Breadcrumb">
        <ol>
          {crumbs.map((crumb, index) => (
            <li key={crumb.route}>
              {index === crumbs.length - 1 ? (
                <span aria-current="page">{crumb.name}</span>
              ) : (
                <Link href={crumb.route}>{crumb.name}</Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeStructuredData(schema) }}
      />
    </>
  );
}

function GuideFooter({ page, index, howTo }: DocsShellProps) {
  const related = getRelatedDocumentationPages(page);
  const neighbors = !index && !howTo ? getDocumentationNeighbors(page) : undefined;
  return (
    <div className="docs-guide-footer">
      <section aria-labelledby="related-guides-heading">
        <p className="docs-section-label">Keep exploring</p>
        <h2 id="related-guides-heading">Related guides</h2>
        <div className="docs-related-grid">
          {related.map((entry) => (
            <Link href={entry.route} key={entry.route}>
              <span className="docs-related__icon" aria-hidden="true">
                {DOCUMENTATION_GLYPHS[entry.icon]}
              </span>
              <div className="docs-related__copy">
                <small>{entry.section}</small>
                <strong>{entry.title}</strong>
                <p>{entry.description}</p>
              </div>
              <span className="docs-related__action" aria-hidden="true">
                Read guide <span>→</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
      {neighbors === undefined ? null : (
        <nav className="docs-neighbors" aria-label="Previous and next guides">
          {neighbors.previous === undefined ? (
            <span />
          ) : (
            <Link href={neighbors.previous.route} rel="prev">
              <small>Previous</small>
              <strong>← {neighbors.previous.title}</strong>
            </Link>
          )}
          {neighbors.next === undefined ? (
            <span />
          ) : (
            <Link href={neighbors.next.route} rel="next">
              <small>Next</small>
              <strong>{neighbors.next.title} →</strong>
            </Link>
          )}
        </nav>
      )}
      <DocsBackToTop />
    </div>
  );
}

export function DocsShell({ page, index = false, howTo = false }: DocsShellProps) {
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': howTo ? 'HowTo' : index ? 'CollectionPage' : 'Article',
    name: page.title,
    description: page.description,
    dateModified: page.lastReviewed,
    inLanguage: 'en',
    ...(howTo
      ? {
          step: page.content.slice(1, 11).map((section, indexValue) => ({
            '@type': 'HowToStep',
            position: indexValue + 1,
            name: section.title,
            text: section.paragraphs[0],
            url: `${page.route}#${section.id}`,
          })),
        }
      : {}),
  };

  return (
    <div
      className={`docs-site${howTo ? ' docs-site--how-to' : ''}${index ? ' docs-site--index' : ''}`}
    >
      <DocsMotionState />
      <a className="docs-skip-link" href="#docs-main">
        Skip to guide content
      </a>
      <header className="docs-topbar">
        <Link className="docs-brand" href="/" aria-label="Starville home">
          <StarvilleMark compact />
        </Link>
        <nav aria-label="Public guide navigation">
          <Link className={howTo ? 'is-active' : undefined} href="/how-to-play">
            How to Play
          </Link>
          <Link
            className={!howTo && page.route !== '/game-status' ? 'is-active' : undefined}
            href="/docs"
          >
            Documentation
          </Link>
          <Link
            className={page.route === '/game-status' ? 'is-active' : undefined}
            href="/game-status"
          >
            Game Status
          </Link>
        </nav>
        <DocsMobileNavigation
          currentRoute={page.route}
          entries={SEARCH_ENTRIES}
          items={NAVIGATION_ITEMS}
          sections={DOCUMENTATION_SECTIONS}
        />
      </header>

      <div className="docs-layout">
        <aside className="docs-sidebar">
          <DocsSearch entries={SEARCH_ENTRIES} />
          <DocumentationNavigation currentRoute={page.route} />
        </aside>

        <main id="docs-main" className="docs-main" tabIndex={-1}>
          <Breadcrumbs howTo={howTo} page={page} />
          <article>
            <header className="docs-hero">
              <div className="docs-hero__wash" aria-hidden="true" />
              <p className="docs-hero__eyebrow">{page.eyebrow}</p>
              <h1>{page.title}</h1>
              <p className="docs-hero__description">{page.description}</p>
              <div className="docs-hero__meta">
                <StatusBadge status={page.status} />
                <span>{page.audience}</span>
                <span>Last reviewed {page.lastReviewed}</span>
              </div>
              {howTo ? (
                <div className="docs-hero__actions">
                  <Link className="docs-button docs-button--primary" href="/">
                    Enter Starville <span aria-hidden="true">→</span>
                  </Link>
                  <Link className="docs-button" href="/docs">
                    Full documentation
                  </Link>
                  <Link className="docs-button" href="/game-status">
                    Game status
                  </Link>
                </div>
              ) : null}
            </header>
            <DocsTableOfContents mode="mobile" sections={page.content} />
            <DocContent sections={page.content} />
            <GuideFooter howTo={howTo} index={index} page={page} />
          </article>
        </main>

        <aside className="docs-toc-rail">
          <DocsTableOfContents mode="desktop" sections={page.content} />
        </aside>
      </div>

      <footer className="docs-footer">
        <div>
          <strong>STARVILLE</strong>
          <p>A cozy world built around fair play, creativity, and trusted systems.</p>
        </div>
        <div>
          <span>{DOCUMENTATION_REVISION}</span>
          <Link href="/docs/player-safety">Player safety</Link>
          <Link href="/docs/roadmap">Roadmap</Link>
          <Link href="/game-status">Game status</Link>
          <Link href="/">Village entrance</Link>
        </div>
      </footer>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeStructuredData(articleSchema) }}
      />
    </div>
  );
}
