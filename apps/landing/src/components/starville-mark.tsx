interface StarvilleMarkProps {
  readonly compact?: boolean;
}

export function StarvilleMark({ compact = false }: StarvilleMarkProps) {
  return (
    <span className={`starville-mark${compact ? ' starville-mark--compact' : ''}`}>
      <svg aria-hidden="true" viewBox="0 0 44 44" focusable="false">
        <path d="M22 3.5 26.3 17.7 40.5 22l-14.2 4.3L22 40.5l-4.3-14.2L3.5 22l14.2-4.3L22 3.5Z" />
        <circle cx="22" cy="22" r="4.1" />
      </svg>
      <span className="starville-wordmark">
        <strong>STARVILLE</strong>
        {!compact ? <small>A world beneath the stars</small> : null}
      </span>
    </span>
  );
}
