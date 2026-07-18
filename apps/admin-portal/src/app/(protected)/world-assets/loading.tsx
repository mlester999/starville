export default function WorldAssetsLoading() {
  return (
    <main
      className="operations-page world-assets-page admin-content-shell"
      aria-busy="true"
      aria-live="polite"
    >
      <section className="loading-panel">
        <p className="eyebrow">Versioned production-art pipeline</p>
        <h1>Loading world assets…</h1>
        <p>Reading the authorized directory without loading private intake files.</p>
      </section>
    </main>
  );
}
