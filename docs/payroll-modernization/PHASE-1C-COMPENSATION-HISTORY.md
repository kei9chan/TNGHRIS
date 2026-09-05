# Phase 1C — Compensation Components and Effective-Dated History

**Date:** 2026-09-05

**Branch:** `payroll-staging`

**Production impact:** None

**Status:** Applied and verified in staging; no salary or component rows seeded

## Scope

This work package adds the compensation source-of-truth structure needed before payroll calculation:

- Versioned, configurable pay-component catalog
- Effective-dated employee compensation history
- Retroactive-change activation controls

It does not copy the mutable legacy salary fields from `hris_users`, and it does not import the supplied payroll workbooks. The new tables are empty because staging has no approved employee/source crosswalk.

## Tables and relationships

| Table | Purpose | Seeded |
|---|---|---:|
| `payroll_pay_components` | Versioned definitions for earnings, employee deductions, employer costs, and informational lines | 0 |
| `payroll_compensation_history` | Exact employee/component amounts linked to an effective-dated worker assignment | 0 |

The compensation record stores an exact `numeric(20,6)` amount, unit, currency, effective range, version, source, reason, request, and approval metadata. It references both the employee and the employee’s worker assignment, so a compensation row cannot be attached to another employee’s assignment.

## Pay-component configuration captured

The catalog supports configuration for:

- Earning, employee-deduction, employer-cost, and informational type
- Employee-payroll versus separate professional-fee stream
- Fixed amount, unit rate, percentage, or later formula-defined method
- Amount, days, hours, percentage, rate, or other unit
- Tax treatment
- 13th-month treatment
- Statutory-base code set
- Employee/employer payer scope
- Recurring, one-time, or transactional behavior
- Policy-defined proration
- Deduction priority
- Insufficient-net-pay handling
- GL expense/liability and cost-center codes
- Legal-entity/payroll-group scope
- Effective dates, version, source, and approval evidence

No statutory rate, tax table, divisor, premium multiplier, or rounding rule was hardcoded.

## Controls added

- Both tables have RLS enabled.
- Authenticated reads are limited to the existing payroll configuration access helper for HR/Admin, Board, and Finance.
- Authenticated insert, update, and delete privileges are denied; service-side workflows are the only write path until the approved UI/RPC workflow exists.
- Pay-component and compensation rows begin in `draft` and require source evidence and approval metadata before approval/activation.
- Requester and approver cannot be the same user when both are recorded.
- Pay-component versions cannot overlap within the same code and legal-entity/payroll-group scope.
- Payroll-group-scoped components must fit within that payroll-group version’s effective range.
- Compensation dates must fit within both the worker-assignment version and pay-component version.
- One employee cannot have overlapping active/draft/approved history for the same component.
- Approved and historical compensation values are immutable; corrections append a new version.
- Pay-component semantic fields become immutable once referenced by compensation history; a changed meaning requires a new component version.
- Contractor/professional-fee components cannot enter employee compensation history.
- A retroactive compensation row must explicitly identify `required`, `linked`, or `waived` retro-pay handling. It cannot become `active` while still requiring an unrecorded retro-pay action.
- The worker-assignment table now has a composite employee identity key so the compensation foreign key cannot mix an employee with another employee’s assignment.
- Foreign-key indexes cover the new compensation workflow.

## Migrations applied

- `20260905063739_phase1_payroll_compensation_foundation.sql`
- `20260905064058_phase1_payroll_compensation_fk_indexes.sql`
- `20260905064313_phase1_payroll_component_scope_guard.sql`

All three migrations were applied to staging project `suxncpnerzfkjhkhjwbd` only. No production migration was applied.

## Verification

Staging transaction tests passed for:

- Worker-assignment → pay-component → compensation-history relationship
- Exact decimal amount preservation
- Effective-date containment within the worker assignment and payroll-group-scoped component
- Overlapping compensation rejection
- Approved compensation immutability
- Approved compensation delete protection
- Referenced pay-component semantic immutability
- Contractor/professional-fee stream rejection
- Retroactive activation rejection without linked/waived retro-pay evidence
- RLS enabled with one controlled read policy on each new table
- Authenticated table privileges: `SELECT` only; no `INSERT`, `UPDATE`, or `DELETE`; anonymous `SELECT` denied
- Final row counts: zero in both new tables after rollback
- Security advisor: no security lints associated with the new tables or functions
- Performance advisor: no missing-FK-index lints associated with the new tables; unused-index notices are expected while the tables are empty
- Production build passed

The project-wide advisors still report unrelated pre-existing lints on legacy tables and functions. Those were not changed by this package.

## Not included

This package does not seed salaries, create a retro-pay transaction ledger, calculate payroll, determine salary divisors, calculate statutory deductions or taxes, define rounding rules, generate payslips, or alter closed payroll. The `retro_pay_reference` and waiver fields are guardrails for the later retro-pay transaction workflow, not a substitute for that workflow.

## Next gate

HR and Finance must approve the pay-component vocabulary, tax/contribution/13th-month classifications, GL mappings, and employee compensation crosswalk before any rows are loaded. The next implementation package can move to shift presets and effective-dated roster structure, still on staging.
