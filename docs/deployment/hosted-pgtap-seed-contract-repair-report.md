# Hosted pgTAP seed-contract repair report

Status: `STARVILLE HOSTED pgTAP SEED-CONTRACT REPAIR LOCALLY COMPLETE, HOSTED RERUN PENDING`

1. **Root cause:** the hosted failures were stale whole-table cardinality assertions in
   `infrastructure/supabase/tests/cozy_gameplay.test.sql`, not evidence that the hosted seed data
   was duplicated or corrupt. The assertions still expected the Phase 7 totals after Phase 11B and
   Phase 11C intentionally extended the same canonical catalogs.

2. **Failing suite:** the affected allowlisted hosted suite is `cozy_gameplay`; its SQL file had
   three obsolete assertions for `cozy_recipe_definitions`, `cozy_recipe_ingredients`, and
   `cozy_shop_offers`.

3. **Observed mismatch:** the stale expectations were 6 recipes, 11 base ingredient mappings, and 14
   fixed-price offers. The owner-observed hosted values were 7, 12, and 17 respectively.

4. **Original recipe seed:** `20260713101000_cozy_gameplay_actions.sql` intentionally seeded six
   recipes: `moonbean-salad`, `sunroot-soup`, `cloudberry-tart`, `meadow-biscuit`, `garden-twine`,
   and `willow-chair`.

5. **Phase 11B recipe addition:** `20260717110000_phase11b_workstation_recipe_job_schema.sql`
   intentionally added `garden-soup` with recipe ID `b1100000-0000-4000-8000-000000000011`,
   cooking-hearth station type, output item `b1100000-0000-4000-8000-000000000001`, output quantity
   1, zero DUST fee, active state, and content version 1.

6. **Current recipe contract:** the approved canonical set is therefore exactly seven known
   identities. The repaired assertion pins each known recipe ID, slug, kind, station type, output
   item, output quantity, DUST fee, active state, and content version while permitting unrelated
   future recipes.

7. **Original ingredient seed:** the Phase 7 migration intentionally seeded eleven base mappings:
   Moonbean Salad = Moonbean ×2 + Cloudberry ×1; Sunroot Soup = Sunroot ×2 + Meadow Flour ×1;
   Cloudberry Tart = Cloudberry ×2 + Meadow Flour ×1; Meadow Biscuit = Moonbean ×1 + Meadow Flour
   ×1; Garden Twine = Moonbean ×2; Willow Chair = Willow Timber ×2 + Garden Twine ×1.

8. **Phase 11B ingredient addition:** the Garden Soup recipe intentionally added one base mapping,
   Moonbean ×2, and copied the approved mappings into immutable version-1 ingredient rows.

9. **Current ingredient contract:** the approved base and active-version sets therefore contain
   twelve exact recipe/item/quantity mappings. Both representations are now asserted by identity
   rather than by a global row total.

10. **Original offer seed:** Phase 7 intentionally seeded fourteen Lantern General Store offers:
    Moonbean Seed buy 8; Sunroot Seed buy 10; Cloudberry Seed buy 12; Meadow Flour buy 6/sell 2;
    Willow Timber buy 9/sell 4; Moonbean sell 7; Sunroot sell 9; Cloudberry sell 11; Willow Chair
    buy 48; Hearth Table buy 70; Moonwoven Rug buy 55; Lantern Floor Lamp buy 60; Meadow Shelf buy
    65; Round Leaf Planter buy 38. Each has minimum quantity 1, maximum quantity 20, active state,
    and content version 1.

11. **Phase 11C offer additions:** `20260717120000_phase11c_shop_catalog_transaction_schema.sql`
    intentionally added Garden Soup sell 10/minimum 1/maximum 10, Moonbean Salad sell 18/minimum
    1/maximum 5, and Garden Twine sell 8/minimum 1/maximum 10. All three are active
    content-version-2 offers in the same General Store.

12. **Current offer contract:** the approved catalog therefore has seventeen known fixed-price offer
    identities. The repaired assertion pins each known offer ID, shop ID, item ID, buy price, sell
    price, quantity bounds, active state, and content version while permitting unrelated future
    offers.

13. **Hosted interpretation:** the owner-observed hosted values 7/12/17 are exactly explained by the
    applied Phase 7 → Phase 11B → Phase 11C migration history.

14. **Corruption determination:** no repository evidence of duplicate seeds, orphan mappings,
    accidental fixture persistence, or migration drift was found. This is a migration-consistent
    diagnosis, not a claim that this task directly inspected or mutated the hosted database.

15. **Why the old strategy failed:** global `count(*) = N` assertions treated an intentionally
    extensible catalog as permanently closed. Every legitimate additive migration could break the
    suite even when all prior canonical identities remained correct.

16. **Replacement strategy:** scoped pgTAP `set_eq` assertions compare the complete approved
    projection for known IDs. This keeps the test strict about canonical rows and additive-safe for
    unrelated future content.

