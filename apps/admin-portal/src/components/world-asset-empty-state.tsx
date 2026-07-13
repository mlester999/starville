import type { ReactNode } from 'react';

export function WorldAssetEmptyState(props: {
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
  readonly alert?: boolean;
}) {
  return (
    <section
      className="empty-state world-asset-empty-state"
      {...(props.alert ? { role: 'alert' as const } : { 'aria-live': 'polite' as const })}
    >
      <span aria-hidden="true" className="world-asset-empty-state__mark">
        ◇
      </span>
      <h2>{props.title}</h2>
      <p>{props.description}</p>
      {props.action === undefined ? null : (
        <div className="world-asset-empty-state__action">{props.action}</div>
      )}
    </section>
  );
}
