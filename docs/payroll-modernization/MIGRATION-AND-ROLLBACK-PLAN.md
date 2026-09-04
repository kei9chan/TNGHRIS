# Migration, Rollback, and Implementation Plan

## 1. Purpose and boundary

This is a Phase 0 plan. It defines how the existing TNG HRIS can be enhanced without rebuilding it or losing history. No DDL, backfill, feature flag, or production change has been executed.

The plan uses expand–migrate–verify–cut over–contract. Existing employee, attendance, leave, approval, recruitment, disciplinary, document, and payroll-adjacent functions remain available while new payroll capabilities are introduced behind default-off flags.

## 2. Non-negotiable migration invariants

1. Never update a historical value merely to make it fit a new schema.
2. Never delete or detach a source record referenced by a payroll input, line, result, report, payment, or adjustment.
3. Never run a destructive “down” migration against data that may have become authoritative.
4. Never use a frontend loop as a migration, backfill, or payroll batch processor.
5. Never treat current `hris_users` compensation/classification as historical truth without an evidence-backed effective range.
6. Never activate a rule without source, approval, test, and impact-review records.
7. Never recompute a locked or posted payroll in place.
8. Use exact Postgres `numeric(p,s)` types for money/rates and explicit rounding semantics.
9. Store instants as `timestamptz`; derive payroll local dates explicitly in the approved business timezone, normally `Asia/Manila`.
10. All critical commands are idempotent and correlated to actor, request, run, and source checksum.

## 3. Preconditions

The following are hard gates before the first payroll migration:

- approved [policy register](./POLICY-REGISTER.md) entries for the first pilot population;
- Finance-approved baseline package described in [BASELINE-RECONCILIATION.md](./BASELINE-RECONCILIATION.md);
- production schema-only dump, migration ledger export, storage-policy export, function/trigger definitions, and generated TypeScript types under controlled retention;
- verified point-in-time recovery or backup plus a restore rehearsal in an isolated environment;
- a Supabase development branch or separate non-production project with no production personal data, or approved anonymized data;
- explicit owners and maintenance window for any production DDL;
- prototype containment: payroll generate/publish/config/final-pay, biometric import, and government filing outputs cannot be mistaken for production controls;
- test accounts for each canonical role and organizational scope;
- Security/DPO approval for copied/anonymized data and logs.

## 4. Reconcile production before payroll DDL

Production has 142 migration-history entries while Git contains 112 migration files. Normalized comparison produced 50 live-only names and 20 repo-only names. This must be resolved first.

### Reconciliation procedure

1. Announce a temporary production DDL freeze and identify every path that can mutate schema: dashboard SQL, CLI, CI/CD, integrations, and manual operators.
2. Capture a timestamped schema-only dump including extensions, schemas, types, tables, sequences, constraints, indexes, views, functions, triggers, grants, default privileges, publications, RLS policies, storage buckets/policies, and migration history.
3. Hash the capture and store it as controlled deployment evidence. Do not include table data in Git.
4. Build a migration crosswalk with: production version/name, repository file, content-equivalence result, object(s) affected, environment applicability, and disposition.
5. Classify differences as: equivalent with different name; live change missing from Git; Git migration intentionally unapplied; superseded migration; or unexplained drift.
6. Reconstruct missing historical migrations or create an explicitly approved schema-baseline migration for new environments. Never edit an already applied migration to disguise drift.
7. Generate a fresh environment from the reconciled history and compare its schema to production using normalized DDL.
8. Run all existing HRIS smoke tests and role access tests in the fresh environment.
9. Prove that a new clone can be created without dashboard-only/manual steps.
10. Lift the DDL freeze only when the migration owner and reviewer sign the crosswalk.

### Drift acceptance criteria

- zero unexplained object differences;
- zero applied migration versions with ambiguous content;
- generated database types match the live/rebuilt schema;
- grants/RLS/function execution are included in the same review as their objects;
- clean build and existing feature smoke suite pass;
- restore/rebuild runbook includes measured recovery time and named owner.

## 5. Conceptual target components

