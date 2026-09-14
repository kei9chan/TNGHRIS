# Directory permission-check optimization

Applied migration: 20260914150812_cache_directory_mask_permissions.

The live directory function repeated seven viewer-only masking checks for every
non-self row. These helper functions are STABLE and their arguments are constant
within a request. The change resolves the viewer once and loads those seven flags
lazily on the first non-self row. Flags are local to the function call: no cross-user
or cross-request permission cache is introduced.

The existing can_access_hris_user(u.id) filter is unchanged. All field-nullification
rules, the self-row exception, function owner, ACL, STABLE classification, security
mode and empty search_path are preserved. No data, RLS policies, cron jobs, billing
or database size were changed. No index was added without query-plan evidence.

Local PostgreSQL verification uses PGlite and synthetic data, comparing the old
function from the historical migration with the new migration. Six scenarios cover
empty, self-only, restricted, full, denied, allowed, mixed and nullable permission
results. Returned rows and every field match. For 150 visible synthetic rows with
one self row, masking-helper calls decrease from 1,043 to 7. This is a call-count
reduction, not a measured production latency improvement or capacity guarantee.

Run from the repository root after installing @electric-sql/pglite in a temporary
location:

    PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node tests/directoryMaskEquivalenceTest.mjs

Live metadata verification confirmed the same ACL (postgres, authenticated and
service_role; no anonymous execute), STABLE SECURITY DEFINER and empty search_path.
The security advisor continues to report project-wide warnings; this change does
not resolve those existing function/grant/configuration findings.

Rollback: restore the get_accessible_hris_users definition from
20260823210000_complete_rbac_repair.sql using a new migration. CREATE OR REPLACE
preserves current grants. No data rollback is necessary.

Post-change browser check: Employee Management rendered with 179 table rows
(including header). No employee record bodies were exported. One directory SQL call
between the before/after counter snapshots used 436.86 ms of execution time;
the earlier Phase 1 single-call sample was 1060.82 ms. Samples are small and taken
at different times, so they do not establish a controlled speedup or peak p95.
