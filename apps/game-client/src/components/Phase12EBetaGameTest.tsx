import { useMemo, useState } from 'react';

import { GameButton, GameModalShell, StatusIndicator } from './game-ui';
import {
  PHASE12E_BETA_SCENARIO_STEPS,
  type Phase12EBetaScenarioStep,
} from './phase12e-beta-game-test';

export function Phase12EBetaGameTest(props: {
  readonly onApplyStep: (step: Phase12EBetaScenarioStep) => void;
  readonly onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState(PHASE12E_BETA_SCENARIO_STEPS[0]!.id);
  const [inspected, setInspected] = useState<ReadonlySet<string>>(() => new Set());
  const selected = useMemo(
    () => PHASE12E_BETA_SCENARIO_STEPS.find(({ id }) => id === selectedId)!,
    [selectedId],
  );

  function markInspected() {
    setInspected((current) => new Set([...current, selected.id]));
    const index = PHASE12E_BETA_SCENARIO_STEPS.findIndex(({ id }) => id === selected.id);
    const next = PHASE12E_BETA_SCENARIO_STEPS[index + 1];
    if (next !== undefined) setSelectedId(next.id);
  }

  return (
    <GameModalShell
      portal
      className="phase12e-beta-game-test"
      closeLabel="Close Phase 12E beta scenario"
      eyebrow="Phase 12E · Game Test"
      size="wide"
      subtitle="A deterministic, nonpersistent walkthrough. Inspected steps are local session notes—not automated evidence or owner acceptance."
      title="Integrated Beta Scenario"
      footer={
        <div className="settings-footer-actions">
          <GameButton
            tone="quiet"
            type="button"
            onClick={() => {
              setInspected(new Set());
              setSelectedId(PHASE12E_BETA_SCENARIO_STEPS[0]!.id);
            }}
          >
            Reset in-memory review
          </GameButton>
          <GameButton tone="primary" type="button" onClick={props.onClose}>
            Close scenario
          </GameButton>
        </div>
      }
      onClose={props.onClose}
    >
      <p role="status">
        {inspected.size} of {PHASE12E_BETA_SCENARIO_STEPS.length} fixture steps inspected. No
        player, inventory, DUST, progression, housing, social, world, or telemetry data is written.
      </p>
      <div className="settings-layout">
        <nav aria-label="Phase 12E beta scenario steps">
          <ol>
            {PHASE12E_BETA_SCENARIO_STEPS.map((step) => (
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
        <section aria-labelledby="phase12e-beta-current-step">
          <p className="game-kicker">{selected.area.replaceAll('_', ' ')}</p>
          <h3 id="phase12e-beta-current-step">{selected.title}</h3>
          <dl>
            <div>
              <dt>Review action</dt>
              <dd>{selected.instruction}</dd>
            </div>
            <div>
              <dt>Expected result</dt>
              <dd>{selected.expected}</dd>
            </div>
            <div>
              <dt>Evidence boundary</dt>
              <dd>{selected.evidence}</dd>
            </div>
          </dl>
          <div className="settings-footer-actions">
            <GameButton type="button" onClick={() => props.onApplyStep(selected)}>
              Apply fixture state
            </GameButton>
            <GameButton tone="primary" type="button" onClick={markInspected}>
              Mark inspected and continue
            </GameButton>
          </div>
        </section>
      </div>
    </GameModalShell>
  );
}
