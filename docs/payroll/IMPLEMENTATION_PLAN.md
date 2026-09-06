# TNG Payroll — Lean Implementation

## Delivery decision

The user approved direct implementation on `main` and deployment to the existing
production HRIS, one phase at a time. A separate test environment or staging branch
is not required. This supersedes the test-environment prerequisites in the older
payroll-modernization documents. Use focused checks, a current successful backup,
bounded additive migrations, compatible application releases and forward fixes.
Do not create fake employees, sample payroll, payments or live test grants.

New processing is disabled until the corresponding phase is complete and activated.
Phase 1 includes a database constraint that permits only `off`. Keep `shadow` and
`live` in the mode vocabulary for later phases; enabling them requires a reviewed
forward migration and the corresponding server-side operation gates. Access
administration works while processing is off.

## Phase 0 findings (2026-09-05)

- Reviewed `main` at `63800f32af5cf735c8c33fee61e20f8e810786a5` and production catalogs.
- Production login uses `get_my_hris_bootstrap()` and `get_my_effective_rbac()`.
  Preserve those signatures, existing role assignments, employee-profile RPCs,
  sensitive-column protection and unrelated row policies.
- Employee master, BUs, reporting lines, schedules, leave and OT are reused.
- Production has no payroll engine/result tables. Money screens are prototypes.
- Previous staging work provides dated compensation, classification, calendars,
  attendance interpretation and correction foundations. Reuse selectively in the
  relevant phase after access/scope review; do not import fixtures or schema repairs.
- Staging DB has Phase 1L changes absent from published staging Git at `250f60d`.
- Baseline payroll and DTR workbooks were supplied. Reconciliation and the broken
  auxiliary references/date labels still need resolution before calculation approval.
- The sample establishes Aug 11–25 → Sep 5. Rate values are consistent with an
  annual 313-day divisor and eight-hour day; scope/proration/rounding are not yet approved.

## Confirmed company requirements

- Five-minute grace is excluded: 09:06 for 09:00 is one late minute.
- One unpaid movable lunch hour; worked-lunch OT requires direct-manager approval.
- Annual 5 VL/5 SL accrue during probation, remain locked until actual regularization,
  and unlock once on a prorated basis; accrual continues afterward.
- One-hour minimum OT; 75 minutes is eligible and must retain its actual duration.
- Payroll sequence: HR timekeeping finalization/submission → Finance PR preparation
  → HR review → HR endorsement → HR Manager authorization → Finance authorization
  → two distinct BOD approvals → Finance disbursement → payslip distribution.
- Finance authorization is independent of PR preparation. No preparer/material editor
  may approve their own PR. Actual workflow enforcement belongs to Phase 7.
- Manager offsets: approved rest-day/holiday work only; HR Manager → GM → two
  distinct BOD approvals. Offset authority does not grant salary/PR access.
- Cutoffs: 11–25 pays on the following month's 5th; previous-month 26–current-month
  10 pays on the 20th. Retain the 26–10 mapping as the plan's working interpretation
  until supported by the applicable approved calendar.

Unresolved: weekend/holiday payday handling; divisor applicability, proration and
rounding; leave posting/year basis/carryover/conversion; offset conversion/expiry
and premium interaction; shorter worked lunch and actual-versus-approved OT;
insufficient-net deductions and payslip release after pending/failed payment.
None is silently activated by Phase 1.

## Phase 1 — Separate Payroll Access only

### Implementation

- `modules/payroll/`: isolated profile card, access page and access client.
- `payroll_access_scopes`: organization, existing BU and optional named payroll-group
  security scopes, each with processing mode. This is not another employee/payroll
  membership master. Later payroll groups must explicitly link to these scopes.
- `payroll_access_grants`: explicit authenticated user + scope + duty; grant/revocation
  attribution and reason. No permissions inferred from HRIS role or pay eligibility.
- `payroll_access_audit`: server-written append-only history.
- `payroll_access_state`: one-time bootstrap state, never reset after revocation.
- Duties: finalize timekeeping, prepare PR, review/endorse, authorize HR, authorize
  Finance, BOD approval, release/disbursement, manage access. These grant authority
  for future work; no calculation/approval/disbursement engine is implemented here.