Names are intentionally conceptual until Phase 1 design review. Existing tables are extended or referenced where safe; unrelated HRIS domains are not replaced.

| Component | Responsibility | Historical control |
|---|---|---|
| Organizational versions | legal entity, BU, site, wage region, department, cost center, payroll group and timezone | Non-overlapping effective ranges; assignment history retained |
| Worker assignment versions | employment status, worker classification, pay basis and legal engagement | Independent effective-dated dimensions |
| Compensation versions | approved component amounts/rates and contract/PAN evidence | Immutable approved versions; payroll snapshots version IDs |
| Policy/rule versions | calendars, attendance, leave, earnings, deductions, statutory and reporting rules | Source, formula, rounding, tests, impact review and maker-checker approval |
| Raw time ingestion | original event plus source batch/sequence/checksum/server receipt | Append-only; correction never edits raw fact |
| Attendance interpretations | paired events, schedule/rule version, calculations, exceptions and disposition | Versioned reruns; finalized version referenced by payroll |
| Leave/offset ledger | accrual, use, expiry, conversion, reversal and adjustment | Append-only double-entry-like balance derivation; no direct balance overwrite |
| Payroll calendar/period | population, cutoffs, local timezone and state machine | Closed/posted state enforced by database |
| Payroll input snapshot | all selected source IDs/versions and input values for a run | Immutable after run calculation starts; checksum |
| Payroll run/result | batch state, employee result and exact line details | Reproducible run version; no in-place posted change |
| Payroll line provenance | component, source, formula, inputs, precision, rounding, rule version, amount | One traceable explanation per line |
| Adjustment/reversal | link to original run/employee/line and correction reason | New transaction in an open supplemental period |
| Approval/delegation | maker/checker decisions, scoped authority and MFA evidence | Self-approval prohibited by user ID and database constraint/function |
| Payment and GL | payment batch, bank checksum/status, reissue, balanced journal | Payment changes do not alter posted payroll result |
| Government report snapshot | agency template/version, legal entity, posted inputs, file hash, filing/remittance proof | Reproducible from posted data only |
| Audit evidence | trusted event, actor/session, correlation, old/new references, reason | Append-only with restricted writer and export logging |

## 6. Future implementation sequence

Each stage is a separate reviewed change set. “Complete” means migrated, tested, reconciled, security-reviewed, and recoverable—not merely deployed.

### Stage 0 — Containment and observability

- Default off or clearly block prototype payroll generation, publication, configuration save, final-pay approval, biometric import, and government filing.
- Add error telemetry that distinguishes absent relation, privilege/RLS denial, validation error, and stale schema cache.
- Establish change tickets, control owners, feature-flag owners, and incident rollback contacts.
- Add read-only data-quality dashboards/queries for missing master inputs, duplicate shifts, unresolved reporting lines, incomplete OT, and exceptions.

### Stage 1 — Reproducible platform and security baseline

- Reconcile migrations as described above.
- Canonicalize role/resource identifiers and perform a role-by-role RLS test matrix.
- Review every API-executable `SECURITY DEFINER` function, search path, grant, and internal authorization check.
- Restrict table/function default privileges and keep internal objects in a non-exposed schema where appropriate.
- Fix attachment policies around request/document ownership and explicit reviewer scope.
- Establish trusted append-only audit writing and critical-action MFA/delegation evidence.

### Stage 2 — Effective-dated master data and rule governance

- Add organization, worker-assignment, compensation, component, calendar, and policy-version models additively.
- Backfill current rows as **opening versions** only after HR/Finance supplies an “effective as of” date and source; never manufacture earlier history.
- Implement draft/review/approve/activate/supersede workflow with no self-approval.
- Store exact official attachments/URLs and test/impact evidence.
- Dual-read existing current fields and new versions; compare and report mismatches without changing production behavior.

### Stage 3 — Time, attendance, leave and OT stabilization

