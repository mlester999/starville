import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from 'react';

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface GameModalShellProps extends PropsWithChildren {
  readonly eyebrow?: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly footer?: ReactNode;
  readonly size?: 'compact' | 'medium' | 'wide';
  readonly onClose: () => void;
  readonly closeLabel?: string;
  readonly className?: string;
}

export function GameModalShell({
  children,
  eyebrow,
  title,
  subtitle,
  footer,
  size = 'medium',
  onClose,
  closeLabel = 'Close panel',
  className = '',
}: GameModalShellProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    panel?.focus({ preventScroll: true });

    function keyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || panel === null) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) return;
      if (document.activeElement === panel) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', keyDown, true);
    return () => {
      document.removeEventListener('keydown', keyDown, true);
      previous?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div className="game-modal-backdrop" role="presentation">
      <section
        ref={panelRef}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`game-modal game-modal--${size} ${className}`.trim()}
        role="dialog"
        tabIndex={-1}
      >
        <header className="game-modal__header">
          <div>
            {eyebrow === undefined ? null : <p className="game-kicker">{eyebrow}</p>}
            <h2 id={titleId}>{title}</h2>
            {subtitle === undefined ? null : <p>{subtitle}</p>}
          </div>
          <button
            aria-label={closeLabel}
            className="game-icon-button"
            type="button"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="game-modal__body">{children}</div>
        {footer === undefined ? null : <footer className="game-modal__footer">{footer}</footer>}
      </section>
    </div>
  );
}

interface GameButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly tone?: 'primary' | 'secondary' | 'quiet' | 'danger';
}

export function GameButton({ tone = 'secondary', className = '', ...props }: GameButtonProps) {
  return <button className={`game-button game-button--${tone} ${className}`.trim()} {...props} />;
}

interface GameEmptyStateProps {
  readonly icon?: string;
  readonly title: string;
  readonly message: string;
  readonly actions?: ReactNode;
}

export function GameEmptyState({ icon = '✦', title, message, actions }: GameEmptyStateProps) {
  return (
    <div className="game-empty-state">
      <span aria-hidden="true">{icon}</span>
      <h3>{title}</h3>
      <p>{message}</p>
      {actions === undefined ? null : <div>{actions}</div>}
    </div>
  );
}

export function KeyboardKey({ children }: PropsWithChildren) {
  return <kbd className="game-key">{children}</kbd>;
}

export function StatusIndicator({
  tone,
  children,
}: PropsWithChildren<{ readonly tone: 'success' | 'warning' | 'danger' | 'muted' }>) {
  return (
    <span className={`game-status game-status--${tone}`}>
      <span aria-hidden="true" />
      {children}
    </span>
  );
}