- An existing active Admin may explicitly initialize the first access manager from
  their own profile. This one-time bootstrap grants `manage_access` only. Ordinary
  grant/revoke paths prohibit changing one's own access. Subsequent management
  requires an explicit management grant covering the target scope.
- Organization management covers all scopes; BU management covers that BU and its
  payroll-group scopes; group management covers only that exact group. Access
  management implies no salary duty. No user assignments are seeded by deployment.
- Client table writes are revoked. Narrow authenticated RPCs validate the caller's
  current active HRIS identity and the latest database grants on each request.
- Staff money prototype routes display the protected access/off page; existing
  clock, schedules, leave, OT, WFH, loans and time reports retain existing behavior.
- Employee self-service remains separate; own released payslips are a Phase 7 feature.

### Focused checks

Build the app and run existing auth/RBAC/direct-manager checks. Verify the new
database catalog, authenticated/anonymous grants, scope denial and processing-off
checks without changing production employee/role records. Verify grant/revoke
transactions when making actual authorized assignments. Do not claim a role-by-role
live browser or grant/revocation test was performed unless it actually was.

### User check

1. Open My Profile → Payroll Access, or Payroll → Payroll Access.
2. An existing Admin uses **Set up Payroll Access** once, with a reason. Select an
   employee, scope and duty to make a real authorized assignment.
3. Verify the employee sees that duty and scope; revoke it with a reason when no
   longer needed. The next database request must deny the revoked access. Processing
   stays off; login and existing HR requests continue as before.

### Release and recovery

Production backup verified in the authenticated HRIS dashboard: physical backup
dated 2026-09-05 16:54:58 UTC, listed with Restore available. No restore was run.
Migration `20260905235605_payroll_access_phase1` was applied successfully. All nine
initial scopes are off, bootstrap is unset, and no user grants were seeded.
Existing login/bootstrap function definitions and unrelated RLS policy hashes
match their pre-change values. All four new tables have RLS; anonymous access and
direct authenticated table writes are denied.

Validation: production build and existing dashboard-auth, RBAC-repair and
direct-manager time-approval smoke checks passed. Type checking still reports
existing errors in unrelated HRIS files; none is in the new payroll module.
Read-only production checks under authenticated Admin and non-Admin identities
passed: neither receives payroll duties automatically; only the Admin is eligible
for initial setup. RLS hides scopes from the unassigned non-Admin and processing
checks deny calculation for both. Grant/revoke mutation checks remain for actual
authorized assignments; no live test grants were created.

Apply only `20260905235605_payroll_access_phase1.sql`; never run a blanket migration
push against the drifted historical ledger. Apply the database addition before the
dependent frontend. Push the exact reviewed source to `main` and verify Vercel READY.

Pre-change application: main `63800f3`, deployment `dpl_3evjoLauZKbk5D9bN9j8VWat22pE`.
Recovery: keep payroll processing off, restore the last compatible frontend if
necessary, preserve access/audit records, and repair with a forward migration.
A Git revert does not undo database changes. Do not restore the entire database for
a routine payroll UI issue.

## Phase 2 — Pay packages and salary history (2026-09-06)

### Scope and compensation authority

Existing HRIS profile updates and the approved PAN workflow remain the sole writers
of base pay and the existing de minimis/reimbursable fields. Phase 2 records reviewed,
dated snapshots of those sources; it owns only additional components and separately
documented professional-fee engagements. Approval never updates HRIS salary fields.
Later source changes or conflicting positive basic/rate fields flag the applicable
snapshot for reconciliation before payroll use. No scheduler or second salary editor
was installed. Existing leave policies and balances remain authoritative; the 5 VL/5 SL
accrual/regularization interpretation and source linkage belong to Phase 3 readiness.

An initial migration proposal was rejected by automatic approval review because it
changed shared salary/PAN security functions and introduced scheduled writes. None
of that proposal was applied. The accepted design is isolated to the new module,
preserving all existing salary/PAN writers, triggers and RLS policies.

Production source review found 150 employees, 109 nonzero rate amounts and no nonzero
legacy basic amounts. The import preview uses the recorded rate when present; zero
legacy basic is not interpreted as zero pay. Missing units/dates require source
review. No current completed salary PAN meets the approved workflow-v2 import gate;
that path has not been verified against a real completed salary PAN. No salary data
was bulk imported or guessed. Earlier staging concepts for effective dates, precision,
immutable history and policy references were reused without importing its schema,
role-based permissions or fixtures.

