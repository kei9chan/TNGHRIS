# TNG Payroll — Lean Implementation

## Delivery decision

The user approved direct implementation on `main` and deployment to the existing
production HRIS, one phase at a time. A separate test environment or staging branch
is not required. This supersedes the test-environment prerequisites in the older
payroll-modernization documents. Use focused checks, a current successful backup,
bounded additive migrations, compatible application releases and forward fixes.
Do not create fake employees, sample payroll, payments or live test grants.

New processing is disabled until the corresponding phase is complete and activated.
Phase 4 replaces the Phase 1 off-only constraint with an off/shadow constraint.
All scopes remain off after deployment. An explicit scoped access manager can
enable shadow for the organization master gate and a selected BU, with an audit
reason. The existing operation gate still denies calculations if a parent is off.
Live mode is prohibited in the database; access administration works while off.

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

## Phase 4 — Gross pay and maintained checklist (2026-09-06)

Delivery: `/payroll/gross-pay`, linked as **Gross Pay Review**, plus the reusable
checklist in that page and Attendance Readiness. Implementation status is separate
from team completion. Access managers record BU-specific Waiting / In progress /
Done confirmations with a reference and date; prior confirmations are immutable.
Changing checklist status never grants permission or clears calculation blockers.

**Maintain this checklist at every subsequent phase:** update both this document
and the software status in `PhaseChecklist.tsx`. Mark software implemented only
after its checks and deployment. Record team tasks done only from actual completion
evidence; otherwise keep Waiting / In progress. Reopen a team task when its inputs
change. Team records in `payroll_phase_progress` are authoritative confirmations,
not automatic proof that every future cutoff is ready.

| Phase | Software | Team status at this release |
| --- | --- | --- |
| 1 — Access | Implemented | Waiting for assignee list / scoped duties |
| 2 — Pay packages | Implemented | Waiting for reviewed salary versions and calendar |
| 3 — Attendance | Implemented | Waiting for dated schedules, punches, approvals and HR submission |
| 4 — Gross pay | Implemented; staff walkthrough pending real inputs | Waiting for approved methods/rates and checked comparisons |
| 5 — Take-home pay | Implemented; staff walkthrough pending real inputs | Waiting for Finance-reviewed batch workbook, opening balances, contribution allocation and checked comparisons |
| 6 — Special pay / corrections | Implemented; staff walkthrough pending real inputs | Waiting for three reviewed examples, earlier settlements and independent Finance comparisons |
| 7 — Approvals / private payslips | Implemented; staff walkthrough pending real inputs | Waiting for eligible assignees and one complete shadow approval walkthrough |
| 8 — Payments / reports | Implemented; external formats use assigned existing processes | Waiting for Finance owners, approved bank specification, report comparisons and real outcome acceptance |
| 9 — Compare / activate | Implemented; operational acceptance pending | Waiting for assigned reviewers, two accepted real cutoff comparisons, pilot handover authorization and first live reconciliation |

The server prepares a BU batch only from the latest current HR-submitted complete
cutoff. It uses existing dated employee pay packages and existing calendar records;
all employees must be within the caller's existing salary and attendance scope.
It stores immutable snapshots, `gross-v1`, numeric gross, source hash, prior version,
and explanations showing source, quantity, rate, factor, exact intermediate amount
and rounding. Per-scope serialization plus unique source/version keys make retries
idempotent. Opening a saved PR rechecks current source/pay/rule versions and scope.
Changed inputs require a linked recalculation; no approval or payment is produced.

Actual work is partitioned at punches, breaks, schedule/OT boundaries, midnight
and the approved night window. Scheduled intervals are not assumed to be worked.
Monthly calendar or earned-minute proration, daily/hourly base, reviewed recurring
allowances and one-time gross additions reuse Phase 2. Flat component treatment
fields are respected. Monetary arithmetic stays Postgres numeric and the client
displays decimal strings without calculating money.

**No policy values were activated.** HR must record source-backed divisor/hours,
monthly and allowance proration, line/employee rounding, night boundaries and an
explicit premium matrix for the BU/dates. Night columns are additional base-hourly
multipliers, not a second implicit stacking percentage. Rates follow the shift
date; grace is base-only; approved offsets are excluded from cash. Those choices
require explicit confirmation in the form. Unsupported alternatives remain blocked.
Unworked holiday eligibility, unreviewed/non-proratable recurring components,
unreconciled leave/offset patterns and separate professional-fee calculations are
not silently assigned zero or imported into employee gross. Signed adjustments,
tax/deductions, payment, approval and released payslips remain in later phases.

Applied migrations: `20260906033117_payroll_gross_phase4` and
`20260906033550_payroll_gross_component_treatment`. Four new RPC-only tables have
RLS and no direct client grants; all eight public RPCs explicitly authorize their
caller and have an empty search path. New advisor notices for intentional guarded
SECURITY DEFINER RPCs / no raw-table policies were reviewed. Existing RLS and salary
hashes remain unchanged; there are no new saved payroll runs, policies, grants or
team completion claims. All nine scopes remain off.

Checks passed: fixture-only normal monthly salary, mid-cutoff version change,
recurring/one-time amounts, overnight holiday/night boundaries, 75-minute OT,
deterministic replay and missing/mismatched inputs. Read-only authenticated checks
verified management visibility without salary rights, denied preparation/read,
off-mode gates, and raw/anonymous access denial. Build and the three existing
auth/RBAC/direct-manager smoke checks passed. TypeScript still reports the 15
previous unrelated errors; none are in the new payroll module.

Automatic approval review rejected a broader rollback test because it temporarily
changed real salary/employment records, schedules and grants. It did not execute;
the retained test uses read-only checks. Therefore a successful staff preparation,
saved-run retry and persisted-source revision walkthrough remain unverified until
the actual approved inputs and staff duties exist. Do not claim that gate completed.

Simple team check when ready:
1. Assign intended duties, review dated pay/calendar/rules and have HR submit one
   complete cutoff. Enable shadow only for the chosen BU and master scope.
2. Finance prepares the gross PR and compares normal, mid-cutoff and holiday/night/OT
   explanations with independently checked examples. Repeating preparation should
   open the same version, without another payroll record.
3. After an authorized source correction, reopening the prior PR must show changed
   inputs; submit the corrected attendance if needed and prepare a linked version.
   Record the completed comparison reference in the checklist.

Recovery: switch affected scopes off, retain immutable versions and use a forward
fix. Frontend rollback target is Phase 3 main `2f7f9a0`, production deployment
`dpl_G6m7bJmhxPYjCFeFMDPNZHoE8pjr`; frontend rollback does not undo migrations.

## Remaining phases (not implemented here)

