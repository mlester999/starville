export default function EconomyLoading() {
  return (
    <main className="economy-page" aria-busy="true" aria-label="Loading economy administration">
      <div className="economy-loading economy-loading--hero" />
      <div className="economy-metrics-grid">
        {Array.from({ length: 8 }, (_, index) => (
          <div className="economy-loading economy-loading--metric" key={index} />
        ))}
      </div>
      <p className="sr-only" role="status">
        Loading economy data…
      </p>
    </main>
  );
}
