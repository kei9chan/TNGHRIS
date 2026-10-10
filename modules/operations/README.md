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

## Checklist import and team execution

Checklist Library includes an XLSX/CSV import preview and CSV sample export. The sample groups one task per row by checklist title. Category, location and description must be consistent within a checklist. Original Fun Roof section / YES / NO forms are accepted, including merged section headings. Form checkmarks are not imported as historical completions. Imports create new templates (draft or published), use the selected authorized workspace, and commit atomically through `ops_import_checklists`. Source name is recorded in audit events. Reimporting deliberately creates new templates.

Checklist assignment defaults to a shared team run, with an optional independent recipient mode for the original whole-work confirmation flow. Select the on-duty recipients and a due time manually; create a new assignment for each day/shift. A shared run freezes one published checklist version and retains an assignment record per recipient. Team cards/statistics count shared runs once; staff summaries count each staff member's participation. No automatic shift recipient lookup is implied.

Shared run item states are stored in `ops_item_checks`. Only active, currently eligible assigned team members can check items. Required items determine completion, optional items do not block it. Checking records actor identity/name, item title, timestamp and optional note in append-only audit events. Unchecking requires a reason and may reopen completed work. This is confirmation only: detailed evidence and independent supervisor approval remain deferred. Managers can review and cancel/reschedule the entire shared run but cannot check on behalf of staff unless assigned themselves. All shared writes lock the run first, then enforce item or assignment revisions, so stale updates fail instead of overwriting another actor's work. Cancelled runs reject further checks. Historical recipients and audit events remain visible after a transfer, but transferred users cannot submit checks for a former unit.

Validation: `node tests/operationsSharedChecklistTest.mjs`, `node tests/operationsChecklistImportTest.mjs`, and the existing Operations DB/browser tests. Optional `TNG_FUNROOF_CHECKLIST=/path/to/source.xlsx` tests the uploaded nine-section, 96-item form. Browser tests exercise sample download/import, two actors sharing progress, check/uncheck attribution, and responsive rendering.

## Maintenance asset eligibility

The existing Asset Management register now has an opt-in `requires_maintenance` boolean (default false) and the `Equipment` classification. Authorized asset editors can create or edit the flag. The register includes an Edit action, maintenance badge/filter, CSV report column and an optional `requires_maintenance` column in CSV/XLSX import samples. Old import templates remain accepted; blank means false. Imports validate booleans and persist the flag atomically with existing assignments, notifications and audit entries. Existing asset RLS and management permissions remain unchanged.

`ops_workspace` returns only flagged assets owned by the selected unit (existing UUID-string and business-unit-name mappings are supported). Every task save/publish/import validates asset eligibility server-side. Task Library uses these assets for linking work. Assign work provides an optional maintenance-asset filter across published tasks and checklist item snapshots; selecting equipment does not change a published version's asset. Removing the flag or transferring the asset removes it from future selectors. Historical versions and already assigned work remain intact. Existing recurring rules continue using their pinned published versions; maintenance plans and asset service histories remain a later phase.

Validation: `node tests/assetMaintenanceTest.mjs` and `TNG_TEST_CHROMIUM_PATH=/path/to/chromium node tests/assetMaintenanceBrowserTest.mjs`. The browser harness mounts the actual asset register, editor, batch import and Operations workspace against the authenticated PostgreSQL fixture; no production data is used.


## Maintenance plans and service history

Maintenance is available inside Operations Station, scoped by the existing workspace selector.
Assets are existing Asset Management records marked Requires maintenance and not Retired.
Asset editing retains the existing Assets/Manage permission; maintenance assignment does not grant it.

A maintenance plan is an `ops_rules` record with an asset FK and structured `config.maintenance`
metadata. Each asset can have multiple independent plans. Published generic checklists are reused
without mutation; contradictory asset-specific templates are rejected. Plans support Draft, Active,
Paused and Archived, existing optimistic revisions, immutable rule versions and audit events.
Schedules support daily/weekly/monthly intervals, yearly, explicit dates, and explicit annual
month/day dates. Upcoming previews contain up to 12 dates within five years. Fixed Manila calendar
windows include explicit overnight offsets. No assumed manufacturer intervals are supplied.

The existing minute worker generates one occurrence per plan/date and resolves published-shift
coverage, owner, team, backups and notifications. Maintenance occurrences freeze asset identity,
original unit, activity, published version, schedule and requirements. Later plan edits affect newly
generated dates only; existing staffing availability continues to refresh. Handovers and exceptions
use Coverage / Manage responsibility and keep contributor responses. Completion is submission,
not independent verification. The maintenance history RPC pages 100 records at a time and builds
responses/evidence only for that page; CSV export fetches all matching authorized pages. History
and read policies use original occurrence ownership, so asset transfer does not move old records.

Opt-out, retirement or transfer pauses affected plans, records a block and version/audit entry, and
notifies the responsible manager with a dedupe key. Re-enabling the asset does not automatically
restart the plan: authorized review and activation are required. Existing work/history are kept.
Photos continue to use the existing compressed upload and actual-byte 60-day retention worker;
expired photo metadata and operational findings remain in history. Manuals are reference URLs.

Verification: `node tests/maintenancePlansTest.mjs` and
`TNG_TEST_CHROMIUM_PATH=/tmp/tng-chromium node tests/maintenancePlansBrowserTest.mjs`.
Browser tests mount the real Operations page and route its Supabase calls to the migrated PGlite
Postgres fixture with authenticated roles; no production employee messages or test assets persist.
Earlier Phase 2/3/shared execution tests are also run against the combined maintenance schema.
