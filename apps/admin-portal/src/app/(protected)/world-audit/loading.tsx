export default function WorldAuditLoading() {
  return (
    <main className="operations-page" aria-busy="true" aria-live="polite">
      <section className="loading-panel">
        <p className="eyebrow">Append-only world history</p>
        <h1>Loading world audit…</h1>
      </section>
    </main>
  );
}
