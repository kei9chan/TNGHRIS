# Phase 1D — Shift Presets and Canonical Employee Roster

**Date:** 2026-09-05

**Branch:** `payroll-staging`

**Production impact:** None

**Status:** Applied and verified in staging; no roster data seeded

## Scope

This work package adds the schedule source of truth needed before attendance interpretation:

- Versioned shift-preset catalog
- Normalized shift segments for regular, overnight, split, and broken schedules
- Effective-dated recurring weekly roster rules
- Date-specific employee schedule mapping
- Auditable schedule overrides for manual changes, change-of-shift requests, swaps, and imports

The existing legacy `shift_templates` and `shift_assignments` tables were inspected but not modified. No attendance punches, employee schedules, or workbook data were imported.

## Tables and relationships

| Table | Purpose | Seeded |
|---|---|---:|
| `payroll_shift_presets` | Effective-dated, scoped schedule definitions | 0 |
| `payroll_shift_preset_segments` | One or more work segments per preset, including overnight segments | 0 |
| `payroll_recurring_schedule_rules` | Weekly rules linked to a worker-assignment version | 0 |
| `payroll_employee_schedules` | Canonical employee + shift-date + preset mapping | 0 |

The canonical date mapping permanently links an employee, a worker assignment, a shift preset, and a specific `shift_date`. A schedule override is represented as a new auditable row rather than an overwrite of a recurring rule or legacy schedule.

## Schedule data captured

Shift presets support configuration for:

- Regular, overnight, flexible, split, broken, rest-day, and other shift kinds
- `Asia/Manila` or another explicitly configured timezone
- Planned paid work minutes and separately configured break minutes
- One or more normalized work segments
- Legal-entity, payroll-group, business-unit, and site scope
- Effective dates, version, source, and approval evidence

No grace period, lunch rule, rounding rule, or premium multiplier was hardcoded. The existing legacy 15-minute grace field is not used by this canonical payroll model; the company’s stated 5-minute grace policy remains a policy-register item requiring approval and a later attendance-rule implementation.

## Controls added

- All four tables have RLS enabled.
- Authenticated reads are limited to the existing payroll configuration access helper for HR/Admin, Board, and Finance.
- Authenticated insert, update, and delete privileges are denied; service-side workflows are the only write path until the approved UI/RPC workflow exists.
- New presets, recurring rules, and employee schedules begin in `draft` status.
- Approval requires source-document evidence, approver identity, and approval timestamp; requester and approver cannot be the same when both are recorded.
- Status transitions are controlled and invalid transitions are rejected.
- Approved or active presets require at least one segment, and segment minutes must equal the preset’s planned scheduled minutes.
- Split and broken schedules use multiple segments; overnight segments explicitly record that they cross midnight.
- Approved and historical schedule records are immutable; corrections use a new version or a superseding record.
- A preset cannot be deleted; it must be superseded or archived.
- A non-draft recurring rule or schedule cannot be deleted.
- Effective dates must fit inside both the worker-assignment version and the shift-preset version.
- Scoped presets must match the assignment’s payroll group and, when supplied, business unit and site.
- Recurring rules cannot overlap for the same worker assignment and weekday.
- Only one draft, approved, or active date-specific schedule may exist for an employee on one date.
- A recurring date-specific schedule must identify a covering recurring rule whose weekday matches the scheduled date.
- Legacy shift and raw attendance tables remain separate and unchanged.

## Migrations applied

- `20260905094108_phase1_payroll_shift_roster_foundation.sql`
- `20260905094406_phase1_payroll_shift_roster_fk_indexes.sql`

Both migrations were applied to staging project `suxncpnerzfkjhkhjwbd` only. No production migration was applied.

## Verification

Rollback-only transaction tests passed for:

- Approved worker assignment → shift preset → segment → recurring rule → employee schedule relationship
- Overnight segment storage (`22:00` to `06:00`) with exact planned minutes
- Segment-total validation during preset approval
- Approved and active status transitions
- Active schedule immutability
- Active schedule delete protection
- Overlapping recurring-rule rejection
- Out-of-range date rejection
- Referenced shift-preset immutability
- Final row counts: zero in all four new tables after rollback
- RLS enabled with one controlled read policy on each new table
- Authenticated table privileges: `SELECT` only; no `INSERT`, `UPDATE`, or `DELETE`; anonymous `SELECT` denied
- Security advisor: no security lints associated with the new tables or functions
- Performance advisor: no missing-composite-FK-index lints after the follow-up migration; unused-index notices are expected while the tables are empty

The project-wide advisors still report unrelated pre-existing lints on legacy tables and functions. Those were not changed by this package.

## Not included

This package does not import existing schedules, interpret raw punches, calculate tardiness or undertime, run no-show alerts, apply leave or overtime, calculate payroll, or change the legacy attendance workflow. The employee/manager-specific read and write workflow will be added only after the access model and attendance ingestion boundaries are approved.

## Next gate

HR and Finance must approve the shift vocabulary, segment/break interpretation, timezone and worksite assignments, and recurring-roster crosswalk before any rows are loaded. The next implementation package can address the holiday calendar and its effective-dated worksite applicability.