### Delivered behavior

- Payroll → **Pay Packages**, `/payroll/pay-packages`, and the employee Compensation
  card link show authorized history. Employees can see their own approved history.
- Scoped Prepare PR plus existing compensation-edit permission prepares drafts;
  scoped Authorize HR plus existing compensation-edit permission approves them.
  Access management alone grants no salary access. Own-salary editing/approval is
  prohibited. Group access cannot claim arbitrary employees from its parent BU.
- Current HRIS or completed approved salary PAN preview, source fingerprints,
  explicit effective dates, reviewer attribution and stale-preview rejection.
  Employee base and existing allowances must match the chosen source on approval.
- Immutable approved versions, linked same-date corrections, separate engagement
  streams and derived end dates prevent overlapping approved base pay. The date
  lookup flags missing coverage; historical approval does not create payments.
- Only entered recurring/one-time components are stored, with explicit tax,
  contribution, 13th-month and proration classifications. Unreviewed remains
  unreviewed; names never imply tax exemption. Amounts retain six-decimal precision.
- Finance verification references the existing bank master and supporting document.
  Only the account suffix is returned here; a bank change invalidates verification.
  Existing bank permissions and scoped Finance authorization remain required.
- Dated calendar versions record the two supplied cutoffs and an approved policy
  reference. Pay-month values are a preview until explicitly recorded; weekend/
  holiday handling defaults to unconfirmed. No calculation rules were activated.
- Professional fees require a distinct engagement and reviewed tax/document
  reference. No vendor purchasing or payment process is replaced.

Kay's explicitly authorized active Admin account completed the one-time setup and
holds the single permanent organization `manage_access` grant. No permanent preparer,
reviewer or Finance duty was assigned by Phase 2. All nine scopes remain `off`.

### Focused production verification

`tests/payrollPhase2Rollback.sql` runs authenticated RPC assertions in a transaction
that rolls back. Passed: unauthorized and cross-BU denial, direct-table-write denial,
source preview and approval enforcement, conflicting salary fields, six-decimal
component precision and unreviewed treatment, immutable history, future boundaries,
duplicate-date prevention, linked corrections, stale previews, bank permission and
masking, bank-change invalidation, and processing-off enforcement. No test grants,
packages, audit rows, verifications or employee changes remained after rollback.

Salary-field and existing RLS-policy hashes matched their pre-change values after
all tests. The four new tables use RLS with all direct client access revoked;
authenticated access is through six guarded RPCs with fixed empty search paths.
Advisor notices for RPC-only tables without policies and intentional authenticated
SECURITY DEFINER RPCs were reviewed. No anonymous RPC access is granted.

The production build and existing dashboard-auth, RBAC-repair and direct-manager
time-approval smoke checks pass. Full TypeScript checking still reports pre-existing
errors outside this phase; it is not a clean project-wide typecheck. Signed-in HRIS
browser role journeys have not been claimed as tested.

### User check and release

1. As the access manager, assign the actual preparer and HR authorizer their intended
   BU duties in Payroll Access. Their existing HRIS compensation permissions must
   already permit the work; do not change HRIS roles to grant Payroll Access.
2. In Pay Packages, review one simple salary and one allowance package against the
   approved source, select the real effective date, and have the authorizer approve.
3. Review a source-supported mid-cutoff change and use the date lookup on both sides
   of its effective date. Earlier approved history remains visible; processing stays
   off. Use a documented separate engagement only if one actually exists.

Production physical backup 2026-09-05 16:54:58 UTC was reverified before migration.
Applied migrations: `20260906004943_payroll_pay_packages_phase2.sql` and
`20260906005513_payroll_pay_source_conflict_guard.sql`. Apply only these specific
forward migrations, never a blanket historical migration push. GitHub requires a
PR to update main; merging that PR deploys directly to existing production. No test
environment is used for acceptance.

Recovery: keep processing off, restore the preceding compatible frontend if needed
(Phase 1 main `3290c37`, Vercel `dpl_DAt6XxsWiQYZbmLBUUtjvM75WZa8`), retain the new
history and audit records, and apply a narrow forward fix. A frontend rollback does
not undo the database migration. Do not restore the whole database for a UI issue.

