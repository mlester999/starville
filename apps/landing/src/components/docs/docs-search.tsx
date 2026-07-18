'use client';

import Link from 'next/link';
import { Fragment, type ReactNode, useId, useMemo, useRef, useState } from 'react';

import type { DocumentationSearchEntry } from '../../content/docs/types';

interface DocsSearchProps {
  readonly entries: readonly DocumentationSearchEntry[];
  readonly compact?: boolean;
  readonly onNavigate?: () => void;
}

function highlightMatches(text: string, query: string): ReactNode {
  const terms = query.trim().split(/\s+/u).filter(Boolean);
  if (terms.length === 0) return text;
  const expression = new RegExp(
    `(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('|')})`,
    'giu',
  );
  return text
    .split(expression)
    .map((part, index) =>
      terms.some((term) => part.toLocaleLowerCase('en') === term.toLocaleLowerCase('en')) ? (
        <mark key={`${part}-${index}`}>{part}</mark>
      ) : (
        <Fragment key={`${part}-${index}`}>{part}</Fragment>
      ),
    );
}

export function DocsSearch({ entries, compact = false, onNavigate }: DocsSearchProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase('en').split(/\s+/u).filter(Boolean);
    if (terms.length === 0) return [];
    return entries
      .filter((entry) => terms.every((term) => entry.searchText.includes(term)))
      .slice(0, 8);
  }, [entries, query]);
  const resultsId = `${id}-results`;

  function clearSearch() {
    setQuery('');
    inputRef.current?.focus();
  }

  return (
    <div className={`docs-search${compact ? ' docs-search--compact' : ''}`} role="search">
      <label htmlFor={id}>Search player guides</label>
      <div className="docs-search__field">
        <span aria-hidden="true">⌕</span>
        <input
          aria-controls={resultsId}
          autoComplete="off"
          id={id}
          placeholder="Search guides, controls, parties, DUST…"
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && query.length > 0) {
              event.preventDefault();
              clearSearch();
            }
          }}
        />
        {query.length === 0 ? null : (
          <button aria-label="Clear search" type="button" onClick={clearSearch}>
            ×
          </button>
        )}
      </div>
      <div
        aria-label="Guide search results"
        aria-live="polite"
        className="docs-search__results"
        id={resultsId}
      >
        {query.trim().length === 0 ? null : results.length === 0 ? (
          <p>No public guides match that search.</p>
        ) : (
          <ul>
            {results.map((entry) => (
              <li key={entry.route}>
                <Link
                  href={entry.route}
                  {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
                >
                  <span>
                    <strong>{highlightMatches(entry.title, query)}</strong>
                    <small>{entry.section}</small>
                    <p>{highlightMatches(entry.description, query)}</p>
                  </span>
                  <span className="docs-search__arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
