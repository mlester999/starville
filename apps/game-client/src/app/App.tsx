import { GameCanvas } from '../components/GameCanvas';
import { parseGameClientPublicConfig } from './public-config';

export function App() {
  const config = parseGameClientPublicConfig(import.meta.env);

  return (
    <main className="game-shell">
      <header className="game-header">
        <div>
          <p className="game-kicker">Phase 1 Foundation</p>
          <h1>STARVILLE</h1>
        </div>

        {import.meta.env.DEV ? (
          <p className="readiness" role="status">
            <span className="readiness-dot" aria-hidden="true" />
            Client shell ready · {config.environment}
          </p>
        ) : null}
      </header>

      <section className="runtime-panel" aria-labelledby="runtime-title">
        <div className="runtime-copy">
          <h2 id="runtime-title">Game runtime boundary</h2>
          <p>
            A minimal Phaser scene is mounted independently from the React interface. Gameplay is
            intentionally not implemented in Phase 1.
          </p>
        </div>
        <GameCanvas />
      </section>
    </main>
  );
}
