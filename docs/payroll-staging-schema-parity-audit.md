# Payroll-staging schema parity audit — 2026-09-05

## Scope and outcome

Target branch: `payroll-staging`. Target database: `suxncpnerzfkjhkhjwbd`.
Production source: `kpogfmwsxwikfilxhcqh`, inspected only using read-only catalog queries.
The application schema matches the production snapshot after migration
`20260905023445_restore_production_application_schema_parity.sql`.

All 125 existing files under `supabase/migrations` were read and inventoried
(1,201,558 bytes; 287 function declarations). No historical migration was edited,
deleted, renamed, or marked applied. No production rows or files were copied.
The only inserted configuration consists of 17 empty storage bucket definitions.

The earlier “5 migrations versus 151” observation was an indicator, not a schema
comparison. A baseline may legitimately consolidate many migrations. The actual
catalog comparison established the missing objects below.

## Catalog comparison

| Category | Production | Staging before | Staging after |
| --- | ---: | ---: | ---: |
| Application tables/views | 116 | 74 | 116 |
| Columns | 1,600 | 1,139 | 1,600 |
| Application functions | 234 | 6 | 234 |
| Constraints (including constraint triggers) | 473 | 276 | 473 |
| Indexes | 365 | 90 | 365 |
| RLS policies (public/private/storage) | 312 | 3 | 312 |
| Triggers (including four managed storage triggers) | 74 | 4 | 74 |
| Enum types | 30 | 30 | 30 |
| Table privilege entries | 2,981 | 2,060 | 2,981 |
| Effective column privilege entries | 24,043 | 18,180 | 24,043 |
| Explicit column ACLs | 28 | 0 | 28 |
| Sequences | 3 | 2 | 3 |
| Realtime publication memberships | 2 | 0 | 2 |
| Storage bucket definitions | 17 | 0 | 17 |

There are zero missing or differing audited application objects after repair.
Function definitions, argument/return declarations, security settings, owners,
search paths, and grants match production. Views retain `security_invoker=true`.
Table RLS flags, policy expressions, sequence ownership, schema ACLs, default
ACLs, and replica identity settings also match.

Staging's existing platform extension `pg_net` is retained. Both environments
have the same five other extensions. Physical column positions and sequence
current values are intentionally excluded: parity does not reorder existing
table data or copy production counters. Supabase-managed Auth/Storage internals,
database roles, secrets, OAuth connections, and hosting configuration are outside
the application-schema repair. All eight Edge Function names are present and
ACTIVE in both environments; their code/configuration was not deployed or
certified by this database audit.

## Repair contents and dependency order

1. Create the missing sequence, 40 tables, and six missing columns on existing
   tables using production types/defaults.
2. Restore 228 missing functions from `pg_get_functiondef`. Temporarily disable
   body checks to allow forward references during restoration.
3. Restore two views, missing constraints and indexes, then the policies.
4. Restore table, column, function, and sequence grants. Privilege revokes remove
   excess access; they do not delete application rows.
5. Restore 70 application triggers, including the three deferred RBAC constraint
   triggers, and two Realtime memberships.
6. Create empty buckets and align two sequence types/ownership without resetting
   their current values.
7. Re-enable body checking, recompile all 234 application functions, and issue
   `NOTIFY pgrst, 'reload schema'`.

This includes both missing dashboard RPCs:
`get_my_pending_manpower_approval_ids()` and `get_my_request_summaries()`.
The frontend already calls their correct zero-argument signatures, and its
expected return fields match production. No frontend changes were needed.

## Exact validation performed

- Applied the complete repair inside a staging transaction and rolled it back.
  Generator errors found during preparation were corrected before application:
  function guards needed type-only signatures, and deferred constraint triggers
  needed `CREATE CONSTRAINT TRIGGER`, not `ALTER TABLE ADD CONSTRAINT`.
- Applied the complete repair twice in one transaction, recompiled all application
  functions with body validation enabled, and executed the dashboard tests.
  The repeat-application check passed, then the transaction rolled back.
- Applied the final migration to staging through Supabase's migration API. The
  recorded version is `20260905023445`; the repository filename matches it.
- Re-exported staging's catalogs and compared all 19 categories using
  `scripts/audit-schema-parity.py`: exit code 0, with only the documented extra
  `pg_net` extension.
- Compared row counts and row-content checksums across all 74 pre-existing staging
  tables before and after: no existing rows changed.
- Under the actual `authenticated` database role with Kay's staging JWT claims:
  bootstrap returns Active; effective RBAC authorizes Admin + Board of Director.
  Manpower, My Requests, requisition, asset, time, offer, and NTE queue RPCs all
  execute successfully and return no requests for this test dataset.
- Under that same authenticated role, inserted an `app_settings` row, updated its
  name, and read back the updated value. The whole test rolled back.
- Security advisors: 122 findings in staging and 122 in production, with no new
  staging finding keys. These are inherited findings, not a clean security audit.
  Performance advisors were also inspected.
- Targeted repository smoke tests: `test:my-requests`, `test:on-call-manpower`,
  and `test:rbac` all passed (the manpower test reports 30/30 checks).
- No disposable/local PostgreSQL or Docker runtime was available. Installation
  attempts were blocked by environment/network restrictions. Therefore the
  entire 125-file historical migration sequence was **not** replayed from an empty
  database; validation covers the additive migration against actual staging,
  repeat application, dependency compilation, and authenticated execution.
- Browser login/workflow completion behind Vercel Authentication was not verified
  by this audit. Database role tests are not a claim of full browser testing.

## Remaining issues and boundaries

Three literal frontend RPC names are absent from production as well as staging:
`save_pan_template`, `archive_pan_template`, and `set_default_pan_template`,
called in `pages/employees/PersonnelActionNotice.tsx`. There is no production
definition to copy. They remain a separately scoped application defect.

Staging still contains its own limited test data and one Auth user. The repair
does not clone employees, historical requests, approvers, role configuration
data, email credentials, calendar connections, or stored documents. Workflows
requiring other users need staging test users/configuration before end-to-end
approval testing. In particular, schema parity is not reference-data parity.

Recorded migration histories remain different (production: 151; staging: 6).
No migration history was fabricated or rewritten. Earlier staging migration
filenames/recorded versions also differ; that existing history alignment and a
full clean replay remain unverified.

Inherited security advisories include mutable function search paths, intentionally
executable SECURITY DEFINER functions, and six RLS-enabled tables without policies:
[Supabase database linter guidance](https://supabase.com/docs/guides/database/database-linter).
Restoring exact production behavior does not resolve those pre-existing findings.

No main-branch commit, production migration, production deployment, database
reset, destructive data statement, or manual `schema_migrations` creation was
performed.

## Reproduce the catalog comparison

Run `scripts/sql/schema-parity-catalog.sql` and
`scripts/sql/schema-parity-aux.sql` as read-only queries for each project.
Save each query's `catalog` JSON value to the corresponding local JSON file.
These contain application definitions and bucket configuration, not table rows.

```sh
python scripts/audit-schema-parity.py production.json staging.json \
  --production-aux production-aux.json --staging-aux staging-aux.json
```
