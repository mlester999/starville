import type { ReactNode } from 'react';

export type GameActionLinkVariant = 'primary' | 'secondary';

export interface GameActionLinkProps {
  readonly href: string;
  readonly children: ReactNode;
  readonly variant?: GameActionLinkVariant;
  readonly className?: string;
  readonly ariaLabel?: string;
  readonly rel?: string;
  readonly target?: '_self' | '_blank';
}

/**
 * Shared game-client button-styled link.
 * Prevents browser-default purple/underline anchors on maintenance and gate screens.
 */
export function GameActionLink({
  href,
  children,
  variant = 'secondary',
  className,
  ariaLabel,
  rel,
  target = '_self',
}: GameActionLinkProps) {
  const classes = [
    'game-action-link',
    `game-action-link--${variant}`,
    variant === 'primary' ? 'gate-primary' : 'gate-secondary',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <a
      aria-label={ariaLabel}
      className={classes}
      data-game-action-link={variant}
      href={href}
      rel={rel ?? (target === '_blank' ? 'noreferrer noopener' : undefined)}
      target={target}
    >
      {children}
    </a>
  );
}
