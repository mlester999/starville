'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import type { DocumentationSearchEntry, DocumentationSection } from '../../content/docs/types';
import { DocsSearch } from './docs-search';

export interface DocsNavigationItem {
  readonly title: string;
  readonly route: string;
  readonly section: DocumentationSection;
}

interface DocsMobileNavigationProps {
  readonly currentRoute: string;
  readonly entries: readonly DocumentationSearchEntry[];
  readonly items: readonly DocsNavigationItem[];
  readonly sections: readonly DocumentationSection[];
}

export function DocsMobileNavigation({
  currentRoute,
  entries,
  items,
  sections,
}: DocsMobileNavigationProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  function closeDrawer() {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const drawer = drawerRef.current;
    const first =
      drawer?.querySelector<HTMLElement>('input') ??
      drawer?.querySelector<HTMLElement>('a, button:not([disabled])');
    first?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== 'Tab' || drawer === null) return;
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>('a, button:not([disabled]), input:not([disabled])'),
      );
      const firstItem = focusable[0];
      const lastItem = focusable.at(-1);
      if (firstItem === undefined || lastItem === undefined) return;
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        aria-controls="docs-mobile-drawer"
        aria-expanded={open}
        className="docs-mobile-trigger"
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">☰</span>
        Browse guides
      </button>
      {!open ? null : (
        <div className="docs-mobile-layer">
          <button
            aria-label="Dismiss documentation navigation"
            className="docs-mobile-backdrop"
            type="button"
            onClick={closeDrawer}
          />
          <div
            aria-label="Documentation navigation"
            aria-modal="true"
            className="docs-mobile-drawer"
            id="docs-mobile-drawer"
            ref={drawerRef}
            role="dialog"
          >
            <header>
              <div>
                <small>Starville field guide</small>
                <strong>Browse documentation</strong>
              </div>
              <button
                aria-label="Close documentation navigation"
                type="button"
                onClick={closeDrawer}
              >
                ×
              </button>
            </header>
            <DocsSearch compact entries={entries} onNavigate={closeDrawer} />
            <nav aria-label="Mobile documentation guides">
              <Link
                aria-current={currentRoute === '/how-to-play' ? 'page' : undefined}
                className={currentRoute === '/how-to-play' ? 'is-active' : undefined}
                href="/how-to-play"
                onClick={closeDrawer}
              >
                How to Play
              </Link>
              <Link
                aria-current={currentRoute === '/docs' ? 'page' : undefined}
                className={currentRoute === '/docs' ? 'is-active' : undefined}
                href="/docs"
                onClick={closeDrawer}
              >
                Documentation home
              </Link>
              {sections.map((section) => (
                <div key={section}>
                  <strong>{section}</strong>
                  {items
                    .filter((item) => item.section === section)
                    .map((item) => (
                      <Link
                        aria-current={currentRoute === item.route ? 'page' : undefined}
                        className={currentRoute === item.route ? 'is-active' : undefined}
                        href={item.route}
                        key={item.route}
                        onClick={closeDrawer}
                      >
                        {item.title}
                      </Link>
                    ))}
                </div>
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
