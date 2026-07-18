import type { Metadata } from 'next';

import { DocsShell } from '../../components/docs/docs-shell';
import { createDocumentationMetadata } from '../../content/docs/metadata';
import { gameStatusPage } from '../../content/docs/pages-project';

// eslint-disable-next-line react-refresh/only-export-components
export const metadata: Metadata = createDocumentationMetadata(gameStatusPage);

export default function GameStatusPage() {
  return <DocsShell page={gameStatusPage} />;
}