## Phase 3 — Attendance readiness (2026-09-06)

### Delivered scope

- Payroll → Timekeeping & Attendance → **Attendance Readiness** at
  `/payroll/attendance-readiness`. The team checklist is readable with an active
  HRIS login while staff payroll assignments are pending. Access management alone
  does not grant employee attendance or salary work.
- Reuses `shift_assignments`, BU/shared `shift_templates`, `time_events`, approved
  leave, WFH and OT records, existing holiday records and leave policies. No source
  writer, shared role, authentication function or unrelated RLS policy was changed.
- Scoped Finalize and submit timekeeping plus existing Timekeeping/employee scope
  access saves and submits a BU's bounded date range. Finance and authorized payroll
  reviewers can read the saved/submitted version. All employees in that period's BU
  coverage must be within the viewer's existing HRIS scope; no partial silent export.
- The server retains input snapshots and deterministic interpreted results. Missing
  shifts are missing schedules, never absences. Missing/duplicate punches, ambiguous
  adjacent shifts, incomplete approvals and unresolved rules block submission.
- Asia/Manila overnight day boundaries are retained for later premium calculation.
  Split segments retain the unpaid gap without subtracting it twice. Unsupported
  short/flexible/partial-leave patterns stay blocked rather than being guessed.
- Five-minute grace is excluded (09:06 → one late minute); actual worked minutes are
  preserved. Requested, approved and actual OT remain distinct. A 75-minute approved
  and worked interval stays 75; unmatched or below-one-hour cases need review.
- One unpaid movable hour is checked against break logs. Worked lunch requires a
  recorded prescribed meal window and the existing direct-manager approval for
  that hour. No request is rerouted to a different approver by this module.
- Dated HR-authorized rule references identify explicit rest-day presets, prescribed
  meals, reviewed holiday coverage and unresolved leave/offset policy references.
  Missing BU/local holiday classifications can be recorded as linked versions;
  a local version takes precedence over the existing global date for that BU.
- Offset work must be verified as eligible rest-day/holiday work. New append-only
  review records require HR Manager → existing GeneralManager role → two distinct
  BOD users, with no self-approval or repeated approver. These are time/offset
  authorities and grant no salary access. Changed source data requires a new review.
- Approval records verified offset minutes; it does not post a second leave balance.
  The existing conversion must be reconciled to an approved policy before payroll
  readiness. Offset-leave consumption remains blocked until its balance/source can
  be reconciled. No undocumented hours-to-days or premium conversion is activated.
- Saved timekeeping versions are immutable; a source change creates a linked next
  version and marks earlier inputs out of date. Submission is idempotent. Missing
  inputs, an incomplete period or an overlapping submitted date range prevent
  submission. Later payroll phases must bind to and recheck the submitted version;
  no PR engine or downstream PR approval record exists in Phase 3 to invalidate yet.

### Actual source gaps and deliberate limits

At inspection there were 209 assignments, 19 shared presets, zero clock punches,
79 leave requests, 248 OT requests, one holiday and one leave policy. Existing roster
“Published” is a local screen state; it is not a saved payroll timekeeping approval.
Managers should enter actual shifts/rest days through the existing roster, then HR
uses Attendance Readiness to review and submit a version.

Many employment start/end dates also need review. Unknown inactive employment
coverage is flagged rather than silently excluded from the BU. The current leave
policy says accrual `none` and does not establish the confirmed probation accrual,
locked availability and prorated regularization unlock. Paid leave remains blocked
where that source is unsupported. This phase does not silently alter balances,
install accrual jobs, decide year basis/rounding, or rebuild the leave balance system.
Keep approved policy interpretations and balance reconciliation as team prerequisites.

The existing HR Manager, General Manager and two BOD accounts are present. The GM
role's stored ID is `GeneralManager`, while its display name has a space; the new
offset check explicitly reuses that existing ID. No HRIS role was added or changed.

### Verification and recovery

- `tests/payrollPhase3Interpretation.sql`: pure SQL fixtures, no employee rows;
  normal day, grace, exact OT, mismatch blocking, missing/duplicate punches,
  overnight holiday boundaries, split shifts, worked lunch and leave readiness.