8. Payment/reporting outputs and recorded payment outcomes.
9. Reconciled activation for the approved employee groups.

Stop after the current phase; do not rebuild working HRIS features.

## Phase 5 — Take-home pay and reviewed opening balances (2026-09-06)

Delivery: **Take-home Pay Review**, `/payroll/net-pay`, using the immutable current
Phase 4 gross version. The database is applied and the frontend is included in this
release to main. Verify the production deployment reaches READY before reporting
this release live. The shared checklist marks software Phases 1–5 implemented.
Team status remains Waiting until an authorized manager records actual evidence.
No team task was marked done by this release. Existing salary/PAN writers, login,
roles, permissions, unrelated RLS and on-call routing are unchanged by Phase 5.

Finance downloads one review workbook for the entire gross version. It includes
employee monthly contribution bases/coverage, each gross line's tax allocation,
YTD and prior-employer openings, imported first-cutoff contributions where needed,
and authorized additional deductions. Import previews the file and saves nothing.
Formula cells, foreign gross versions, missing/duplicate lines and unknown employees
are rejected. Optional loan opening/reconciliation rows are recorded separately
with per-row success/failure, prior balance history, installment and authorization.

Scoped Authorize Finance plus existing salary-edit and attendance access records
the review; scoped Prepare PR plus existing salary/attendance access prepares net
pay only when BU and parent shadow gates permit it. Management alone grants no
salary access. Own pay is left pending another Finance reviewer, or retains an
unchanged approval from a different reviewer; changing the own row or shared review
policy removes that carried approval. Own-loan opening changes remain prohibited.

The server uses PostgreSQL numeric for SSS/MPF/EC, PhilHealth, mandatory Pag-IBIG,
BIR semi-monthly and cumulative-average withholding, employer shares, authorized
deductions and capped loan projections. See [source review and exact limits](STATUTORY_RULES.md).
Monthly contributions reconcile separately for EE and ER across the first/second
cutoffs. A recorded first cutoff must be linked; imported first-cutoff balances
need explicit review when no saved first cutoff exists. Competing contribution
month/cutoff mappings, over-deductions and stale prior sources block preparation.

Net versions preserve gross/review/prior-run references, source fingerprints,
explanations, creator and reason. Identical retries return the same saved run;
changed inputs create a linked version. Opening a run checks gross, statutory
HRIS fields, latest Finance review, loan openings and prior-cutoff lineage again.
Loan balances are never reduced by a shadow run. No payslip release, payment,
filing, consultant-fee calculation or later-phase annual settlement was installed.
Three new tables are immutable and RPC-only, with RLS and no raw client grants.

Applied only `20260906043821_payroll_net_phase5` and
`20260906044348_payroll_net_review_guards`. The first attempt at the former rolled
back on a SQL expression syntax error; the successful ledger versions above are
authoritative. All nine scopes remain off; production contains zero Phase 5 reviews,
loan balances and net runs at release. No real salary, attendance, loan, role or
access fixture was introduced for testing.

Validation: complete arithmetic reconciliation; two-cutoff employee/employer totals;
SSS/PH/HDMF floors, boundaries and ceilings; official BIR bracket anchors and
supplementary-pay handling; midyear YTD; documented exemption allocation; final loan
installment smaller than regular installment; approved deferral/blocking; deterministic
replay; independent Finance review attribution; read-only management/own-loan/raw-table/
anonymous denials; batch workbook round-trip and invalid-import rejection. Production
build and existing dashboard-auth/RBAC/direct-manager checks passed. Full TypeScript
checking retains the 15 unrelated baseline errors, with no new payroll-module error.

