import { GameButton, GameEmptyState, GameModalShell } from './game-ui';

export type WorldNoticeModalState =
  | { readonly status: 'loading'; readonly title: string }
  | { readonly status: 'ready'; readonly title: string; readonly content: string }
  | { readonly status: 'empty'; readonly title: string }
  | { readonly status: 'error'; readonly title: string; readonly message: string };

export function WorldNoticeModal({
  state,
  onClose,
  onRetry,
}: {
  readonly state: WorldNoticeModalState;
  readonly onClose: () => void;
  readonly onRetry?: () => void;
}) {
  return (
    <GameModalShell
      className="world-notice-modal"
      closeLabel="Close landmark notice"
      closeOnBackdrop
      eyebrow="World landmark"
      footer={
        <GameButton tone="primary" type="button" onClick={onClose}>
          Continue exploring
        </GameButton>
      }
      portal
      size="compact"
      title={state.title}
      onClose={onClose}
    >
      {state.status === 'loading' ? (
        <div className="world-notice-modal__loading" role="status">
          <span className="game-loader" aria-hidden="true" />
          <p>Opening the published notice…</p>
        </div>
      ) : state.status === 'error' ? (
        <GameEmptyState
          icon="◇"
          message={state.message}
          title="Notice unavailable"
          actions={
            onRetry === undefined ? undefined : (
              <GameButton type="button" onClick={onRetry}>
                Try notice again
              </GameButton>
            )
          }
        />
      ) : state.status === 'empty' || state.content.trim().length === 0 ? (
        <GameEmptyState
          icon="◇"
          message="This landmark has no notice content in the selected published revision."
          title="Notice unavailable"
        />
      ) : (
        <p className="world-notice-modal__content">{state.content}</p>
      )}
    </GameModalShell>
  );
}
