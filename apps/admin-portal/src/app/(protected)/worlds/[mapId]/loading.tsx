export default function WorldDetailLoading() {
  return (
    <main className="operations-page" aria-busy="true" aria-live="polite">
      <section className="loading-panel">
        <p className="eyebrow">World management</p>
        <h1>Loading map history…</h1>
        <p>Reading protected version and audit metadata.</p>
      </section>
    </main>
  );
}
