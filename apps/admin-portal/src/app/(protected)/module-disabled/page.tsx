import Link from 'next/link';

export default async function ModuleDisabledPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly module?: string }>;
}) {
  const moduleLabel = ((await searchParams).module ?? 'requested').replaceAll('_', ' ');
  return (
    <main className="state-shell">
      <section className="state-card">
        <p className="eyebrow">Module unavailable</p>
        <h1>This section is disabled.</h1>
        <p>
          The {moduleLabel} module is not enabled in the active platform configuration. Its data,
          permissions, and audit history are preserved.
        </p>
        <Link href="/overview">Return to overview</Link>
      </section>
    </main>
  );
}
