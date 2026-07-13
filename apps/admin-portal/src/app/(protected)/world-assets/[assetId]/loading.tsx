export default function AssetDetailLoading() {
  return (
    <main className="operations-page world-assets-page" aria-busy="true">
      <section className="loading-panel">
        <p className="eyebrow">Versioned asset record</p>
        <h1>Loading asset details…</h1>
      </section>
    </main>
  );
}
