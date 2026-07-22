# STARVILLE Phase 12F-A.1R town polish — correction report

Status: **LOCALLY CORRECTED, OWNER REVIEW PENDING**

The earlier `LOCALLY COMPLETE` status was premature. Owner review exposed a tree authored on water
and an interior that had not been included in the town-composition polish. This correction revokes
that status and addresses both failures in the local unpublished V3 fixture only.

## Exterior placement correction

- Audited every exterior object against the resolved, order-aware terrain at its foot anchor.
- Found three invalid land placements: `maple-southwest`, `rock-southwest`, and `flowers-southeast`
  all resolved to water.
- Re-sited all three onto land and moved their blocking footprints with them.
- Added a regression test that checks every exterior object anchor and a four-point clearance ring
  around every tree against authored water.
- Bumped the local unpublished exterior manifest to revision 1215.

## Interior correction

- Replaced the nine-panel perimeter treatment with a five-panel cutaway. The remaining panels form
  the back and short side walls; no foreground wall corridor remains.
- Re-staged the room into readable bedroom, hearth, dining, reading, storage, and entrance zones.
- Added a reading chair and entrance rug, then re-positioned the bed, table, chairs, counter,
  storage, wardrobe, lamp, plant, and their collision footprints around a clear central route.
- Kept the door-to-room corridor clear and added a walkability regression at three points along it.
- Bumped the local unpublished interior manifest to revision 1215.
- Verified live that `Enter home` loads the corrected interior and `Exit home` returns to the
  exterior threshold.

## Files changed by this correction

- `packages/game-content/src/production-slice-v3.ts`
- `packages/game-content/test/production-slice-v3.test.ts`
- `apps/game-client/src/app/production-slice-review.test.ts`
- `docs/phase12f-a1r-polish/FINAL_REPORT.md`
- `docs/phase12f-a1r-polish/VALIDATION.md`
- `docs/phase12f-a1r-polish/EVIDENCE.md`

The repository already contained broader uncommitted Phase 12F work. It was preserved without reset,
staging, commit, push, deployment, publication, activation, migration, or hosted writes.

## Remaining limitation

Owner visual approval is still required. This is a composition correction using the existing V3
raster set; it is not a published-art approval and does not claim the V3 candidate is final.

## Safety statement

- V1 and V2 configurations were not edited.
- Published/default mappings were not changed.
- Hosted database, storage, authentication, and production data were not touched.
- No migration, commit, push, deploy, activate, or publish action was performed.
