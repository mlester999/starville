import { useState } from 'react';
import {
  createPhase12aLocalFixture,
  PHASE12A_LOCAL_FIXTURES,
  type Phase12aLocalFixtureKey,
} from '@starville/player-experience';

export function PlayerExperienceGameTest({ onClose }: { readonly onClose: () => void }) {
  const [tab, setTab] = useState<'journey' | 'daily' | 'help'>('journey');
  const [fixtureKey, setFixtureKey] = useState<Phase12aLocalFixtureKey>('game-test-new-player');
  const fixture = createPhase12aLocalFixture(fixtureKey);
  const workspace = fixture.workspace;
  return (
    <div className="world-overlay player-guide-overlay" role="presentation">
      <section
        aria-labelledby="game-test-player-experience-title"
        aria-modal="true"
        className="player-guide-dialog"
        data-persistence={workspace.persistence}
        role="dialog"
      >
        <header>
          <div>
            <p className="game-kicker">Game Test · temporary fixture</p>
            <h2 id="game-test-player-experience-title">Onboarding and Daily Rhythm</h2>
            <p>
              All controls are inspection-only. No player, inventory, DUST, XP, or quest state is
              saved.
            </p>
          </div>
          <button aria-label="Close onboarding Game Test" type="button" onClick={onClose}>
            ×
          </button>
        </header>
        <nav aria-label="Game Test guide sections" className="player-guide-tabs">
          {(['journey', 'daily', 'help'] as const).map((key) => (
            <button
              aria-current={tab === key ? 'page' : undefined}
              key={key}
              type="button"
              onClick={() => setTab(key)}
            >
              {key === 'journey' ? 'Journey' : key === 'daily' ? 'Daily Rhythm' : 'Help'}
            </button>
          ))}
        </nav>
        <div className="player-guide-content">
          <label className="player-guide-fixture-picker">
            Local fixture
            <select
              value={fixtureKey}
              onChange={(event) => setFixtureKey(event.target.value as Phase12aLocalFixtureKey)}
            >
              {PHASE12A_LOCAL_FIXTURES.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <small>{fixture.description}</small>
          </label>
          <p className="player-guide-fixture-state">
            DUST {fixture.state.dust} · inventory {fixture.state.inventory.replaceAll('_', ' ')} ·
            crop {fixture.state.crop} · shop {fixture.state.shop} · settlement{' '}
            {fixture.state.rewardSettlement.replaceAll('_', ' ')}
          </p>
          {tab === 'journey' ? (
            <>
              <section className="player-guide-current">
                <p className="game-kicker">Current fixture objective</p>
                <h3>{workspace.activeObjective?.title}</h3>
                <p>{workspace.activeObjective?.instruction}</p>
                <small>{workspace.activeObjective?.routeHint}</small>
              </section>
              <ol className="player-guide-step-list">
                {workspace.onboarding.steps.map((step) => (
                  <li data-status={step.status} key={step.key}>
                    <span aria-hidden="true">{step.status === 'completed' ? '✓' : '•'}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <small>{step.status}</small>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          ) : null}
          {tab === 'daily' ? (
            <div className="player-guide-daily-grid">
              {workspace.daily.objectives.map((objective) => (
                <article key={objective.assignmentId}>
                  <span>{objective.category}</span>
                  <h3>{objective.title}</h3>
                  <p>{objective.description}</p>
                  <small>{objective.rewardLabel}</small>
                </article>
              ))}
            </div>
          ) : null}
          {tab === 'help' ? (
            <div className="player-guide-help">
              {workspace.guide.map((entry) => (
                <details key={entry.key}>
                  <summary>{entry.title}</summary>
                  <p>{entry.summary}</p>
                </details>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
