export default function WorldsLoading() {
  return (
    <main className="operations-page" aria-busy="true" aria-live="polite">
      <section className="loading-panel">
        <p className="eyebrow">Versioned world content</p>
        <h1>Loading worlds…</h1>
        <p>Reading authorized map metadata and publication state.</p>
      </section>
    </main>
  );
}
