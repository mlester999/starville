# Phase 10B cosmetic administrator operations

Status: local implementation ready; hosted deployment and owner acceptance pending.

## Operating area

`/game-content/cosmetics` provides permission-aware overview, catalog, collection, emote, grant,
revocation, review, disabled-shop, audit, and settings pages. Catalog lifecycle stays anchored in
the existing Avatar Content and World Asset Manager workflow; Phase 10B does not create a parallel
asset uploader or raw JSON editor.

The navigation is convenience only. Every page requires backend session authorization and every RPC
re-checks the exact permission, active administrator session, assurance level, bounded input,
revision, request identity, and durable rate limit.

## Permission groups

| Work                                      | Permission boundary                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Overview, catalog, collections and emotes | `cosmetics.read`                                                                                  |
| Review workflow                           | `cosmetics.review` plus the existing avatar lifecycle permission needed for the actual transition |
| One-player grant                          | `cosmetics.grant`                                                                                 |
| One-player revocation                     | `cosmetics.revoke`                                                                                |
| Immutable receipts and evidence           | `cosmetics.audit.read`                                                                            |
| Disabled shop preview                     | `cosmetics.shop.read`                                                                             |
| Settings view/edit                        | `cosmetics.settings.read` / `cosmetics.settings.edit`                                             |

Moderators receive no cosmetic economy permission. A support role's grant/revoke access is limited
to the explicitly designed one-player, one-cosmetic workflow; it receives no content approval,
activation, settings mutation, shop activation, bulk grant, currency, or token authority. Wallet
access never creates administrator authority.

## Content workflow

1. Intake and process PNG/WebP through World Asset Manager.
2. Create or edit the stable Avatar Content definition and a new version.
3. Select the approved immutable World Asset version and structured composition metadata.
4. Validate, submit, review, approve, and explicitly activate using the existing separated duties.
5. Build draft collection or emote records only from reviewed stable definitions.
6. Confirm player visibility with a non-administrator account after hosted activation.

Validation is not approval. Review is not activation. Phase 10B performs no automatic publication,
and its platform migration upgrades only future configuration drafts.

## Grants and revocations

A grant or revocation requires a canonical player, stable cosmetic key, closed reason category,
12–500 character explanation, expected current ownership state, and UUID request ID. The operation
locks the request and player/cosmetic state, rejects stale expectations, and writes an immutable
receipt atomically. Exact retries return the stored result. Reusing the request ID with different
intent returns a conflict.

There is deliberately no bulk grant surface. Operators must never encode sensitive customer,
moderation, wallet, health, identity, or payment details in the explanation. Use the smallest
legitimate operational reason and link external case evidence only in the approved support system.

A revocation does not erase history. It changes current ownership to revoked, records who acted and
why, and makes the canonical avatar resolver remove or replace affected equipped content. It does
not debit DUST, delete inventory, revoke token access, suspend a player, or publish a replacement.

## Collections, emotes and settings

Collections are cosmetic-only definitions with bounded members and at most one reviewed cosmetic
reward. Emotes have stable keys, bounded durations, explicit interruptibility, and entitlement
rules. Operators should use the existing reviewed lifecycle; draft overview pages do not imply that
content is active.

Wardrobe, emotes and collections can be disabled independently for maintenance while durable player
state remains intact. `cosmetic_shop` is always false in this phase. A request to enable purchases,
create offers, change prices, or accept payment is out of scope and must be rejected.

## Audit and incident response

Audit pagination is server-side and bounded to 20, 50 or 100 rows. Preserve immutable receipts and
Avatar/World Asset lifecycle history. Do not directly edit a player row, delete a receipt, reset the
database, or rewrite a hosted migration.

For harmful or rights-encumbered content, disable the definition through the reviewed lifecycle,
preserve evidence, revoke only when policy requires it, verify fallback resolution, and inspect
realtime/public payloads. Hosted action requires the normal owner-authorized operational process.
