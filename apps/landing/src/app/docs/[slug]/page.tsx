import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { DocsShell } from '../../../components/docs/docs-shell';
import { createDocumentationMetadata } from '../../../content/docs/metadata';
import { DOCUMENTATION_PAGES, getDocumentationPage } from '../../../content/docs/pages';

interface DocumentationRouteProps {
  readonly params: Promise<{ readonly slug: string }>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function generateStaticParams() {
  return DOCUMENTATION_PAGES.map((page) => ({ slug: page.slug }));
}

// eslint-disable-next-line react-refresh/only-export-components
export async function generateMetadata({ params }: DocumentationRouteProps): Promise<Metadata> {
  const page = getDocumentationPage((await params).slug);
  return page === undefined ? {} : createDocumentationMetadata(page);
}

export default async function DocumentationRoute({ params }: DocumentationRouteProps) {
  const { slug } = await params;
  if (slug === 'game-status') redirect('/game-status');
  const page = getDocumentationPage(slug);
  if (page === undefined) notFound();
  return <DocsShell page={page} />;
}
