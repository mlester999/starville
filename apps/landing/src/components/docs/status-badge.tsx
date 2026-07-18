import { getPublicStatusPresentation } from '../../content/docs/status';
import type { DocumentationStatus } from '../../content/docs/types';

interface StatusBadgeProps {
  readonly status: DocumentationStatus;
  readonly detail?: boolean;
}

export function StatusBadge({ status, detail = false }: StatusBadgeProps) {
  if (status === 'available' || status === 'owner_tested') return null;
  const presentation = getPublicStatusPresentation(status);
  return (
    <span
      className={`docs-status docs-status--${status}`}
      title={presentation.detail}
      aria-label={`${presentation.label}. ${presentation.detail}`}
    >
      <span aria-hidden="true">●</span>
      {presentation.label}
      {detail ? <small>{presentation.detail}</small> : null}
    </span>
  );
}
