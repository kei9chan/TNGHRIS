# Phase 1E — Effective-Dated Holiday Calendar

**Date:** 2026-09-05

**Branch:** `payroll-staging`

**Production impact:** None

**Status:** Applied and verified in staging; no holiday data seeded

## Scope

This work package adds the holiday source of truth needed before attendance and premium-pay calculations:

- Versioned holiday calendars
- Regular holidays
- Special non-working days
- Special working days
- Local or other configured holiday classifications
- Legal-entity, payroll-group, business-unit, and site applicability
- Official-source and publication-date fields

The existing legacy holiday configuration was not modified. No government holiday list or employee/payroll data was copied into staging.

## Tables

| Table | Purpose | Seeded |
|---|---|---:|
| `payroll_holiday_calendars` | Effective-dated, scoped calendar versions | 0 |
| `payroll_holiday_dates` | Classified dates attached to a calendar version | 0 |

Holiday dates are unique within a calendar. Calendar versions with the same code and scope cannot have overlapping effective dates.

## Controls added

- Both tables have RLS enabled.
- Authenticated reads are limited to the existing payroll configuration access helper for HR/Admin, Board, and Finance.
- Authenticated insert, update, and delete privileges are denied; service-side workflows are the only write path until the approved UI/RPC workflow exists.
- New calendars begin in `draft` status and require source-document evidence, approver identity, and approval timestamp before approval or activation.
- Requester and approver cannot be the same user when both are recorded.
- Calendar status transitions are controlled.
- Once holiday dates exist, the calendar’s identity, scope, effective range, and version are immutable; create a new version for corrections.
- Holiday dates can only be added or changed while their calendar is in draft status.
- Approved-calendar holiday dates cannot be deleted.
- A holiday date must fall inside its calendar’s effective range.
- Payroll-group scope must match its legal entity and, when supplied, its business unit.

No holiday multiplier, premium stacking rule, rest-day treatment, or tax treatment was hardcoded. Those belong to the later calculation engine and statutory/policy rule tables.

## Migration applied

- `20260905113007_phase1_payroll_holiday_calendar.sql`

The migration was applied to staging project `suxncpnerzfkjhkhjwbd` only. No production migration was applied.

## Verification

Rollback-only tests passed for:

- Regular-holiday and special-non-working classifications
- Calendar effective-date containment
- Overlapping calendar-version rejection
- Approved-calendar holiday mutation protection
- Approved-calendar holiday deletion protection
- Calendar deletion protection
- Final row counts: zero in both new tables after rollback
- RLS enabled with one controlled read policy on each table
- Authenticated table privileges: `SELECT` only; no `INSERT`, `UPDATE`, or `DELETE`; anonymous `SELECT` denied
- Security advisor: no security lints associated with the new tables or functions
- Performance advisor: no missing-FK-index lints associated with the new tables; unused-index notices are expected while the tables are empty

The project-wide advisors still report unrelated pre-existing lints on legacy tables and functions. Those were not changed by this package.

## Not included

This package does not import official holiday lists, interpret attendance, classify a holiday against a rest day, calculate holiday premiums, calculate overtime, or modify payroll results.

## Next gate

HR and Finance must approve the holiday classifications, applicable worksites, official sources, and treatment of holidays falling on rest days before any dates are loaded. The next implementation package can address raw time-event ingestion while preserving raw events separately from interpreted attendance.
