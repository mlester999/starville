const SERVER_ONLY_CREDENTIAL_IDENTIFIER =
  /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DATABASE_URL|ADMIN_RECOVERY_COOKIE_SECRET|SOLANA_RPC_URL|TOKEN_ACCESS_COOKIE_SECRET|sb_secret_/i;

export interface BrowserSecretScanInput {
  readonly content: Buffer;
  readonly path: string;
  readonly secrets: Readonly<Record<string, string>>;
}

export function inspectBrowserOutput({
  content,
  path,
  secrets,
}: BrowserSecretScanInput): readonly string[] {
  const failures: string[] = [];

  if (SERVER_ONLY_CREDENTIAL_IDENTIFIER.test(content.toString('utf8'))) {
    failures.push(`server-only credential identifier appears in browser output ${path}`);
  }

  for (const [name, secret] of Object.entries(secrets)) {
    if (content.includes(Buffer.from(secret))) {
      failures.push(`${name} value appears in browser output ${path}`);
    }
  }

  return failures;
}
