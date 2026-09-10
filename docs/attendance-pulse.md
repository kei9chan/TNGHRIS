# Attendance pulse

The dashboard inbox now follows Quick Links and precedes My Requests. The new staffing summary opens `/payroll/attendance-pulse` and uses Philippine work dates.

## Scope and privacy

The private `attendance_pulse` schema exposes sanitized, authenticated RPCs. Global BOD and HR see company summaries, BU managers see assigned BUs plus direct reports, and other supervisors see direct reports. Existing private request permissions govern medical explanations, attachments, and review actions. No existing RLS policy or payroll rule is changed. GC logging requires HR authorization to the employee and records the actual HR actor; it never signs an employee confirmation or approves the request.

## Counting and coverage

The primary count is distinct employees with unable-to-work reports, excluding withdrawn/cancelled reports. Rejected reports remain reported, not approved. Pending overdue reports can also need attention; closed HR reviews no longer count as open action items. The detail list retains every request and status.

Comparable baselines use up to four previous matching weekdays and require two tracked dates. Missing historical GC data is not invented. Coverage percentages use published work schedules; absent denominators remain unavailable. Overlap uses half-open Philippine timestamps with overnight shifts. Critical windows must be configured by HR. Repeated shift patterns are observational staffing concerns, not misconduct conclusions.

## Notifications

The existing private attendance delivery endpoint processes individual approvals first, then pulse emails through its remaining execution budget. The Supabase reminder job checks pulse conditions every 15 minutes. Daily summaries are deduplicated per recipient/date, and condition alerts are capped at three per recipient/date. Fingerprints use affected BU, concern and severity, rather than every count fluctuation. BOD notifications require a critical or configured company-wide concern. Delivery checks current role/scope, uses idempotency keys, logs leases, retries and results, and excludes reasons/attachments.

## Verification

- Production build succeeds; modified files add no TypeScript diagnostics (the repository has pre-existing unrelated diagnostics).
- `tests/attendancePulseRollback.sql`: exact employee counts, statuses, role scopes, no sensitive summary fields, HR GC actor/routing/retries, critical windows, immutable source/audit and deduplication.
- Existing attendance and clarification rollback suites pass, including original punch/schedule preservation, request revisions, scoped HR and explicit NTE approval/send controls.
- Transaction tests roll back all fixtures and queued notifications. No live browser interaction or employee inbox receipt is claimed by these checks.