- `tests/payrollPhase3AccessRollback.sql`: authenticated access-manager restriction,
  cross-BU denial, missing-source blocking, retry, denied submission, table denial,
  stale previews, linked revisions, immutability and revocation.
- `tests/payrollPhase3OffsetRollback.sql`: existing HR, GM and two BOD identities;
  skipped-stage and duplicate-BOD denial, completed approval and immutable actions.
- `tests/payrollPhase3SubmissionRollback.sql`: successful save and HR submission,
  repeated submission once, immutable results and source-change invalidation.
  Temporary schedules/employment-date fixtures and grants are fully rolled back.
- Production build and existing dashboard-auth/RBAC/direct-manager smoke checks
  pass. Full TypeScript checking still has the same unrelated baseline errors;
  no new payroll-module error remains. Signed-in browser staff journeys are not
  claimed as tested. All six Phase 3 tables are RPC-only with RLS and no direct
  client privileges; intentional SECURITY DEFINER advisor notices were reviewed.

No test data remains. Payroll access still has only the user's authorized initial
manager grant; all nine scopes are off. Existing salary, shift and leave row hashes,
and existing RLS-policy hashes matched after rollback. Live OT records can change
independently during delivery; no migration or test writes OT source rows.

The 2026-09-05 16:54:58 UTC physical backup was reverified before migration.
Applied only these additive Phase 3 migrations:

- `20260906021209_payroll_attendance_readiness_phase3.sql`
- `20260906021940_payroll_attendance_readiness_guards.sql`
- `20260906022456_payroll_offset_existing_gm_role.sql`
- `20260906022912_payroll_time_shared_shift_presets.sql`

The first migration attempt rolled back on a SQL variable-name conflict before any
schema was committed; the successful ledger versions above are authoritative.
Forward fixes remain confined to the new Phase 3 functions. Do not blanket-push the
drifted historical migration directory. Main is delivered through GitHub's required
PR and existing production deployment, with no test environment used for acceptance.

Recovery: keep processing off, restore the compatible Phase 2 frontend (`78f370a`,
Vercel `dpl_9qkZnoW8ubBNXnyRwCdKsseVA6zU`) if needed, retain saved history and use a
small forward database fix. A frontend rollback does not undo these migrations.

## Team checklist by phase

The same checklist is available in Attendance Readiness and linked from Payroll Access.

| Phase | Your team's next task |
| --- | --- |
| 1 — Access | Name each HR/Finance/BOD handler and their BU coverage; assign the actual payroll duties. Ordinary pay recipients need no staff grant. |
| 2 — Pay packages | Review salary, allowances, actual effective dates, any separate fees, bank details and payday calendar against approved records. |
| 3 — Attendance | Managers enter actual shifts/rest days; supply punches; finish leave/WFH/OT approvals; HR reviews holidays, lunch, employment dates and unresolved leave/offset sources, then submits timekeeping to Finance. |
| 4 — Gross pay | Confirm divisor applicability, proration and rounding; provide checked normal, mid-cutoff and holiday/night/OT examples. |
| 5 — Take-home pay | Review statutory/tax details, YTD/opening balances and loans/deductions; provide a checked full payroll and a contribution month's two cutoffs. |
| 6 — Special pay | Provide real correction, 13th-month and final-pay examples with prior payments, leave conversion and accountabilities. |
| 7 — Approvals | Confirm actual workflow assignees and payslip release timing; verify the HR → Finance → two-BOD sequence on one PR version. |
| 8 — Payment/reporting | Provide the current bank specification and reporting process; agree how paid, failed and reissued payments are recorded. |
| 9 — Activation | Choose the pilot BU/handover cutoff and accept two reconciled cutoff comparisons before live payroll. |

Missing schedules and the pending assignee list do not block deployment of Phase 3.
They do block the affected staff review/submission until the real inputs are present.

## Remaining phases (not implemented here)

4. Server-side gross pay and versioned calculation explanations.
5. Take-home pay, current statutory rules and loan/deduction balances.
6. Linked corrections, 13th-month and final pay.
7. Ordered approvals and private released payslips.
8. Payment/reporting outputs and recorded payment outcomes.
9. Reconciled activation for the approved employee groups.

Stop after the current phase; do not rebuild working HRIS features.