17. **Strictness retained:** a missing known row, changed ID, changed slug, changed output, changed
    station, changed quantity, changed price, changed active flag, changed content version, or extra
    mapping on a known recipe now fails with identity-level evidence.

18. **Recipe assertions added:** the suite checks the seven exact recipe projections, proves each
    approved canonical slug exists exactly once, and verifies each recipe points to its exact
    enabled active version.

19. **Ingredient assertions added:** the suite checks all twelve base mappings, rejects duplicate
    recipe/item identities, rejects orphan recipe or item references, and checks the twelve
    active-version mappings by recipe slug, item slug, and quantity.

20. **Offer assertions added:** the suite checks all seventeen exact General Store offer projections
    and verifies both offer IDs and equivalent shop/item identities are unique.

21. **Uniqueness posture:** the new global uniqueness checks remain safe under additive catalog
    growth because they reject duplicate identities without requiring a fixed total row count.

22. **Referential posture:** the new ingredient orphan assertion supplements existing foreign keys
    with an explicit hosted contract that produces a focused pgTAP failure if recipe or item
    identity integrity is ever lost.

23. **Version posture:** all seven recipes are pinned to their intended version-1 active pointers
    (`b1100000-0000-4000-8000-000000000101` through `b1100000-0000-4000-8000-000000000107`), active
    lifecycle, enabled state, and non-null activation timestamp.

24. **pgTAP plan:** replacing three assertions with nine assertions increases the suite plan from 88
    to 94. The suite still ends with `finish()` and an explicit transaction rollback.

25. **Fixture audit:** `phase11b-postgres-execution.sql` creates a temporary `local-dust-fee-twine`
    recipe only inside its own `BEGIN`/`ROLLBACK` execution fixture.
    `phase11c-postgres-execution.sql` consumes the migrated offer/catalog state. Neither fixture
    explains or repairs the hosted seed totals, and neither required a change.

26. **Files changed by this repair:** `infrastructure/supabase/tests/cozy_gameplay.test.sql`,
    `packages/database/test/migrations.test.ts`, and this report. Pre-existing Phase 12 worktree
    changes were preserved and are outside this repair’s authorship.

27. **Local validation passed:** `pnpm --filter @starville/database test` (208/208);
    `pnpm db:test:local:world` including a clean migration replay plus Phase 7, Phase 11B, Phase
    11C, economy, and concurrency fixtures; focused cozy-gameplay, economy, economy-simulation, API,
    game-client, and admin tests; `pnpm format:check`; `pnpm lint`; `pnpm typecheck`;
    `pnpm security:scan`; and `pnpm test` (69/69 workspace tasks plus 112/112 root script tests).

28. **Validation limitation:** the local PostgreSQL installation does not provide the pgTAP
    extension control file and Docker was unavailable, so this task did not execute the repaired
    `set_eq` statements through pgTAP itself. PostgreSQL 17 grammar parsing, migration-contract
    regression tests, and the clean PostgreSQL migration/fixture chain passed. The owner’s hosted
    run is the first actual pgTAP execution of these new assertions.

29. **Exact owner-only hosted rerun:** after reviewing the diff, run the following commands. They
    were deliberately not run by this task:

    ```sh
    cd "/Users/marklesteracak/Documents/Marky Files/Programming/starville"

    pnpm db:verify-target
    pnpm db:migrations:list
    pnpm db:migrations:dry-run

    RUN_HOSTED_SUPABASE_TESTS=true pnpm db:lint:hosted
    RUN_HOSTED_SUPABASE_TESTS=true pnpm db:test:hosted

    # After API/realtime:
    RUN_HOSTED_SUPABASE_TESTS=true pnpm rls:test:hosted
    ```

30. **No recipe deletion:** no canonical or noncanonical recipe row was deleted, disabled, renamed,
    or rewritten.

31. **No ingredient deletion:** no base or versioned ingredient mapping was deleted, reduced, or
    rewritten.

32. **No offer deletion:** no General Store offer or catalog entry was deleted, disabled, or
    rewritten.

33. **No economy manipulation:** no buy price, sell price, quantity bound, DUST balance, inventory
    balance, reward, or economy policy was changed to make a test pass.

34. **No applied migration edit:** no existing migration file was edited by this repair.

35. **No repair migration:** no new migration was created because the migration history proves the
    database state is intentional and the defect is confined to the test contract.

36. **No hosted mutation:** no hosted SQL, database write, seed operation, reset, repair RPC,
    migration push, or other hosted mutation workflow was executed.

37. **No deployment:** no application, worker, realtime service, Supabase function, database
    migration, or hosted environment was deployed.

38. **No source-control publication:** no commit, push, pull request, tag, merge, reset, or
    destructive cleanup was performed.

Final status: `STARVILLE HOSTED pgTAP SEED-CONTRACT REPAIR LOCALLY COMPLETE, HOSTED RERUN PENDING`
