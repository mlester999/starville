import { useMemo, useState } from 'react';
import {
  createPhase13aLocalFixture,
  runPhase13aExactOnceScenario,
  runPhase13aJourney,
} from '@starville/player-experience';

import { GameButton, GameModalShell, StatusIndicator } from './game-ui';
import { PHASE13A_GAMEPLAY_GAME_TEST_STEPS } from './phase13a-gameplay-game-test';

export function Phase13AGameplayGameTest(props: { readonly onClose: () => void }) {
  const [selectedId, setSelectedId] = useState(PHASE13A_GAMEPLAY_GAME_TEST_STEPS[0]!.id);
  const [inspected, setInspected] = useState<ReadonlySet<string>>(() => new Set());
  const selected = useMemo(
    () => PHASE13A_GAMEPLAY_GAME_TEST_STEPS.find(({ id }) => id === selectedId)!,
    [selectedId],
  );
  const fixture = createPhase13aLocalFixture(selected.fixture);
  const journey = runPhase13aJourney(
    selected.id === 'returning-player' ? 'returning_player' : 'new_player',
  );
  const exactOnce = runPhase13aExactOnceScenario(
    selected.id === 'connection-failure' ? 'shop_purchase' : 'harvest',
    selected.id === 'stale-revision'
      ? 'changed_payload_same_key'
      : selected.id === 'connection-failure'
        ? 'timeout_then_retry'
        : 'repeated_request',
  );

  function markInspected() {
    setInspected((current) => new Set([...current, selected.id]));
    const index = PHASE13A_GAMEPLAY_GAME_TEST_STEPS.findIndex(({ id }) => id === selected.id);
    const next = PHASE13A_GAMEPLAY_GAME_TEST_STEPS[index + 1];
    if (next !== undefined) setSelectedId(next.id);
  }

  return (
    <GameModalShell
      portal
      className="phase13a-gameplay-game-test"
      closeLabel="Close Phase 13A gameplay scenario"
      eyebrow="Phase 13A · isolated integration fixture"
      size="wide"
      subtitle="Deterministic server-shaped projections only. Nothing is persisted, sent, published, granted, or measured in a hosted environment."
      title="Complete Gameplay Integration"
      footer={
        <div className="settings-footer-actions">
          <GameButton
            tone="quiet"
            type="button"
            onClick={() => {
              setInspected(new Set());
              setSelectedId(PHASE13A_GAMEPLAY_GAME_TEST_STEPS[0]!.id);
            }}
          >
            Reset in-memory scenario
          </GameButton>
          <GameButton tone="primary" type="button" onClick={props.onClose}>
            Close scenario
          </GameButton>
        </div>
      }
      onClose={props.onClose}
    >
      <p role="status">
        {inspected.size} of {PHASE13A_GAMEPLAY_GAME_TEST_STEPS.length} local steps inspected. No
        hosted player, inventory, DUST, progression, world, asset, social, chat, visit, trade, or
        telemetry record can change.
      </p>
      <div className="settings-layout">
        <nav aria-label="Phase 13A gameplay integration steps">
          <ol>
            {PHASE13A_GAMEPLAY_GAME_TEST_STEPS.map((step) => (
              <li key={step.id}>
                <button
                  aria-current={step.id === selected.id ? 'step' : undefined}
                  type="button"
                  onClick={() => setSelectedId(step.id)}
                >
                  <span>{step.title}</span>{' '}
                  {inspected.has(step.id) ? (
                    <StatusIndicator tone="success">Inspected</StatusIndicator>
                  ) : null}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <section aria-labelledby="phase13a-gameplay-current-step">
          <p className="game-kicker">{selected.system}</p>
          <h3 id="phase13a-gameplay-current-step">{selected.title}</h3>
          <dl>
            <div>
              <dt>Local action</dt>
              <dd>{selected.action}</dd>
            </div>
            <div>
              <dt>Expected authority</dt>
              <dd>{selected.expected}</dd>
            </div>
            <div>
              <dt>Recovery</dt>
              <dd>{selected.recovery}</dd>
            </div>
            <div>
              <dt>Fixture</dt>
              <dd>
                {fixture.label} · {fixture.participantCount} participant(s) · {fixture.persistence}
              </dd>
            </div>
            <div>
              <dt>Journey projection</dt>
              <dd>
                {journey.completedSteps} steps · {journey.duplicateSettlements} duplicate
                settlements · reconnect restored
              </dd>
            </div>
            <div>
              <dt>Retry projection</dt>
              <dd>
                {exactOnce.attempts} attempts · {exactOnce.settlements} settlement ·{' '}
                {exactOnce.replays} replay(s) · {exactOnce.conflicts} conflict(s)
              </dd>
            </div>
          </dl>
          <div className="settings-footer-actions">
            <GameButton tone="primary" type="button" onClick={markInspected}>
              Mark inspected and continue
            </GameButton>
          </div>
        </section>
      </div>
    </GameModalShell>
  );
}
