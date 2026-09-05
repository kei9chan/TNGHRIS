# Phase 1F — Raw Time-Event Ingestion Foundation

**Date:** 2026-09-05

**Branch:** `payroll-staging`

**Production impact:** None

**Status:** Applied and verified in staging; no ingestion or employee data seeded

## Scope

This work package adds the append-only source layer for time observations before any attendance interpretation or payroll calculation:

- Mobile, biometric, QR, manual, work-from-home, official-business, import, and device-downtime source categories
- Batch-level ingestion tracking and source manifests
- Idempotency keys and source-event identifiers
- Original source timestamp text and raw JSON payload preservation
- Normalized event timestamps with explicit source timezones
- Offline/sync submission metadata and device-clock offset metadata
- Unresolved employee references for identity mapping before an employee is assigned
- Optional clock-action geolocation fields with policy-version evidence
- A separate future interpretation boundary for paid time, late minutes, undertime, absence, overtime, breaks, and premiums

The legacy `time_events` and attendance tables were not modified. The supplied payroll workbooks and employee data were not imported.

## Tables

| Table | Purpose | Seeded |
|---|---|---:|
| `payroll_time_ingestion_batches` | Source-system batch receipt, status, manifest, and control totals | 0 |
| `payroll_raw_time_events` | Immutable raw time observations retained separately from interpreted attendance | 0 |

Each raw event retains both the normalized `event_occurred_at` value used for later processing and the original `source_timestamp_text`/`raw_payload` supplied by the source. A null `employee_id` is permitted when a nonblank source employee reference is retained for later identity resolution.

## Controls added

- Both tables have RLS enabled.
- Authenticated access is limited to the existing payroll time-data access helper; authenticated users receive `SELECT` only until the approved ingestion API/RPC workflow is implemented.
- Anonymous/public table access is denied. Service-side processing has the required table privileges, while raw-event update and delete triggers still reject mutation.
- Batch source keys are unique per source system, and raw-event idempotency keys are unique per source system.
- New batches begin in `received` status and use controlled transitions through validation and processing states.
- Completed, failed, or cancelled batches cannot have their source identity, manifest, receipt time, or control totals rewritten.
- Raw events may be appended only while their batch is `received`, `validating`, or `partially_processed`; completed batches cannot receive late events.
- A raw event’s source type and source system must match its ingestion batch.
- Raw events cannot be updated or deleted. Corrections must be represented by a new linked event or a later interpretation record.
- Duplicate classification is represented explicitly through `event_status`, `is_duplicate`, and `duplicate_of_event_id`; raw duplicates remain retained for audit.
- Event kinds, work context, submission mode, status, identity, timezone, payload shape, coordinate ranges, and location-policy evidence are constrained.
- Location capture is represented only as a clock action and is restricted to clock-in/clock-out events. It requires coordinates and a recorded location-policy version; continuous tracking is not part of this schema.
- Foreign keys preserve the relationship to the ingestion batch and employee master and prevent referenced employees or batches from being removed.

No tardiness, undertime, absence, overtime, leave, break, night differential, holiday, rest-day, or payroll amount is calculated by this phase.

## Migrations applied

- `20260905113903_phase1_payroll_raw_time_ingestion.sql`
- `20260905114443_phase1_payroll_raw_time_ingestion_guard.sql`

Both migrations were applied to staging project `suxncpnerzfkjhkhjwbd` only. No production migration was applied.

## Verification

Rollback-only transaction tests passed for:

- Raw batch and event creation with unresolved source employee identity
- Valid batch status progression
- Completed-batch input immutability
- Raw event update rejection
- Duplicate idempotency-key rejection
- Mismatched event-source rejection
- Appending to a processed batch rejection
- Location capture rejection on non-clock events
- Final verification row counts: zero after rollback
- RLS enabled with one controlled read policy on each new table
- Authenticated table privileges: `SELECT` only; anonymous access denied
- Security advisor: no security lints associated with the new tables or functions
- Performance advisor: no blocking missing-FK-index lint associated with the new tables; unused-index notices are expected while the tables are empty

The project-wide advisors still report unrelated pre-existing lints on legacy tables and functions. Those were not changed by this package.

## Not included

This package does not create ingestion endpoints, parse biometric files, resolve employee identities, interpret attendance, apply schedules or holiday rules, send no-show alerts, calculate payroll, configure GPS consent/retention workflows, or change the legacy attendance workflow.

## Next gate

HR, Finance, IT Security, and Data Protection must approve source-adapter contracts, identity-resolution rules, raw-event retention, device-clock handling, geolocation purpose/notice/retention, and the correction workflow before live adapters or interpreted-attendance logic are enabled. The next implementation package can add versioned attendance interpretation and exception handling on top of this preserved raw layer.
