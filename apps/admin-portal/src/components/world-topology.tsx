import { deriveWorldTopology, type PublishedWorldTopology } from '@starville/game-content';
import Link from 'next/link';

export function WorldTopology({
  topology,
  selectedMapId,
}: {
  readonly topology: PublishedWorldTopology;
  readonly selectedMapId?: string;
}) {
  const derived = deriveWorldTopology(topology);
  const hub = derived.nodes.find((node) => node.isHub);
  const positions = new Map(
    hub?.map.manifest.exits
      .filter((exit) => exit.enabled && exit.destinationMapId !== null)
      .map((exit) => [exit.destinationMapId as string, exit.direction]) ?? [],
  );

  return (
    <section className="world-topology" aria-labelledby="world-topology-title">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Live publication graph</p>
          <h2 id="world-topology-title">Published World Layout</h2>
        </div>
        <span className={`state-chip state-chip--${derived.simpleCross ? 'valid' : 'pending'}`}>
          {derived.simpleCross ? 'Cross topology' : 'Complex topology'}
        </span>
      </div>
      {topology.maps.length === 0 ? (
        <p>No active published maps are available. No topology has been invented.</p>
      ) : (
        <div className="world-topology__graph">
          {derived.nodes.map((node) => {
            const position = node.isHub ? 'hub' : (positions.get(node.map.manifest.id) ?? 'outer');
            return (
              <Link
                className={`world-topology__node world-topology__node--${position}${selectedMapId === node.map.id ? ' is-selected' : ''}`}
                href={`/worlds/${node.map.id}`}
                key={node.map.id}
              >
                <strong>{node.map.displayName}</strong>
                <span>{node.role}</span>
                <small>Published v{node.map.versionNumber}</small>
              </Link>
            );
          })}
        </div>
      )}
      {derived.warnings.length === 0 ? (
        <p className="world-topology__valid">
          All enabled published links are reciprocal and target valid spawns.
        </p>
      ) : (
        <ul className="world-topology__warnings">
          {derived.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
