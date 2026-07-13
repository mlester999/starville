import Link from 'next/link';

export function WorldAssetPagination(props: {
  readonly page: number;
  readonly totalPages: number;
  readonly total: number;
  readonly previousHref: string | null;
  readonly nextHref: string | null;
  readonly label: string;
}) {
  return (
    <nav className="pagination world-asset-pagination" aria-label={props.label}>
      {props.previousHref === null ? (
        <span aria-disabled="true" className="is-disabled">
          Previous
        </span>
      ) : (
        <Link href={props.previousHref}>Previous</Link>
      )}
      <span aria-live="polite">
        Page {props.page} of {Math.max(1, props.totalPages)} · {props.total} record(s)
      </span>
      {props.nextHref === null ? (
        <span aria-disabled="true" className="is-disabled">
          Next
        </span>
      ) : (
        <Link href={props.nextHref}>Next</Link>
      )}
    </nav>
  );
}
