'use client';

import type { CSSProperties, MouseEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { DocumentationContentSection } from '../../content/docs/types';

interface DocsTableOfContentsProps {
  readonly mode: 'desktop' | 'mobile';
  readonly sections: readonly DocumentationContentSection[];
}

const STICKY_OFFSET = 112;
const ACTIVE_SECTION_DELAY_MS = 90;

function hashSectionId(sections: readonly DocumentationContentSection[]): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const id = decodeURIComponent(window.location.hash.slice(1));
  return sections.some((section) => section.id === id) ? id : undefined;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function DocsTableOfContents({ mode, sections }: DocsTableOfContentsProps) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? '');
  const [progress, setProgress] = useState(0);
  const activeIdRef = useRef(activeId);
  const candidateRef = useRef(activeId);
  const candidateTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    const targets = sections
      .map((section) => document.getElementById(section.id))
      .filter((element): element is HTMLElement => element !== null);
    if (targets.length === 0) return;

    function commitActiveSection(nextId: string, immediate = false) {
      if (nextId === activeIdRef.current) return;
      window.clearTimeout(candidateTimerRef.current);
      candidateRef.current = nextId;
      if (immediate) {
        activeIdRef.current = nextId;
        setActiveId(nextId);
        return;
      }
      candidateTimerRef.current = window.setTimeout(() => {
        if (candidateRef.current !== nextId) return;
        activeIdRef.current = nextId;
        setActiveId(nextId);
      }, ACTIVE_SECTION_DELAY_MS);
    }

    function updateFromViewport() {
      const positions = targets.map((target) => ({
        id: target.id,
        top: target.getBoundingClientRect().top - STICKY_OFFSET,
      }));
      const passed = positions.filter((position) => position.top <= 2);
      const next = passed.at(-1) ?? positions[0];
      if (next !== undefined) commitActiveSection(next.id);

      const article = document.querySelector<HTMLElement>('.docs-prose');
      if (article === null) return;
      const rect = article.getBoundingClientRect();
      const readableDistance = Math.max(article.offsetHeight - window.innerHeight * 0.55, 1);
      const amountRead = Math.min(Math.max(STICKY_OFFSET - rect.top, 0), readableDistance);
      setProgress((amountRead / readableDistance) * 100);
    }

    let frame = 0;
    function scheduleUpdate() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateFromViewport);
    }

    function syncFromLocation() {
      const id = hashSectionId(sections);
      if (id !== undefined) commitActiveSection(id, true);
      scheduleUpdate();
    }

    const observer = new IntersectionObserver(scheduleUpdate, {
      rootMargin: `-${STICKY_OFFSET}px 0px -58% 0px`,
      threshold: [0, 0.15, 0.35, 0.6, 1],
    });
    for (const target of targets) observer.observe(target);
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('hashchange', syncFromLocation);
    window.addEventListener('popstate', syncFromLocation);
    syncFromLocation();

    return () => {
      observer.disconnect();
      window.clearTimeout(candidateTimerRef.current);
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('hashchange', syncFromLocation);
      window.removeEventListener('popstate', syncFromLocation);
    };
  }, [sections]);

  function visitSection(event: MouseEvent<HTMLAnchorElement>, id: string) {
    event.preventDefault();
    activeIdRef.current = id;
    setActiveId(id);
    window.history.pushState(null, '', `#${id}`);
    document.getElementById(id)?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  function backToTop(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    window.history.pushState(null, '', '#docs-main');
    document.getElementById('docs-main')?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  const list = (
    <ol>
      {sections.map((section) => (
        <li className={activeId === section.id ? 'is-active' : undefined} key={section.id}>
          <a
            aria-current={activeId === section.id ? 'location' : undefined}
            href={`#${section.id}`}
            onClick={(event) => visitSection(event, section.id)}
          >
            <span className="docs-toc__marker" aria-hidden="true" />
            {section.title}
          </a>
        </li>
      ))}
    </ol>
  );
  const progressStyle = { '--docs-reading-progress': `${progress}%` } as CSSProperties;

  if (mode === 'mobile') {
    return (
      <details className="docs-toc-mobile">
        <summary>
          <span>On this page</span>
          <small>{sections.find((section) => section.id === activeId)?.title}</small>
        </summary>
        <nav aria-label="On this page">{list}</nav>
      </details>
    );
  }

  return (
    <nav className="docs-toc" aria-label="On this page">
      <strong>On this page</strong>
      <div
        aria-label={`${Math.round(progress)}% of this guide read`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(progress)}
        className="docs-toc__progress"
        role="progressbar"
        style={progressStyle}
      >
        <span />
      </div>
      {list}
      <a className="docs-toc__top" href="#docs-main" onClick={backToTop}>
        Back to top <span aria-hidden="true">↑</span>
      </a>
    </nav>
  );
}

export function DocsBackToTop() {
  function backToTop(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    window.history.pushState(null, '', '#docs-main');
    document.getElementById('docs-main')?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  return (
    <a className="docs-back-to-top" href="#docs-main" onClick={backToTop}>
      Back to top <span aria-hidden="true">↑</span>
    </a>
  );
}
