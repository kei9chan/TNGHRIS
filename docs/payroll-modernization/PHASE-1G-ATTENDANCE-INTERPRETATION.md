# Phase 1G — Attendance Interpretation and Exception Foundation

**Date:** 2026-09-05

**Branch:** `payroll-staging`

**Production impact:** None

**Status:** Applied and verified in staging; no rule, attendance, or employee data seeded

## Scope

This work package creates the controlled data contract between preserved raw time events and later attendance/payroll processing:

- Effective-dated, approval-controlled attendance rule sets
- Configurable tardiness grace, no-show buffer, meal-break, rounding, early-clock-in, late-clock-out, and missing-punch policies
- Versioned daily attendance interpretations
- Snapshots of the schedule, rule set, and raw inputs used for reproducibility
- Links from an interpretation back to the raw events used or excluded
- A deduplicated, auditable attendance-exception workflow

The legacy `attendance_records`, `attendance_exceptions`, and `time_events` tables were not modified. The supplied payroll workbooks and employee data were not imported.

## Tables

| Table | Purpose | Seeded |
|---|---|---:|
| `payroll_attendance_rule_sets` | Effective-dated attendance policies and rule versions | 0 |
| `payroll_attendance_interpretations` | Versioned derived attendance result for an employee/work date | 0 |
| `payroll_attendance_interpretation_inputs` | Raw-event lineage for each interpretation | 0 |
| `payroll_attendance_exceptions` | Open, resolved, rejected, waived, or reopened attendance issues | 0 |

The rule-set structure can hold the company’s stated five-minute grace period and one-hour moveable lunch policy, but no value was activated or hardcoded. Those policies remain subject to the approved policy register.

## Controls added

- All four tables have RLS enabled with one controlled authenticated read policy each.
- Authenticated users receive `SELECT` only; anonymous access and direct authenticated writes are denied until an approved service-side workflow exists.
- Rule sets require effective dates, source evidence, test-scenario version, approval evidence, controlled status transitions, and maker-checker separation.
- Overlapping rule versions with the same scope are rejected using a transaction-level advisory lock.
- A rule set used by an interpretation cannot have its policy inputs rewritten; create a new effective version instead.
- Interpretations require an approved or active rule set and, when supplied, an approved or active canonical schedule and holiday calendar.
- Interpretations begin as `draft`, retain schedule/rule/input snapshots before review, and allow only controlled transitions to `needs_review`, `resolved`, `approved`, `superseded`, or `voided`.
- Non-draft interpretation inputs and derived values are immutable; corrections use a new interpretation version linked through `supersedes_interpretation_id`.
- Blocking open, acknowledged, or reopened exceptions prevent an interpretation from becoming `resolved` or `approved`.
- Raw input links require a resolved employee, a matching employee ID, and a received/non-duplicate raw event.
- Exceptions begin in `open` status, cannot be deleted, use deduplication keys to prevent duplicate queue items, and require resolution evidence for resolved/rejected/waived outcomes.
- Waiving an exception requires a separate approver; ordinary exception evidence and identity fields cannot be rewritten.
- Foreign-key lookup and delete paths have covering indexes.

The package does not yet calculate payroll money, holiday premiums, overtime, leave deductions, or statutory contributions. It also does not yet run the no-show background job or provide live ingestion endpoints.

## Migrations applied

- `20260905121712_phase1_payroll_attendance_interpretation.sql`
- `20260905122042_phase1_payroll_attendance_fk_indexes.sql`

Both migrations were applied to staging project `suxncpnerzfkjhkhjwbd` only. No production migration was applied.

## Verification

Rollback-only transaction tests passed for:

- Attendance-rule draft-to-approved transition with source and test evidence
- Raw-event linkage to an employee interpretation
- Blocking-exception prevention of interpretation resolution
- Exception deduplication by employee/date/type/key
- Exception resolution with required evidence
- Non-draft interpretation immutability
- Non-draft interpretation-input immutability
- Exception deletion rejection
- Referenced rule-set immutability
- Same-employee/date correction version creation
- Final verification row counts: zero after rollback
- Four new tables present with RLS enabled
- One controlled authenticated `SELECT` policy per table
- Authenticated table privileges limited to `SELECT`; anonymous access denied
- Security advisor: no security lints associated with the new tables or functions
- Performance advisor: no blocking unindexed-foreign-key findings for the new tables; unused-index notices are expected while the tables are empty

The project-wide advisors still report unrelated pre-existing lints on legacy tables and functions. Those were not changed by this package.

## Not included

This package does not populate policy rows, import schedules or holidays, interpret live production attendance, calculate tardiness/undertime from actual schedules, send no-show alerts, resolve identity mappings, calculate overtime or leave, or change the legacy attendance workflow.

## Next gate

HR, Finance, IT Security, and Data Protection must approve the attendance-rule values, schedule/holiday applicability, time-zone and rounding behavior, absence and missing-punch treatment, exception-resolution authority, and raw-data retention before a calculation job or live adapter is enabled. The next implementation package can add the set-based attendance calculation engine and timezone-aware no-show processing on top of this versioned contract.
