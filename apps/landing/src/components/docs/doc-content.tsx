import Link from 'next/link';

import type {
  DocumentationBlock,
  DocumentationCalloutTone,
  DocumentationContentSection,
} from '../../content/docs/types';

const CALLOUT_PRESENTATION: Readonly<
  Record<DocumentationCalloutTone, { readonly icon: string; readonly label: string }>
> = {
  tip: { icon: '✦', label: 'Tip' },
  important: { icon: '!', label: 'Important' },
  safety: { icon: '◆', label: 'Safety' },
  status: { icon: '●', label: 'Status' },
  coming_later: { icon: '◇', label: 'Coming later' },
  admin_only: { icon: '⌁', label: 'Restricted operations' },
};

function DocumentationBlockView({ block }: { readonly block: DocumentationBlock }) {
  if (block.type === 'callout') {
    const presentation = CALLOUT_PRESENTATION[block.tone];
    return (
      <aside
        className={`docs-callout docs-callout--${block.tone}`}
        role="note"
        aria-label={`${presentation.label}: ${block.title}`}
      >
        <span className="docs-callout__icon" aria-hidden="true">
          {presentation.icon}
        </span>
        <div>
          <p className="docs-callout__label">{presentation.label}</p>
          <strong>{block.title}</strong>
          <p>{block.text}</p>
        </div>
      </aside>
    );
  }

  if (block.type === 'list') {
    const List = block.ordered ? 'ol' : 'ul';
    return (
      <List className="docs-prose-list">
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </List>
    );
  }

  if (block.type === 'steps') {
    return (
      <ol className="docs-steps">
        {block.items.map((item, index) => (
          <li key={item.title}>
            <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <div>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </div>
          </li>
        ))}
      </ol>
    );
  }

  if (block.type === 'keys') {
    return (
      <dl className="docs-keys">
        {block.items.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>
              <span className="docs-keys__set">
                {item.keys.map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </span>
              <span>{item.description}</span>
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  if (block.type === 'table') {
    return (
      <div className="docs-table-wrap" tabIndex={0} role="region" aria-label={block.caption}>
        <table>
          <caption>{block.caption}</caption>
          <thead>
            <tr>
              {block.columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={`${row[0] ?? 'row'}-${String(rowIndex)}`}>
                {row.map((cell, cellIndex) =>
                  cellIndex === 0 ? (
                    <th key={cellIndex} scope="row">
                      {cell}
                    </th>
                  ) : (
                    <td key={cellIndex}>{cell}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="docs-link-grid">
      {block.links.map((link) => (
        <Link href={link.href} key={link.href}>
          <span aria-hidden="true">↗</span>
          <strong>{link.label}</strong>
          <small>{link.description}</small>
        </Link>
      ))}
    </div>
  );
}

export function DocContent({
  sections,
}: {
  readonly sections: readonly DocumentationContentSection[];
}) {
  return (
    <div className="docs-prose">
      {sections.map((section) => (
        <section id={section.id} key={section.id} aria-labelledby={`${section.id}-heading`}>
          <a
            className="docs-anchor"
            href={`#${section.id}`}
            aria-label={`Link to ${section.title}`}
          >
            #
          </a>
          <h2 id={`${section.id}-heading`}>{section.title}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {section.blocks?.map((block, index) => (
            <DocumentationBlockView block={block} key={`${block.type}-${String(index)}`} />
          ))}
        </section>
      ))}
    </div>
  );
}
