export default function WorldAssetsLoading() {
  return (
    <main className="operations-page" aria-busy="true" aria-live="polite">
      <section className="loading-panel">
        <p className="eyebrow">Approved asset boundary</p>
        <h1>Loading world assets…</h1>
      </section>
    </main>
  );
}
