export default function WorldAssetGuideLoading() {
  return (
    <main
      className="operations-page world-assets-page admin-content-shell"
      aria-busy="true"
      aria-live="polite"
    >
      <section className="loading-panel">
        <p className="eyebrow">Operator guidance</p>
        <h1>Loading asset guide…</h1>
        <p>Preparing type-specific checklists and local template tools.</p>
      </section>
    </main>
  );
}
