export default function OperationsLoading() {
  return (
    <main className="operations-page" aria-busy="true" aria-live="polite">
      <p className="eyebrow">Truthful platform status</p>
      <h1>Loading operations…</h1>
      <div className="loading-panel" aria-hidden="true" />
    </main>
  );
}
