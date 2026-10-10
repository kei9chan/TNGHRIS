# Operations Station — Phase 1

The authenticated `/operations` route replaces the Punch Station link in the main HRIS navigation. The original `/punch-station/` entry point, attendance modules, payroll modules, schedule modules and asset records remain intact.

## Authority

The database resolves the current active HRIS user through the existing auth mapping. Active `user_roles` joined to active `roles` determine administrator, BOD and BUM authority. GLOBAL, SPECIFIC and HOME_ONLY scopes are respected. Home membership and existing SPECIFIC unit assignments provide workspace membership; an employee can also retrieve their own historical assignment after transferring units.

BUMs and GeneralManagers manage their authorized units. BOD/admin users manage authorized units; global BOD/admin users edit TNG masters. Other reporting managers can see their direct team's assignments. BUMs may separately delegate template creation and team assignment. Delegated creators edit/archive only their own templates; delegated assignment remains limited to direct reports in the unit. Employees cannot write access grants.

Public RPC wrappers are authenticated-only security definers so they can invoke the unexposed private implementations without granting private schema access. Every implementation validates active authentication and scope. The security advisor reports these intentional authenticated API wrappers; tests verify their authorization boundaries. All six public operations tables have RLS, authenticated scoped SELECT policies, and no direct authenticated INSERT/UPDATE/DELETE grants. Anonymous access is denied.

## Records and lifecycle

- `ops_templates`: task/checklist identity, business-unit ownership, draft content and optimistic revision.
- `ops_template_versions`: immutable published versions with foreign keys to existing departments, assets and managers.
- `ops_checklist_items`: ordered items with copied published task instructions/requirements; source task versions remain referenced.
- `ops_assignments`: one independent record per recipient, frozen template version, due timestamp, priority, extra instructions and attachment links.
- `ops_permissions`: manager-controlled supervisor delegation.
- `ops_audit_log`: template actions, grants, assignment creation, rescheduling, cancellation and assignee status changes.

Saving a draft does not alter the currently published version. Publishing adds a version; archiving prevents new assignment but preserves existing work. Individual/department/position/active HRIS role selection is resolved by the server. A mixed invalid individual audience fails atomically. Cancellation requires a reason. Rescheduling requires a reason, open status and authorized manager. FOR UPDATE locks and revision checks prevent competing changes from overwriting each other.

Phase 1 completion is assignee confirmation, not independent approval. A future-verification flag always remains `Not yet implemented`. Photo/text/numeric response requirements are stored and displayed, but detailed response collection and verification are deferred. Attachments are named HTTP/HTTPS document links. Scheduling is the working manual due-date list; no recurrence engine or automatic reminders are presented as active.

All UI dates, due-time entry and weekly/monthly filters use Asia/Manila. Workspace preference is device-local; records persist in Postgres.

## Verification

```sh
node tests/operationsStationTest.mjs
node tests/operationsStationBrowserTest.mjs
npm run build
```

The browser test requires Playwright and installed Chromium. `TNG_TEST_CHROMIUM_PATH` can select a compatible executable, and `TNG_TEST_TAILWIND_PATH` can select a cached Tailwind script. The harness mounts the actual component and services against an isolated PostgreSQL-compatible PGlite database with authenticated-role RPCs; no real employee assignments or emails are created. Screenshots are written to `/tmp/tng-operations-{desktop,tablet,mobile,employee}.png`.

Database tests cover multi-unit managers, cross-unit denial, unauthorized mutations, assign-only delegation and revocation, role/department/position audiences, immutable instructions, separate recipients, stale/concurrent changes, cancellation, employee transfer, anonymous/no-session denial and persistence after database restart. Browser tests cover publishing, checklist ordering, assigning multiple recipients, duplication/archive, employee completion, BOD master-to-BUM assignment, all primary views, responsive layouts and refresh persistence.

Production role verification used real HRIS identity mappings in a single rolled-back transaction: BOD-to-BUM, BUM-to-employee, frozen checklist instructions, employee RLS/completion, cross-unit denial and two-unit BUM access all passed. No QA records remain in production.
