export default function WorldPreviewLoading() {
  return (
    <main className="operations-page" aria-busy="true" aria-live="polite">
      <p className="eyebrow">Protected validated content</p>
      <h1>Loading draft preview…</h1>
      <div className="loading-panel">Loading the server-validated draft boundary.</div>
    </main>
  );
}
