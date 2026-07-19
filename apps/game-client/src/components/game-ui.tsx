import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

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
  readonly closeOnBackdrop?: boolean;
  readonly portal?: boolean;
}

const STARVILLE_MODAL_ROOT_ID = 'starville-modal-root';
let activeBodyLocks = 0;
let bodyOverflowBeforeModal = '';

function modalRoot(): HTMLElement {
  const existing = document.getElementById(STARVILLE_MODAL_ROOT_ID);
  if (existing !== null) return existing;
  const root = document.createElement('div');
  root.id = STARVILLE_MODAL_ROOT_ID;
  root.dataset['starvilleLayer'] = 'modal';
  document.body.append(root);
  return root;
}

function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (activeBodyLocks === 0) {
      bodyOverflowBeforeModal = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    activeBodyLocks += 1;
    return () => {
      activeBodyLocks = Math.max(0, activeBodyLocks - 1);
      if (activeBodyLocks === 0) document.body.style.overflow = bodyOverflowBeforeModal;
    };
  }, [active]);
}

export function GameModalPortal({
  children,
  onClose,
  portal = false,
}: PropsWithChildren<{
  readonly onClose?: () => void;
  readonly portal?: boolean;
}>) {
  const layerRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useBodyScrollLock(true);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = layerRef.current?.querySelector<HTMLElement>('[role="dialog"]') ?? null;
    const previousTabIndex = dialog?.getAttribute('tabindex') ?? null;
    if (dialog !== null && previousTabIndex === null) dialog.tabIndex = -1;
    dialog?.focus({ preventScroll: true });

    function keyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && onCloseRef.current !== undefined) {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || dialog === null) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) return;
      if (document.activeElement === dialog) {
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

    window.addEventListener('keydown', keyDown, true);
    return () => {
      window.removeEventListener('keydown', keyDown, true);
      if (dialog !== null && previousTabIndex === null) dialog.removeAttribute('tabindex');
      previous?.focus({ preventScroll: true });
    };
  }, []);

  const layer = (
    <div ref={layerRef} className="game-modal-portal-layer">
      {children}
    </div>
  );
  return portal ? createPortal(layer, modalRoot()) : layer;
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
  closeOnBackdrop = false,
  portal = false,
}: GameModalShellProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useBodyScrollLock(true);

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

  const modal = (
    <div
      className="game-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
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
  return portal ? createPortal(modal, modalRoot()) : modal;
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
