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
  logoUrl = null,
}: StarvilleMarkProps) {
  return (
    <span className={`starville-mark${compact ? ' starville-mark--compact' : ''}`}>
      {logoUrl === null ? (
        <svg aria-hidden="true" viewBox="0 0 44 44" focusable="false">
          <path d="M22 3.5 26.3 17.7 40.5 22l-14.2 4.3L22 40.5l-4.3-14.2L3.5 22l14.2-4.3L22 3.5Z" />
          <circle cx="22" cy="22" r="4.1" />
        </svg>
      ) : (
        <img alt="" className="starville-mark__logo" src={logoUrl} />
      )}
      <span className="starville-wordmark">
        <strong>{gameName}</strong>
        {!compact ? <small>{tagline}</small> : null}
      </span>
    </span>
  );
}
