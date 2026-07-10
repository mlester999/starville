interface AdminBrandProps {
  readonly compact?: boolean;
}

export function AdminBrand({ compact = false }: AdminBrandProps) {
  return (
    <div className={compact ? 'brand brand--compact' : 'brand'} aria-label="Starville Admin">
      <span className="brand-mark" aria-hidden="true">
        <span className="brand-mark__core" />
      </span>
      <span className="brand-copy">
        <strong>STARVILLE</strong>
        <span>ADMINISTRATION</span>
      </span>
    </div>
  );
}