- Make new raw events append-only and add ingestion batch, idempotency and checksum controls.
- Preserve legacy events as imported source facts; label confidence and provenance.
- Implement server-side, set-based, versioned attendance interpretation for approved policy scenarios.
- Add exception/correction/finalization workflow; corrections create new interpretation versions.
- Replace mutable leave/offset balances with a ledger and atomic idempotent posting.
- Reconcile requested, approved, worked, and payable OT quantities.
- Run interpretations in shadow mode and compare against approved manual timekeeping.

### Stage 4 — Deterministic payroll engine

- Add period/run/input-snapshot/result/line/approval/adjustment models.
- Submit one run command, not one request per employee. A database procedure or trusted worker claims the run and performs set-based/batched computation.
- Select inputs by earning date and scope; persist version IDs and exact input values.
- Calculate with `numeric`; apply explicit precision and rounding per approved rule.
- Persist every line's source, formula identifier/expression, inputs, intermediate values, rounding and result.
- Enforce idempotency at command, run, employee and external-source levels.
- Prevent any update/delete of locked or posted facts except a controlled status transition; corrections create linked transactions.
- Add per-employee and aggregate reconciliations before approval/posting.

### Stage 5 — Reports, payments, final pay and employee self-service

- Generate payslips, bank files, GL journals and agency reports from posted immutable results.
- Version external schemas/templates and validate output before download/filing.
- Implement final pay as a controlled run type using actual earned basic salary and approved source balances.
- Give employees mobile-friendly access only to their published payslips and their own correction/dispute workflow.
- Log access/downloads of sensitive reports and files.

### Stage 6 — Parallel run and cutover

- Run at least the approved number of representative cycles across all pilot classifications and edge cases.
- Reconcile every employee and control total to the legacy/Finance baseline.
- Resolve deltas by documented cause; never force numbers to match by overwriting source facts.
- Obtain HR, Finance, Legal/Tax, Security/DPO, and Internal Audit sign-off.
- Enable a narrowly scoped pilot flag, monitor, then expand by approved cohort.
- Keep the legacy payroll source read-only for the approved retention period.

## 7. Feature-flag design

Flags are server-authoritative, effective-dated, scoped and default false. A frontend flag may hide UI but cannot grant database access or bypass a server gate.

| Flag | Initial state | Scope | Rollback effect |
|---|---|---|---|
| `payroll_rules_governance_v1` | Off | authorized policy administrators | Return to read-only register; retain created drafts |
| `attendance_interpreter_v1_shadow` | Off | pilot legal entity/payroll group | Stop new interpretations; retain evidence for analysis |
| `leave_ledger_v1_dual_read` | Off | pilot employees | Continue legacy reads; ledger entries remain immutable |
| `payroll_engine_v1_shadow` | Off | pilot payroll group/period | Stop new runs; retain unposted shadow results |
| `payroll_engine_v1_authoritative` | Off | exact approved payroll group and first period | Route next open run back to legacy before posting; posted v1 results remain authoritative |
| `payslip_v1_employee_access` | Off | employee/published run | Hide access without deleting published artifact |
| `government_reports_v1` | Off | agency/legal entity/form version | Stop generation; preserve prior filed snapshots |

Every flag change requires actor, reason, ticket, old/new value, scope, effective timestamp, expiry/next review, and independent approval for authoritative flags.

## 8. Backfill strategy

Backfills must be restartable and produce a manifest.

1. Profile source counts, nulls, duplicates, invalid references, and date ranges without mutation.
2. Define an explicit mapping and unresolved-value queue; no implicit zero/default classification.
3. Run by bounded key/date batches using a server process with checkpoints.
4. Use deterministic source keys and `ON CONFLICT` behavior that detects conflicting content rather than overwriting it.
5. Record source table/key, source hash, target key, mapping version, batch ID, inserted/skipped/rejected result, and reason.
6. Re-run the same batch and prove zero unintended change.
7. Reconcile counts and control totals; have the data owner resolve exceptions.
8. Keep legacy columns during dual-read. Contract only after the approved retention and rollback window.

For current employee compensation/classification, an opening version may use only an HR/Finance-approved “known effective at” date. Earlier payroll periods require actual historical source documents or must be marked unavailable; they cannot be inferred from today's value.

## 9. Deployment and rollback mechanics

### Safe deployment pattern

