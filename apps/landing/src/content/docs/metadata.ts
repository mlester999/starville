import type { Metadata } from 'next';

import type { DocumentationPage } from './types';

export function createDocumentationMetadata(page: DocumentationPage): Metadata {
  const title = `${page.title} · Starville Guide`;
  return {
    title,
    description: page.description,
    alternates: { canonical: page.route },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'article',
      title,
      description: page.description,
      siteName: 'STARVILLE',
      url: page.route,
      images: [
        {
          url: '/images/starville-village-hero.avif',
          alt: 'A lantern-lit view of the Starville village',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: page.description,
      images: ['/images/starville-village-hero.avif'],
    },
  };
}

export function serializeStructuredData(data: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(data).replaceAll('<', '\\u003c');
}
