interface NoticeProps {
  readonly children: string;
  readonly tone?: 'info' | 'success' | 'warning';
}

export function Notice({ children, tone = 'info' }: NoticeProps) {
  return (
    <p className={`notice notice--${tone}`} role="status">
      <span className="notice__mark" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
