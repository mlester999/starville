export default function WorldEditorLoading() {
  return (
    <main className="operations-page" aria-busy="true" aria-live="polite">
      <p className="eyebrow">Protected structured draft</p>
      <h1>Loading world editor…</h1>
      <div className="loading-panel">Loading the authorized draft and approved asset catalog.</div>
    </main>
  );
}
