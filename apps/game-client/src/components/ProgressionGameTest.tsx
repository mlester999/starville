import { createProgressionGameTestFixture } from '@starville/progression';
import { ProgressionWorkspaceView } from './ProgressionPanel';

export function ProgressionGameTest({ onClose }: { onClose: () => void }) {
  return (
    <div className="game-modal-backdrop progression-modal" role="presentation">
      <section
        aria-labelledby="progression-preview-title"
        aria-modal="true"
        className="game-modal game-modal--wide"
        role="dialog"
      >
        <header className="game-modal__header">
          <div>
            <p className="game-kicker">Game Test · isolated fixture</p>
            <h2 id="progression-preview-title">Progression preview</h2>
            <p>No persistent mutation endpoint is available in this preview.</p>
          </div>
          <button autoFocus type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="game-modal__body">
          <ProgressionWorkspaceView preview workspace={createProgressionGameTestFixture()} />
        </div>
      </section>
    </div>
  );
}
