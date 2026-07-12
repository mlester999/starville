export default function PlayerDetailLoading() {
  return (
    <main className="operations-page" aria-busy="true" aria-live="polite">
      <p className="eyebrow">Player operations</p>
      <h1>Loading player record…</h1>
      <div className="loading-panel" aria-hidden="true" />
    </main>
  );
}
