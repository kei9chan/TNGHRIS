# Phase 1A — Payroll Period Foundation

**Date:** 2026-09-05  
**Branch:** `payroll-staging`  
**Production impact:** None  
**Status:** Applied and verified in staging; no payroll rows seeded

## Scope

This work package establishes the empty source-of-truth layer needed before attendance or payroll calculations are built:

- Payroll legal entities
- Effective-dated payroll groups
- Versioned payroll calendar rules
- Payroll periods and lifecycle statuses
- Append-only payroll-period status history

Existing employee, attendance, leave, overtime, and prototype payroll tables were not changed.

## Controls added

- RLS enabled on all five new tables.
- Authenticated reads restricted to HR/Admin, Board, and Finance roles; no authenticated write policies were added yet.
- Service-side writes remain the only route until the approved payroll workflows are implemented.
- Payroll periods must begin in `draft`.
- Invalid lifecycle transitions are rejected.
- A reason is required for status changes.
- Lock, post, and paid timestamps are recorded automatically.
- Defining period inputs cannot be changed after locking/posting.
- Status history is append-only.
- Effective-dated payroll-group and calendar-rule versions cannot overlap.
- A period cannot reference a calendar rule belonging to another payroll group.
- Foreign-key indexes were added for the new foundation.

## Verification

The staging migration tests passed for:

- Complete draft-to-paid lifecycle with ten status-history entries.
- Automatic lock and paid timestamps.
- Rejection of invalid reverse transitions.
- Rejection of defining-input changes after posting.
- Rejection of overlapping effective versions.
- Rejection of cross-payroll-group calendar references.
- Rejection of non-draft initial periods.
- Rejection of status-history mutation.
- Security advisor: no new security lints for the new tables.
- Performance advisor: no new missing-foreign-key-index lint for the new tables; unused-index notices are expected while the tables are empty.
- Production build passed.

## Not included

This package does not yet calculate salary, attendance, overtime, leave, statutory deductions, taxes, payslips, bank files, or government reports. It also does not seed the supplied workbook into staging because the workbook contains personal payroll data and the staging population is not yet an approved anonymized crosswalk.

## Next gate

Before the next work package, HR/Finance must confirm the legal entity and payroll-group population, approve the calendar-rule record derived from the supplied schedule, and approve the employee/source crosswalk for the baseline reconciliation. Production remains unchanged until those approvals and the parallel-run controls are complete.
