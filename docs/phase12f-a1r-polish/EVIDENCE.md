# STARVILLE Phase 12F-A.1R correction — visual review record

The numbered `01`–`05` captures in this directory are the superseded town-polish baseline. They are
retained as a record of the owner-rejected state and must not be presented as final correction
evidence.

The correction was reviewed live in the local in-app browser at 1280×720 using these routes:

- Corrected interior:
  `http://127.0.0.1:3001/?visual-candidate=production-slice-v3&visual-version=v3&review-location=interior`
- Corrected whole-town overview:
  `http://127.0.0.1:3001/?visual-candidate=production-slice-v3&visual-version=v3&review-position=overview&review-camera=overview`
- Corrected cottage entry:
  `http://127.0.0.1:3001/?visual-candidate=production-slice-v3&visual-version=v3&review-position=cottage-entry`

## Observed correction

- The southwest maple now stands on the grass south bank instead of authored water.
- The other two invalid land props found by the audit were also moved off water.
- The interior uses five wall panels instead of nine and reads as an open cutaway home.
- Bed, hearth, dining, reading, storage, and entry zones are visible together.
- The player can enter the corrected room and exit back to the cottage threshold.

This record is local review evidence only. It is not proof of publication or owner approval.
