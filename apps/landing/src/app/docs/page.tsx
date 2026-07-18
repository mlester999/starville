import type { Metadata } from 'next';

import { DocsShell } from '../../components/docs/docs-shell';
import { docsIndexPage } from '../../content/docs/index-page';
import { createDocumentationMetadata } from '../../content/docs/metadata';

// eslint-disable-next-line react-refresh/only-export-components
export const metadata: Metadata = createDocumentationMetadata(docsIndexPage);

export default function DocsPage() {
  return <DocsShell index page={docsIndexPage} />;
}
