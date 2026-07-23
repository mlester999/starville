interface StarvilleMarkProps {
  readonly compact?: boolean;
  readonly gameName?: string;
  readonly tagline?: string;
  readonly logoUrl?: string | null;
}

export function StarvilleMark({
  compact = false,
  gameName = 'STARVILLE',
  tagline = 'A world beneath the stars',
  logoUrl = '/images/starville-icon-official.png',
}: StarvilleMarkProps) {
  return (
    <span className={`starville-mark${compact ? ' starville-mark--compact' : ''}`}>
      <img
        alt=""
        className="starville-mark__logo"
        src={logoUrl ?? '/images/starville-icon-official.png'}
      />
      <span className="starville-wordmark">
        <strong>{gameName}</strong>
        {!compact ? <small>{tagline}</small> : null}
      </span>
    </span>
  );
}
