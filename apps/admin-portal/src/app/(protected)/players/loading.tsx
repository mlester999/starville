export default function PlayersLoading() {
  return (
    <main className="operations-page" aria-busy="true" aria-live="polite">
      <p className="eyebrow">Staff-only player operations</p>
      <h1>Loading players…</h1>
      <div className="loading-panel" aria-hidden="true" />
    </main>
  );
}