Security advisor notices for intentional guarded SECURITY DEFINER RPCs and
RPC-only tables without raw policies were reviewed against [RPC execution guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
and [RLS-without-policy guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
Successful authenticated staff save/prepare/retry/source-change journeys are still
pending actual approved duties and inputs. Pure fixtures and access-denial tests
do not establish that operational acceptance gate.

### Team's simple Phase 5 check

1. Finish actual duties, pay/attendance/rule reviews and one submitted complete
   cutoff. Confirm the monthly contribution split and insufficient-net policy.
2. Finance completes/imports the batch workbook from independently checked records,
   records actual loan openings if applicable, and reviews all employee rows with
   a second reviewer for anyone's own pay. Prepare shadow net pay for the pilot BU.
3. Compare gross − employee deductions = net; employer costs stay separate. Link
   the second cutoff and verify each agency's monthly EE/ER total and a smaller final
   loan installment. Actual loan balances must remain unchanged. Record the checked
   comparison reference in the team's checklist; do not mark this gate done early.

Recovery: turn affected shadow scopes off, preserve review/history records and use a
forward fix. The prior compatible frontend is Phase 4 main `5049b90`, production
deployment `dpl_3sRDbDBvx1dXi5ooSD116rzYXeAu`. A Git revert does not undo the database.

### On-call routing fix — approved and applied

After explicit user approval to publish and apply, migration
`20260906050452_manpower_manager_direct_bod_gm` was applied to production.
Same-BU requests start at BOD/GM for an active BU Manager, or an active Manager
whose recorded supervisor is an active GM/BOD. The supervisor lookup uses the
existing text reporting-line field with the referenced HRIS UUID, safely ignoring
nonmatching values. Shared HRIS roles, RLS and the existing one-BOD-or-GM on-call
completion rule are preserved. This is separate from payroll's two-BOD requirement.

Both matching undecided pending requests were moved to BOD_GM. Immediately after
repair each had three pending eligible pool assignments, zero pending BU-manager
assignments, zero self-assignments and no configuration issue. The migration kept
both Pending and recorded no approval. Subsequent read-only verification showed
both completed by an existing BOD account through the live approval workflow;
their other pool assignments were cancelled as expected. Normal submissions retain BU-manager review. The approval RPC rejects
requester self-approval and rechecks the assigned approver's current stage role.
Shared roles and user-role assignment hashes are unchanged. All nine payroll
processing scopes remain off.

### Publication authorization

Earlier automatic review blocks were resolved by the user's explicit instruction:
“Yes approved publish and apply.” This authorizes the prepared Phase 5 and on-call
changes for the existing public `kei9chan/TNGHRIS` main and production database.
Publish through the repository's required PR and verify the resulting production
commit/deployment; no additional sign-in or permission request is needed.


## Phase 6 — Corrections, 13th-month and final pay (2026-09-06)

Prepared frontend: **Special Pay & Corrections**, `/payroll/special-pay`; existing
`/payroll/final-pay` opens the same reviewed workspace. The old unreachable final-pay
prototype is not reused for its assumed 261 divisor, months-times-current-salary
formula or unsaved approval button. Existing employee offboarding, end dates,
checklists and document workflows remain authoritative. No new HRIS roles or salary,
leave, document, loan-balance or offboarding writer was introduced.

Each employee case retains immutable versions and line explanations. Corrected
entitlement/liability minus actual settled amounts produces the remaining earning
or deduction. Original net runs can be linked, including stale originals being
corrected; their stored result and hash are preserved. External legacy payroll uses
explicit source and actual-settlement references. A prior shadow run never counts
as payment. Revisions require the latest expected case version; identical retries
return that version. Source item keys cannot be reused in a different case.

13th-month pay uses reviewed actual basic earnings by calendar period / 12, less
actual earlier payments. Eligibility, completeness, more favorable policy benefits
and the annual benefit-exemption usage require reviewed records. Mixed monthly and
cutoff totals, duplicate periods and prior payments exceeding entitlement block.
A second final/13th case cannot reserve another unpaid 13th-month balance while the
other case still reserves one. Reconcile the actual prior settlement first.

Final pay matches the employee's canonical HRIS end date. Approved leave conversion,
reviewed lawful accountabilities, already-settled amounts and offboarding references
are required, including explicitly confirmed none. Existing supporting documents
may be linked. No automatic clearance hold, leave conversion divisor or deduction
policy was added. Changes to salary history, employee/end-date information, linked
documents, checklists or recorded loan balances flag saved versions for review.

Annualized withholding uses actual current-year taxable earnings plus previous
employer taxable earnings, less both employers' prior withholding net of earlier
refunds. It applies to final pay or December year-end cases under the reviewed 2026
rule set. Negative tax is retained as a refund. Ordinary corrections/supplements
can retain a source-backed Finance calculation instead of inventing a tax treatment.
Taxable contribution adjustments are limited to the signed employee mandatory
contribution lines. Employer costs remain separate. Negative remaining net is saved
for explanation but cannot receive the independent Finance check.

Preparation requires scoped Prepare PR, existing salary/employee access, an active
HRIS account, another preparer for one's own pay, and BU/parent shadow gates. A
separate scoped Finance authorizer with existing salary-edit rights checks the
exact current version; neither its preparer nor its payee may do that check. This
is an input/calculation review, not the Phase 7 ordered payroll approval sequence.
No payroll approval, loan posting, payslip release, tax filing or payment is created.

Applied migration: `20260906055056_payroll_special_phase6`. The migration filename was aligned to the successful production ledger version.
The CLI created empty draft files before its trailing network check failed; those
empty drafts were removed after confirming the one applied migration.
The last successful physical backup verified earlier in this release session was
2026-09-05 16:54:58 UTC. A fresh dashboard revisit returned 404, so it does not
constitute a second backup verification.

Checks: isolated temporary-function arithmetic with rollback, then the installed
pure calculator: correction delta, deterministic replay, 13th less actual prior
payments, separated-employee annualization including previous employer, tax refund,
annual bracket anchors, duplicate sources, overpayment, final-tax-method and NaN
rejection. Read-only authenticated checks confirm management does not grant salary
access or special-pay preparation/review, raw-table access is denied, RLS is on and
anonymous/private calculator execution is denied. Existing auth/RBAC/direct-manager
smoke checks pass. Production build passes. TypeScript retains the 15 unrelated
baseline errors and no new payroll error. No real fixture rows or grants were made.

Security notices for the two RPC-only tables and four guarded authenticated
SECURITY DEFINER endpoints were reviewed against the same
[RLS guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
and [RPC guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
as earlier phases. Public wrappers validate the current actor, scope and existing
sensitive permissions; private helpers and raw tables are not client-accessible.

### Team's simple Phase 6 check — still pending

1. Finish actual scoped duties and prerequisite salary/attendance/Finance reviews.
   Supply a real past salary correction, complete actual basic-pay history and
   earlier 13th payments, and a separated-employee case with its HRIS end date.
2. HR/Finance reconcile leave balance/rate/conversion authority, lawful deductions,
   prior payments/refunds and current/previous-employer tax records. Confirm each
   supported tax treatment; retain unsupported cases in the documented existing
   process. No policy values are inferred from a job title or HRIS role.
3. For each of the three cases, enable only the selected shadow scope, prepare,
   compare against independently checked records and have another Finance reviewer
   check that exact version. Verify remaining amounts exclude actual settlements,
   a retry creates no duplicate, and a source change requires a new linked version.
   Earlier results, loan balances and released payslips must stay unchanged.
4. Record the comparison references in the team checklist. Team tasks remain Waiting
   until actual completion evidence is recorded. Successful staff save/retry/review,
   concurrent case preparation and real-source revision walkthroughs are unverified
   while real duty assignments and inputs remain absent.

The release checklist includes Phases 1–6. All nine processing scopes remain off.
No Phase 6 production case or Finance review was seeded. Phase 7 will add the ordered
HR → Finance → two-BOD approval and private payslip sequence; Phases 8–9 cover
payment/reporting and reconciled activation. Do not treat these shadow reservations
as a settled-payment ledger. Actual cross-system settlement/loan posting and final
approval gates must be enforced in those phases before live payment is available.

Release: merge only the reviewed Phase 6 source to main; confirm production READY
before calling it live. Recovery: keep affected scopes off, retain immutable history
and use a forward fix. Prior compatible main is `fb8ce31` (Phase 5); a frontend revert
does not undo the database addition. No whole-database restore for a UI issue.


### Phase 6 publication — explicitly approved

The user explicitly approved publishing Phase 6 to public `kei9chan/TNGHRIS` on
`main` and deploying it. This resolves the earlier automatic-review publication
block. The database migration is already applied and must not be reapplied.

This release includes the special-pay page/client, exact applied migration, focused
SQL checks, navigation/routes, maintained checklist and payroll implementation/statutory
references. Build, arithmetic and access checks passed. Real staff preparation/review
remains pending actual duty assignments and records. No team completion or live
processing is enabled by publication. Verify the production deployment reaches READY
before reporting this release live.


## Phase 7 — Ordered approvals and private payslips (2026-09-06)

Delivery: **Payroll Approvals**, `/payroll/approvals`, linked from saved Take-home
Pay / Special Pay versions. A dashboard notice identifies actionable payroll
approvals using current scope/roles. **My Payslips**, `/payroll/payslips`, is available
from the dashboard and payroll navigation without assigning staff payroll duties.
The employee endpoint returns only that account's released payslips.

Regular submission requires current net pay and the existing complete timekeeping
version submitted by HR. Special-pay submission requires the current independent
Finance check. Finance submits the exact saved version with a reference and an
employee correction contact. The fixed approval sequence is HR validation, HR
endorsement, HR Manager authorization, independent Finance authorization, BOD A,
BOD B. Both the scoped payroll duty and the actual existing HR/Finance/BOD role are
required; another department's grant cannot substitute for the stage. BOD A and B
must be different employee identities. Stage rows and source versions are immutable.

Preparers, submitters and material PR editors (gross/net creators and net-input
reviewers) cannot approve that version. Special-pay payees cannot approve their own
case. Ordinary batch payees retain Phase 5's independent own-row review; this does
not make a batch preparer eligible to approve the batch. Finance must provide an
eligible authorizer independent of preparation and material inputs. This may require
another existing Finance user; the implementation never grants or changes roles.

Return for revision ends that workflow. A changed source needs a new payroll version
and a fresh sequence. Opening or acting on a run rechecks its sources and current
access; changed timekeeping/other sources invalidate its actionable approval state,
including previously recorded BOD decisions. Historical actions remain visible.
An advisory transaction lock serializes actions, the submitted expected step rejects
stale requests, and database uniqueness prevents repeated stages and the same BOD
occupying both final approval positions. Only the second final approval yields
Approved / Locked; shadow mode is always labeled and cannot become a paid version.

### Payment boundary and private release

The full-payment receipt function requires a live workflow, the existing live
release gate, a current fully approved version, independent scoped Finance release,
a source-supported actual date on/after the reviewed payday, and the exact approved
net amount. There is no automatic bank transfer. One logical regular-pay entitlement
can have only one confirmed receipt; retries must match the identical receipt.

In that same transaction, authorized loan debits are recorded once per actual
receipt/employee/account against the immutable opening snapshot. Existing loan
reconciliation locks are reused and current actual debits must match the approved
projected starting balance. Opening records are never rewritten. A mismatch blocks
release. Private payslips are created only after that confirmed receipt and include
earnings, employee deductions, net and a correction contact. No public storage URL
or employee-wide payslip listing is exposed. Historical released payslips remain
immutable after subsequent source changes.

All nine scopes remain off and the existing off/shadow constraint still prohibits
live activation. Shadow approvals can neither record payment nor post loans nor
release employee payslips. Partial/failed/returned/reissued payments, explicit
accounting reversals and special-pay cross-case settlement require Phase 8;
special-pay disbursement is explicitly blocked here. Phase 9 must create/reconcile
actual live versions, not promote prior shadow approvals into payment authority.
No later-phase bank files, reports, payment outcomes or activation were implemented.

### Payroll identity dependency correction

Read-only production inspection found all 150 linked accounts have different Auth
IDs and HRIS employee IDs. Seven Phase 5/6 callers incorrectly used the Auth ID for
employee audit foreign keys or own-pay comparisons. This prevented intended saves
and weakened own-pay checks. This migration changes only those new payroll callers
to use `current_hris_user_id()` where an employee ID is required. It preserves
`payroll_actor_id()` for active-login/access authorization, all shared roles, RLS,
login/bootstrap functions and earlier auth-ID-based time/gross audit writers.
There were zero Phase 5/6 run records to repair. No employee identity was rewritten.

### Validation and team checklist

Applied migration: `20260906062342_payroll_approval_phase7`. An initial attempt
rolled back on a quoting error; only the successful ledger version is authoritative.
The local CLI-created filename was aligned to that version. The previously verified
physical backup in this release session is 2026-09-05 16:54:58 UTC; no restore ran.

Build and existing dashboard-auth/RBAC/direct-manager checks passed. TypeScript has
the same 15 unrelated baseline errors and no new payroll/dashboard errors. Tests
use the installed pure stage guard and temporary copies of approval constraints:
ordered steps, out-of-order BOD attempt, stale repeated click, denied actor/state,
final-stage closure, same-BOD uniqueness and duplicate-stage uniqueness. Temporary
rows roll back and reference no real employee or grant. Read-only tests check the
actual distinct Auth/employee mapping, management-only denial, unknown/foreign
payslip denial, payment denial, RLS, and anonymous/private execution restrictions.

The five new tables are RPC-only, with RLS and no raw client grants. Security notices
for intentional guarded SECURITY DEFINER endpoints and RLS-without-raw-policies were
reviewed using [RPC execution guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
and [RLS guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
Pre/post hashes of existing roles, user roles, RLS policies and salary/end-date
records match. There are zero new workflow, payment, loan-posting or payslip records.

The actual multi-user staff flow, simultaneous BOD sessions, positive disbursement
retry/loan posting, two employees reading real private releases and revision of real
submitted inputs are NOT claimed verified. They need real approved duty assignments,
source records and the corresponding activation/payment prerequisites. Constraint
and access tests do not replace this operational acceptance gate.

Your team's Phase 7 tasks:
1. Confirm and assign the real HR reviewer/endorser, HR Manager, independent Finance
   authorizer and two distinct BODs, preserving their existing HRIS roles. Resolve
   any preparer/material-editor conflict before submitting the PR.
2. Use one complete real cutoff in shadow. Submit from the saved net version; each
   assignee opens Payroll Approvals (actionable items also appear on the dashboard).
   Follow the six steps; verify BOD A leaves 1/2 and BOD B completes 2/2. Payment
   must remain blocked in shadow. Try an out-of-order action and repeated BOD click.
3. Return another version, make the authorized source correction, rebuild it and
   verify approvals start again. Test concurrent BOD actions with the real accounts.
4. Record comparison references and actual task completion in the maintained
   checklist. Keep the payment/private-release acceptance tasks pending Phase 8/9
   prerequisites. Do not create fake employees, live test grants or fake receipts.

Release the reviewed source through main's required PR; verify production READY
before calling it live. Prior compatible frontend: Phase 6 main `5322566`.
Recovery keeps scopes off and immutable history intact and uses a forward fix;
a frontend rollback does not undo the database additions or identity correction.


### Phase 7 release-duty read access — approved and applied

User explicitly approved both Phase 7 public publication/deployment and the scoped
Finance release-read extension on 2026-09-06, after automatic approval review had
blocked these actions. Applied migration: `20260906063928_payroll_release_scope_read`.
The earlier reviewed proposal is retained under `docs/payroll/proposals/` for history;
the matching file under `supabase/migrations/` is the authoritative applied version.

An explicitly scoped **Release and disburse** grantee can read the corresponding
payroll/source freshness information only with an active existing **Finance Staff**
role, existing HRIS salary-view and Timekeeping-view permissions, and existing
employee/BU scope access. This changes no HRIS roles, existing sensitive permission
assignments, payroll duty assignments or processing modes. It includes intentional
organization-level grants, subject to those same restrictions.

Post-application inspection verified both guarded function definitions, zero active
release grants, zero approval runs and zero payments. Actual operational acceptance
remains pending the team's assignees and real inputs. All scopes remain off.

### Phase 7 publication

The user approved publishing the prepared Phase 7 source, applied migrations, tests
and documentation to public `kei9chan/TNGHRIS` on `main` and deploying production.
The software checklist marks Phases 1–7 implemented; team readiness remains separate
and requires actual completion evidence. The release uses main's required PR and
the existing Vercel production integration. Verify the merged commit is READY before
reporting the deployment complete. Phase 8/9 work and live activation are deferred.


## Phase 8 — Payments and reporting outputs (2026-09-06)

The user explicitly authorized implementation, public publication to main and
production deployment. No further confirmation is required by the project workflow.

### Delivered scope

Payroll → Payments & Reports (`/payroll/payments`) reuses the Phase 7 approval
version, existing bank verification, full-payment receipt, original loan postings
and private payslips. The Government Reports entry opens this guarded workspace;
legacy time reports and unrelated modules remain unchanged.

- One open payment batch reserves each regular-pay entitlement across versions.
  An unused batch can close only with no pending or ever-confirmed transfers and
  no receipt. Correcting a payroll needs a fresh approved version; closing never
  erases history or removes paid obligations.
- Employee attempts record exact decimal amounts, schedule dates, unique scope-wide
  transfer references, current bank-verification references and optional reissue
  links. Pending attempts reserve funds. New attempts cannot exceed approved net
  minus confirmed and pending amounts. A repeated reference returns the identical
  attempt; using it for different instructions is rejected.
- Actual outcomes are append-only: pending → confirmed / failed / cancelled;
  confirmed → returned. Expected event IDs prevent stale actions, request UUIDs
  protect retries and unique constraints prohibit duplicate outcomes. Return means
  the entire individual attempt returned. Individual partial payments use separate
  amounts/attempts; an uncertain or partial return requires the existing Finance
  reconciliation process before declaring a full return. No automatic transfer,
  bank callback, future assumed receipt or negative payment is generated.
- A reissue links the same employee/batch failed, cancelled or returned attempt.
  Both its parent amount and the current unreserved unpaid balance cap the reissue.
  Payroll locks serialize attempts/outcomes so two requests cannot reserve the same
  money. Future actual concurrent bank journeys still require operational acceptance.
- First full-batch reconciliation invokes the original Phase 7 settlement logic.
  Every employee must equal approved net with no pending attempts. Actual confirmation
  dates determine the receipt date. Initial partial batches do not release payslips
  or post loans, preserving the Phase 7 release trigger. All live writes remain
  gated by existing Finance release authority, independent preparation, six approval
  steps, the reviewed payday and current live mode. Processing stays off.
- Returns retain original receipt and payslip amounts, append explicit reversal
  entries to the employee's original loan postings and show outstanding payment
  status in approval history and the employee's private payslip. Full reissue
  reconciliation restores each reversal once, using the existing account lock and
  actual balance check. New opening-ledger revisions or insufficient balances block
  restoration for Finance reconciliation. Neither old openings nor paid results
  are overwritten. Accounting reversals do not claim a statutory refund/remittance.
- Finance exports include register, gross/deductions/net/employer totals, earnings,
  payment balances/attempts, withholding and tax-treatment sources, imported/YTD
  snapshots, SSS/MPF/EC/PhilHealth/Pag-IBIG employee/employer shares, contribution-month
  allocation and recorded filing owners. Every generated artifact stores the exact
  immutable payload, source/version fingerprint and generation attribution. Download
  requests are recorded separately; this does not prove the browser saved a file.
- Authorized schedules require complete live approvals and current verified bank
  details under existing bank-view permission. Only bank name/account suffix appears;
  full account and statutory identifiers remain in their existing protected records.
  Changes to bank verification, payment balances, attempts or approval freshness
  block re-downloading an obsolete authorized schedule. Workpaper snapshots remain
  review history with their generation-time status, never proof of payment.

### Official-output boundary and assigned existing processes

No actual approved bank specification/sample was supplied. No bank-specific upload
format is invented. All workbook sheets explicitly identify internal/shadow review
or an authorized schedule for the existing verified payment process, not a validated
bank/agency file. The database separately records the current real Finance owner and
approved procedure reference for bank payments, BIR 1601-C, 1604-C/alphalist, 2316,
SSS, PhilHealth, Pag-IBIG and special-pay settlements. An active scoped Finance
**authorizer** records these references; this assigns process responsibility without
changing HRIS roles, payroll duties or system permissions. Missing references remain
Waiting on Finance and must be resolved before Phase 9 acceptance.

Regular-pay snapshots provide tax and contribution source workpapers, not complete
employer returns or annual certificates. Annual/YTD snapshots must not be added
across cutoffs; reconcile imported balances, previous employers, special cases and
all periods in the assigned existing filing process. No filing deadlines or new
statutory rates were invented. References checked for this boundary:
[BIR forms](https://www.bir.gov.ph/bir-forms),
[BIR alphalist downloads/validation](https://www.bir.gov.ph/Downloadables),
[SSS employer forms](https://www.sss.gov.ph/download-forms-and-electronic-applications/),
[PhilHealth payment/reporting procedures](https://www.philhealth.gov.ph/partners/employers/pay_procedures.php).
The guarded function/RLS pattern follows
[Supabase function security guidance](https://supabase.com/docs/guides/database/functions).

Phase 6 special-pay source workpapers are exportable after submission, but new-engine
special-pay settlement remains blocked: its manually reviewed source keys/settled
amounts are not yet a validated cross-case entitlement ledger. Use the explicitly
assigned existing special-pay process and retain its settlement references. Do not
claim that changing a case key authorizes another payment. This is the plan's explicit
existing-process fallback for unsupported special cases, not silent finalization.

### Team checklist and acceptance

1. Complete actual payroll duty assignments, schedules, reviewed pay/tax/loan inputs
   and the Phase 7 shadow approval walkthrough.
2. Finance authorizer records the named owner and current procedure for all eight
   output/process entries for the pilot BU; obtain the actual bank file specification
   only if a bank upload generator is desired.
3. Compare the register and Finance totals to source payroll. Reconcile both monthly
   contribution cutoffs and annual/imported tax data to the existing filing process.
   Confirm that every sheet is clearly a workpaper and download changes no payment.
4. Once Phase 9 prerequisites permit actual live use, reconcile real pending, failed,
   returned and linked reissue outcomes. Verify retries cannot duplicate payment,
   loan reversals/restoration remain once-only, and other employees cannot read the
   payslip. Do not create fake receipts, active employees or live test grants.
5. Record actual completion evidence in the maintained BU checklist. Software delivery
   is distinct from these team tasks; no unconfirmed team row is marked Done.

Applied migration: `20260906071358_payroll_payments_reports_phase8`. SQL and PL/pgSQL
parser checks passed before application. The production build, exact-decimal/literal
workbook round trip and existing dashboard-auth/RBAC/direct-manager checks passed.
Project-wide TypeScript still has the same 15 unrelated baseline errors and no new
Phase 8 errors. Database checks passed for partial/pending/full/zero-net totals,
overpayment denial, valid outcome order, repeated/out-of-order outcome denial and
request/outcome uniqueness using temporary rollback-only constraint copies. Actual
read-only authenticated checks passed for management-only denial, protected exports,
RLS, private-helper and anonymous restrictions and processing off.

Existing roles, user-role assignments and RLS-policy hashes match before/after.
All nine scopes remain off. There are zero new payment batches, attempts or receipts.
No real employees, role grants, bank data or fake payroll/payment evidence were
created. The full positive Finance/bank journey, actual concurrent retries,
return/restoration with real loan openings, and live cross-account payslip checks
remain operational acceptance tasks. These are not claimed passed by the unit or
access checks. The software status is ready for the authorized main release; verify
its exact Vercel production commit is READY before reporting deployment complete.

The
previously verified production backup in this release session is 2026-09-05
16:54:58 UTC. Recovery uses a compatible frontend plus additive forward fixes;
never delete payment evidence or restore the entire HRIS for a routine UI issue.


Security advisors were reviewed after application. The eight new RPC-only tables
have RLS and no raw client grants; the ten authenticated SECURITY DEFINER endpoints
intentionally enforce active identity, payroll scope and existing HRIS permissions.
No anonymous endpoint or private helper grant was added. The expected notices are
[RLS with no raw policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
and [intentional guarded RPC execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Phase 9 — Whole-cutoff comparison and controlled pilot (2026-09-06)

Software implemented in **Payroll → Compare & Pilot**. Team readiness remains
**Waiting on team**. Deployment does not activate payroll, assign duties, approve
comparisons or create payment evidence. The prior repeated authorization to publish
to `main` applies; the rollout continues through the repository's required merge
mechanism and existing production deployment.

### What the software does

- Downloads one workbook for the entire saved regular shadow cutoff. It contains
  exact-decimal gross, deduction, net, tax and employer totals plus every earnings,
  statutory-share, loan and other-deduction line. Finance supplies actual legacy
  amounts, the complete legacy employee roster and register/coverage references.
  Missing, additional or duplicate employees/rows, blank amounts, changed source
  columns, formulas and excessive precision are rejected. A component mapping or
  aggregation against the legacy register must be documented in coverage evidence;
  the app cannot discover an omitted legacy component from a missing source file.
- Imports locally for review, then records an immutable comparison revision.
  Every nonzero difference requires an explanation and approved policy/source
  reference. The newest comparison must still match current source inputs, cover
  a completed real cutoff and have all six shadow approval steps before acceptance.
  Assigned HR Manager and Finance authorizer accept independently; the comparison
  preparer cannot accept, and one person cannot supply both acceptances.
- Finance proposes one BU's first live cutoff after two consecutive accepted
  comparisons spanning a contribution month. The second must link the first net
  version. Handover evidence names sole payroll ownership/legacy stop, tax/YTD,
  employee/employer contributions, loans, in-flight legacy payments and supported
  versus existing-process cases. All eight output processes need an active Finance
  owner. Two distinct BODs approve the exact evidence; changed evidence needs a
  fresh proposal. A scoped access manager then deliberately activates that BU.
- Live mode requires an immutable pilot certificate. An organization or payroll
  group cannot be made live. The parent gate must already permit processing; all
  other BUs retain their own settings. The first live cutoff is the only live
  regular cutoff allowed until monitoring is accepted. A reviewed calculation may
  be reused when still current, but live submission creates a separate approval
  workflow: no shadow approval is copied into it. Existing HR/Finance/two-BOD
  ordering, material-editor exclusions, settlement uniqueness, bank verification,
  payment outcome rules and private employee payslips remain enforced.
- After actual full-batch payment, independent HR and Finance review the first live
  cutoff. Pending/unpaid/returned amounts or unrestored loan postings block this
  review. Reviews bind to payment evidence; changed evidence requires a fresh
  review revision. The scoped access manager may then continue subsequent cutoffs
  and allow the next BU's pilot, one BU at a time. Stop/resume controls retain the
  original handover and audit history. A transaction lock coordinates processing
  stops with approval/payment writes. Stopping HRIS does not cancel instructions
  already sent through an external bank process.

### Team checklist and current status

| Owner | Required action | Status at deployment |
|---|---|---|
| Kay / HR / Finance | Supply and assign actual scoped payroll duties, including separate reviewers and two BODs | Waiting; only organization access management assigned |
| BU managers / HR | Enter real schedules/rest days and punches; complete leave, WFH, OT and timekeeping approvals | Team confirmation/source completion pending |
| HR / Finance | Confirm approved pay, policy inputs, statutory/YTD and loan evidence for the selected real cutoffs | Team review pending |
| Finance | Produce two consecutive real shadow cutoffs and fill one comparison workbook per cutoff | Waiting; no saved payroll runs yet |
| HR Manager / independent Finance | Review every difference, its policy evidence and complete legacy roster/components; accept both comparisons | Waiting for comparisons and six-step shadow approvals |
| Finance | Name all eight output-process owners and their existing procedures | Waiting for assignments and references |
| Finance / Kay / two BODs | Agree the first live BU/cutoff, legacy ownership stop, reconciled openings and in-flight payments; approve and activate | Blocked until evidence is complete; all nine scopes off |
| HR / Finance / Kay | Reconcile first actual live payment, loans and payslips; record two independent reviews before continuation/next BU | Not yet applicable |

Use retained authentic source records or complete upcoming actual cutoffs. Do not
invent historical schedules, attendance, approvals or receipts to pass readiness.
Before the first live calculation, Finance must reconcile imported openings and
any prior-run chain to the actual handover; shadow projections alone are not proof
of settlement. Legacy engine ownership is a documented team action: this app
cannot disable an external payroll product. Special-pay settlement remains with
its named existing process until cross-case reconciliation is separately validated.
The payment/agency workpapers are not validated upload or filing formats.

### Verification and release evidence

Applied only `20260906074753_payroll_comparison_pilot_phase9.sql` through the bounded
migration endpoint. The application build and exact-decimal workbook round trip
passed, including formula, source-fingerprint, missing-value and roster rejection.
The installed PostgreSQL checks passed for exact differences, unresolved blockers,
invalid/missing/duplicate inputs, cutoff boundaries, uncertified live denial,
separate shadow/live workflow uniqueness and distinct HR/Finance acceptance.
Constraint checks used disposable temporary tables rolled back in the same
transaction, with no real payroll fixtures.

Read-only checks under the existing management-only identity passed: salary
comparisons remain hidden, unauthorized proposal/activation/monitoring fail, raw
table access and private helper execution are denied, anonymous access is denied,
and all nine scopes remain off with no comparison or activation records. Existing
role, user-role and RLS-policy hashes match before/after. Existing dashboard auth,
RBAC and direct-manager approval smoke checks passed. Full-project TypeScript has
the same 15 unrelated baseline errors, with no new Phase 9 errors.

Security advisors were reviewed: seven new RPC-only tables intentionally have RLS
without raw client policies; nine authenticated definer RPCs enforce active
identity, scoped duties and existing HRIS permissions. No anonymous or private
helper access was added. Actual positive multi-account acceptance, the first live
payroll/payment/reissue journey and production stop/concurrency behavior still need
the named team's real operational evidence. These are not claimed verified by
static, pure-function or denied-access tests. Verify the exact merged commit's
production deployment is READY before reporting the release complete.


## Scheduling payroll-readiness fixes — 2026-09-06

The existing Payroll → Timekeeping roster remains authoritative. Presets, employee/day
grid, copy-week, publish control and Grid/Role/Area/Timeline views remain in place.
No replacement scheduler, HRIS role, payroll grant or operational schedule was seeded.

| Item | Software status | Team action / status |
|---|---|---|
| Five-minute company grace and unpaid 60-minute lunch | Implemented; all clock lateness consumers use five minutes | Confirm actual lunch punches / existing worked-lunch approvals |
| Work / Rest Day / Leave-No Schedule / Missing Schedule | Implemented; a blank cell is never a rest day or assumed absence | BU managers must enter actual day types; awaiting source completion |
| Overnight and flexible presets | Explicit next-day validation and required paid hours implemented | Review saved times (some existing names disagree with stored times), confirm overnight end and flex paid hours; pending |
| Effective-dated published versions | Immutable employee/week versions with audit reference; repeat publication is idempotent | Publish actual reviewed weeks; old local-only Published badges are not publication evidence |
| HR freeze and approved override | Finalization references immutable schedule versions; subsequent publication waits for an independent scoped HR Manager | Assign actual payroll duties and complete a real authorized override review when required; pending |
| Missing/unpublished payroll exclusion | Enforced in database source review and downstream current-source checks | Resolve blockers before HR finalization |

Applied bounded migration `20260906112648_payroll_schedule_versions.sql`. All existing
assignment rows and original preset fields match their pre-change hashes; all
existing RLS policies, HRIS roles and role assignments match their baseline hashes.
Old stored grace values are retained as historical source data; current consumers,
new preset writes and published payroll snapshots enforce the five-minute company
rule. Existing presets are not relabeled or inferred from job titles. Working preset
validation requires the unpaid lunch and explicit overnight/flexible metadata.

`tests/payrollScheduleReadiness.sql` passed against the installed interpreter in a
read-only transaction: normal 8 paid hours, 09:06 → 1 late minute, overnight next-day
split, flexible hours and missing-hours denial, rest day, explicit non-working day,
leave valuation, missing/unpublished denial and retained exact 75-minute OT.
`tests/payrollScheduleFreezeRollback.sql` passed: existing schedule permissions,
stale-preview rejection, publication idempotency, unpublished-change rejection,
submission freeze trigger, frozen-source stability after draft changes, pending
override isolation, publisher/unassigned reviewer denial, approved-source invalidation
and immutable history. All transaction fixtures rolled back. Positive approval by
an actually assigned HR Manager remains a team acceptance check; no test grants were
created. Approved overrides require HR to save/finalize a linked timekeeping version
before changed inputs can feed Finance; prior results remain immutable.

Production build passes. Type checking retains the same 15 unrelated baseline errors;
none occurs in these modified files. Security review confirms the three new tables
are RLS-protected and have no direct authenticated/anonymous access; only the three
guarded RPCs are exposed. The advisor's expected [RPC-only table notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
and [guarded definer-function notice](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
are intentional, matching the existing payroll pattern. Processing modes and actual
team completion evidence remain unchanged. Recover with a compatible frontend and
bounded forward fixes; preserve published/frozen audit history.


## Employee attendance dashboard — 2026-09-06

Implemented friendly mission/shift/progress/actions/day cards above the existing
dashboard features and Quick Links. Existing navigation, scheduler and payroll rules
are retained. Responsive cards stack below desktop width; clock targets are at least
56px high. Shift times and state come from the authenticated server clock using
Asia/Manila and the existing published schedule. Unpublished days cannot start a
clock session. Open overnight sessions retain their original work date.

The additive attendance ledger serializes each employee's actions and checks the
observed revision and request identifier. The server chooses employee identity and
timestamps. Ten-second foreground refresh, focus/online refresh and immediate local
refresh keep devices consistent. Existing time_events receive a server-owned mirror;
raw client inserts/updates/deletes are blocked by an additive trigger with all existing
RLS policies unchanged. Legacy raw batch imports and invented auto-close timestamps
are rejected; verified corrections use the additive HR review workflow.

HR/Admin can add, revise, expire and audit scoped, dated clocking exceptions through
Dashboard → Manage clocking exceptions & attendance review. Default clocking is
required. No employee, email or role automatically grants exemption. Original punches
and prior correction/exception versions remain immutable. Schedule-based attendance
is labeled for HR payroll review; it does not synthesize punches or skip approval.

| Item | Software | Team status / next action |
|---|---|---|
| Dashboard and secure clock states | Implemented | Employees use their existing accounts on their devices |
| Published shift source | Reused | BU managers must complete and publish actual schedules; pending actual evidence |
| Clocking exceptions | Implemented | HR/Admin supplies the approved dated exception list; none seeded |
| Attendance corrections and payroll review | Implemented | HR reviews real missing/incorrect punches and exempt attendance |
| Payroll duties and live activation | Existing controls retained | Actual assignee list and Phase 9 acceptance remain team-owned prerequisites |

Applied migration `20260906125934_employee_attendance_dashboard.sql`. Essential
rollback checks cover normal clock/break/end/finish, repeated request IDs, stale
second-device actions and matching second-device reads, duplicate breaks, completed
day lock, exemption visibility and payroll input, versioned expiry/audit, missing
published schedule, and unauthorized attendance/exception/direct writes. No fixture
attendance, exception or role assignment remains after verification. Rendered-component
checks cover action visibility for all states and exclusion of policy-heavy employee
copy. Production build passes; TypeScript retains the 15 unrelated baseline errors.
Browser visual verification of desktop/mobile remains incomplete: the cloud browser
blocked local file previews and the production session is at sign-in. This is not
claimed as a completed authenticated device/browser test.

Security advisor notices for the four RPC-only tables ([RLS without raw policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)) and six guarded endpoints ([authenticated definer functions](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)) were reviewed. Direct table access is denied; active identity and scoped HR authority are checked in the endpoints.


## Attendance channels and schedule publishing — 2026-09-06

The requested account now has all eight organization-scoped payroll duties through
an audited, account-specific operation. Existing HRIS roles, access policies,
independent approvals and payroll processing activation remain unchanged.

The existing roster now explains publication requirements and offers **Publish
employee week** inside Schedule versions. This publishes a complete selected
employee week without requiring unrelated employees to have complete drafts.
A reason is still required; finalized versions still require approved overrides.

| Delivery | Software status | Team status / next action |
| --- | --- | --- |
| Web/mobile clock | Implemented; shared server record and duplicate protection retained | Publish actual employee schedules; test on actual devices |
| GPS clock | Implemented; server checks enabled site, radius and reported accuracy | Enter actual coordinates/radius in existing Admin Sites; enable GPS in Attendance device setup; verify at the location |
| QR kiosk | Implemented; dedicated signed-out paired display, rotating 60-second codes and replay protection | Register a QR device, enable QR and open the eight-hour pairing link on the kiosk; verify with a signed-in employee phone |
| Biometric export upload | Implemented; CSV/TSV/text DAT/XLSX parsing, explicit columns, punch meanings and employee-code mapping; preview then atomic commit | Supply actual machine brand/model and export; configure mappings and validate real records with HR |
| Direct machine synchronization | Pending device-specific information; not claimed live | Confirm vendor API/export capabilities and network setup |

GPS uses device-reported location; it is not proof against location spoofing. QR
attendance requires the employee's own authenticated account and an enabled kiosk
in their business unit. Pairing does not expose an HR session. Physical device and
phone-camera tests remain pending; no GPS sites, production kiosk devices or
biometric mappings were invented or enabled. Defaults retain web clocking.

Imports retain normalized source rows, hashes, importer/time audit and actual
device timestamps. They reject unknown/stale mappings, missing/unpublished
schedules, invalid action order and conflicts with existing/HR-corrected days.
Repeated batches are idempotent and repeated device events are skipped. No break
or clock-out time is invented. HR corrections continue through the existing
versioned review workflow. Payroll rules and scheduling data are preserved.

Applied additive migrations: `20260906134501_attendance_verified_channels.sql`,
`20260906134649_attendance_kiosk_pairing.sql`, and
`20260906135611_attendance_channel_guard_fix.sql` and
`20260906140403_attendance_gps_required_fields.sql`. New tables are RPC-only with
RLS enabled; existing RLS policies are unchanged.

Verification: native production database checks in a rollback transaction passed
GPS boundary rejection, authenticated own-account lifecycle, disabled web bypass,
invalid/replayed QR rejection, anonymous token-only kiosk display, unauthorized
configuration/pairing rejection, mapped biometric imports, batch retries, duplicate
files and unknown code rejection. Parser tests cover delimited exports, leading
zero codes, explicit date order, AM/PM, invalid dates/times and unmapped actions.
No fixture attendance, sites, devices, configuration or mappings remain. Production
build passes. Repository-wide type checking retains 15 unrelated baseline errors.

Security advisor review: expected RPC-only RLS/no-policy information and intentional
SECURITY DEFINER execute warnings. The only new anonymous RPC serves an expiring
opaque kiosk display capability; it neither reads employee attendance nor submits
a punch. See [Supabase linter guidance](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).


## BU-specific schedule presets — 2026-09-06

Resolved the inconsistent lists: the preset card filtered by BU while the assignment
drawer included all unscoped presets. All 19 existing presets were unscoped. They
are now removed from new choices, while their existing assignments and publications
remain intact. New presets require a BU; assignment choices follow the selected
employee's BU even from All BUs. Empty lists ask the manager to prepare presets.
Auto-assignment no longer falls back to an unrelated first template. Copy-week
validates old shared references before deleting any current-week rows.

Additive migration `20260906204156_scoped_schedule_presets.sql` fixes the actual
Business Unit Manager role-name mismatch and supports assignment/publication for
all employees in that manager's own BU. Managers can create presets for their own
BU or a BU containing a direct report; edit/delete access added only for their own
presets. New assignment/preset guards prevent unscoped or mismatched BU reuse.
Existing policies and broad HR/Admin rights are retained; no employee roles,
reporting relationships or saved schedules were changed. Existing legacy department
permissions remain; a stricter department-head delegation model is a policy decision.

Recommendation: BU managers own BU rosters; shared-service department heads use
direct reports across BUs, with explicit delegation for exceptions. Working at a BU
is not a reason to grant access to its entire team. No new weekly shifts were
invented or automatically published.

Focused native rollback checks: BU-manager preset creation/editing and assignment,
unrelated-BU preset rejection and retired shared-preset rejection. Cross-BU
direct-report assignment remains blocked when existing directory RLS hides that
employee. Automatic review rejected the proposed roster endpoint; it was not
applied. A narrowly scoped scheduling-only roster requires a separate access
decision. Build passes; repository typecheck
retains its 15 unrelated baseline errors. Team checklist updated; actual BU presets
and weekly rosters remain the managers' pending work.


## Approved direct-report scheduling access — 2026-09-06

The user approved a narrower scheduling-only cross-BU roster. Implemented
`get_schedule_roster_people` for active Manager users, returning only self and
employees whose reports_to equals the manager employee ID. The new endpoint
returns scheduling labels only; no salary, email, bank, auth or personal HR fields.
It does not grant directory access or change employee roles/reporting lines.
Timekeeping combines this roster with existing permitted data, keeps the manager
grid limited to self/direct reports and includes their BUs in the selector.
Presets continue to belong to the employee's BU.

Migration `20260906205246_direct_report_schedule_roster.sql` also repairs the
new team assignment policy's BU check: an authorized matching-BU check no longer
fails merely because the employee directory hides a cross-BU direct report.
Other existing policies remain unchanged.

Passed focused rollback checks: cross-BU report appears; unrelated employees
and non-scheduling fields excluded; cross-BU preset and assignment save/read
succeed; employee and anonymous access denied. No fixtures retained. Build passes.
The earlier blocked broad endpoint was not applied; this narrower approved
implementation replaces that pending work. Team task: confirm each department
head's Manager designation and accurate Direct Reporting To links.
