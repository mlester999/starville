export function isAllowedRealtimeOrigin(
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  return origin !== undefined && allowedOrigins.has(origin);
}
