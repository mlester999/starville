export default function AvatarContentLoading() {
  return (
    <main aria-busy="true" aria-live="polite" className="avatar-page avatar-page--loading">
      <p className="eyebrow">Avatar content</p>
      <h1>Loading protected content…</h1>
      <div aria-hidden="true" className="avatar-loading-grid">
        <span />
        <span />
        <span />
      </div>
    </main>
  );
}
