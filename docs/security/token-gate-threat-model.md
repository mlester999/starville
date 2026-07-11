# Token-gate threat model

| Threat                                      | Control                                                                                                                            | Residual condition                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Client invents eligibility                  | Strict request schemas contain no balance/grant field; API RPC result is authoritative                                             | Trusted RPC provider remains an external dependency                              |
| Challenge replay or concurrent verify       | UUID plus 256-bit nonce, short TTL, hashes, durable attempt ceiling, atomic conditional consume                                    | RPC failure requires a new signature by design                                   |
| Message/address/domain/network substitution | Canonical exact bytes bind every field; signature public key and stored snapshot must match                                        | Owner must deploy the correct public landing origin                              |
| Different token with the same symbol        | Exact configured mint and program checks; symbol is display-only                                                                   | Admin must independently confirm the owner-approved mint                         |
| Integer rounding                            | Raw decimal strings and `bigint`; no floating-point authorization                                                                  | Display formatting is never authoritative                                        |
| Malicious/misconfigured RPC                 | Devnet genesis, mint owner/program, schemas, `minContextSlot`, monotonic checked slots, timeout, bounded retry, fail-closed errors | One provider can still be unavailable or dishonest                               |
| Stale balance                               | Short session, atomic pre-RPC recheck claim, focus reconciliation, insufficient/stale-slot revocation                              | Balance can change between successful checks within the approved interval        |
| Stolen cookie                               | 256-bit opaque value, HMAC-only DB storage, host-only HttpOnly/SameSite/Secure attributes, short TTL, rotation/revocation          | A compromised same-site browser session remains in scope until expiry/revocation |
| CSRF / spoofed client IP                    | Exact Origin, JSON POST, SameSite cookie, explicit CORS, and an empty-by-default exact trusted-proxy CIDR list                     | Approved proxies must preserve Origin and must not log cookies                   |
| Admin privilege escalation                  | Verified bearer, active trusted admin session, permission check in API and PostgreSQL, expected config version, audited reason     | Permanent admin lifecycle remains governed by Phase 2 controls                   |
| Direct Supabase mutation                    | RLS plus revoked direct grants for anon, authenticated, and service role                                                           | Function ownership and grants must be reviewed on every migration                |
| RPC/challenge amplification                 | Durable wallet/IP/challenge/recheck/admin limits, RPC timeouts and bounded retries                                                 | Limits require capacity review before multi-region scaling                       |
| Secret/log leakage                          | Environment profiles, server-only imports, logger redaction, no body logging, browser bundle scan                                  | Operator tickets and proxy/provider logs require separate discipline             |

The threat model excludes transaction signing because Phase 3 exposes no send/transaction path.
Wallet signatures authenticate access only. It also excludes Phase 4 gameplay, economy, inventory,
rewards, and multiplayer authority, which are not implemented.

Required external acceptance includes real supported wallets, rejection/account/network flows,
insufficient and exact/sufficient balances, RPC outage, cookie behavior on the deployed domains,
configuration invalidation, hosted RLS, and browser secret scanning. Hosted checks now pass; live
eligible approval still requires an owner-controlled wallet holding the temporary Mainnet token.
