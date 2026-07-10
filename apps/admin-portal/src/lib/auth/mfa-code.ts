export function normalizeTotpCode(value: string): string | undefined {
  const normalized = value.trim();
  return /^\d{6}$/u.test(normalized) ? normalized : undefined;
}
