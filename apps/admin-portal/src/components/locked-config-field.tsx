interface LockedConfigFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly badge?: string;
  readonly description: string;
  readonly name?: string;
  readonly hiddenValue?: string;
}

export function LockedConfigField({
  id,
  label,
  value,
  badge,
  description,
  name,
  hiddenValue,
}: LockedConfigFieldProps) {
  return (
    <div className="field locked-config-field">
      <label htmlFor={id}>{label}</label>
      {name ? <input name={name} type="hidden" value={hiddenValue ?? value} /> : null}
      <div
        aria-describedby={`${id}-description`}
        className="locked-config-field__surface"
        id={id}
        role="group"
      >
        <div className="locked-config-field__main">
          <span className="locked-config-field__value">{value}</span>
          {badge ? <span className="locked-config-field__badge">{badge}</span> : null}
        </div>
        <span aria-hidden="true" className="locked-config-field__lock" title="System managed">
          <svg fill="none" height="16" viewBox="0 0 20 20" width="16">
            <path
              d="M6.25 8.5V6.75a3.75 3.75 0 0 1 7.5 0V8.5M5.5 8.5h9A1.5 1.5 0 0 1 16 10v5.5A1.5 1.5 0 0 1 14.5 17h-9A1.5 1.5 0 0 1 4 15.5V10a1.5 1.5 0 0 1 1.5-1.5Z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
        </span>
      </div>
      <p className="field__guidance" id={`${id}-description`}>
        {description}
      </p>
    </div>
  );
}