- Prefer additive nullable structures first.
- Apply DDL through versioned migrations, never ad hoc dashboard changes.
- Keep object creation, grants, RLS enablement, policies, and function execution grants in the same reviewed change set.
- Add foreign keys/checks as `NOT VALID` where needed, resolve exceptions, then validate.
- Create large indexes using a deployment-safe strategy and verify query plans; note that concurrent index creation has different transaction requirements.
- Backfill outside a long DDL transaction with explicit batch checkpoints.
- Deploy dual-compatible code before switching reads/writes.
- Reload/test the Data API schema only after catalog and permission checks pass.

### Rollback by state

| State | Preferred rollback | Prohibited response |
|---|---|---|
| Migration deployed, no data/use | Disable flag; revert code; remove only after dependency and data checks in a new migration | Editing/deleting migration history |
| Draft/config data exists | Disable writer; retain draft records; fix forward | Destructive down migration that loses review evidence |
| Shadow attendance/payroll exists | Stop job/flag; mark run failed/cancelled; retain inputs/results for analysis | Reusing or silently overwriting the run |
| Authoritative open run, not posted | Cancel exact run with reason; create a new run/version | Mutating a locked input snapshot |
| Posted run | Keep posted run; create reversal/adjustment/supplemental/reissue as applicable | Reopen, recalculate, update, or delete posted results |
| Payment released | Record return/rejection/reissue linked to same posted obligation or approved adjustment | Changing posted net pay to match a bank event |
| Government report filed | Preserve filed snapshot/proof; submit an approved correction/amendment according to agency process | Replacing the stored filed file without history |

The operational rollback target is usually code/flag routing, not schema deletion. Once history exists, fixing forward is safer and auditable.

## 10. Bulk-processing and concurrency controls

The payroll engine must support bulk processing without frontend fan-out:

- one authenticated command creates/queues a run with an idempotency key;
- a server/database worker atomically claims the run;
- eligible employees are selected set-wise from a frozen population;
- source versions are selected in bounded SQL operations and snapshotted;
- employees may be processed in deterministic chunks, but each employee result is transactionally complete;
- unique constraints prevent duplicate period/run/employee and source consumption;
- advisory locks or row locks prevent competing workers where appropriate;
- failures are explicit per run/employee/line and resumable without duplicate pay;
- query plans and RLS overhead are measured at target employee/line volume;
- totals use database numeric aggregation, not browser accumulation.

Performance acceptance targets and batch sizes remain `TBD` until TNG supplies population growth, payroll SLA, Supabase plan/connection limits, and report deadlines.

## 11. Security verification gates

Before enabling any authoritative flag:

- test anonymous, employee-own, peer employee, manager, BU manager, HR staff, HR manager, Finance maker, Finance approver, Board/oversight, auditor, IT/admin and service worker personas;
- prove legal-entity, BU, payroll-group and employee row isolation in database tests;
- prove sensitive columns and raw source records cannot be changed through direct REST calls;
- prove maker self-approval, expired delegation, replayed command and stale approval checksum are rejected;
- prove service-role secrets exist only in trusted server secret storage;
- review all new functions for `SECURITY INVOKER`/`SECURITY DEFINER` need, fixed `search_path`, explicit authorization and narrow `EXECUTE` grants;
- ensure every exposed view uses `security_invoker` or has API access revoked;
- run Supabase security/performance advisors and disposition relevant findings;
- verify audit, attachment and export/download access independently of frontend visibility.

## 12. Cutover decision record

Cutover requires a signed record containing:

- exact Git commit, migration versions, rule-package versions and feature-flag scope;
- production schema checksum and backup/restore evidence;
- baseline and parallel-run periods;
- per-employee and aggregate reconciliation results and approved tolerances;
- open exceptions with explicit accepted owner/risk, if any;
- performance and security test evidence;
- HR, Finance, Legal/Tax, DPO/Security, Internal Audit and Engineering approvals;
- cutover window, monitoring metrics, incident contacts and rollback trigger;
- first post-payroll validation and employee support plan.

Until that record exists, the new engine remains shadow-only.
