import type { Metadata } from 'next';

import { DocsShell } from '../../components/docs/docs-shell';
import { howToPlayPage } from '../../content/docs/how-to-play';
import { createDocumentationMetadata } from '../../content/docs/metadata';

// eslint-disable-next-line react-refresh/only-export-components
export const metadata: Metadata = createDocumentationMetadata(howToPlayPage);

export default function HowToPlayPage() {
  return <DocsShell howTo page={howToPlayPage} />;
}
