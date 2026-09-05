# Phase 1K — Leave Audit and Schedule Workflows

Status: implemented on `payroll-staging` and applied to the staging Supabase project only.

Phase 1K adds the approval path needed before schedule changes can feed attendance and payroll. It does not calculate pay, statutory deductions, overtime premiums, or final net pay.

## Delivered

- Append-only `payroll_leave_request_events` records every leave insert or update with before/after snapshots and the acting HRIS user.
- `payroll_schedule_change_requests` supports a date-specific change of shift.
- `payroll_shift_swap_requests` requires the counterparty to accept before manager or payroll review.
- `payroll_schedule_workflow_actions` preserves submit, response, review, cancellation, and apply history.
- Approved changes supersede the existing `payroll_employee_schedules` row and create a new approved version.
- Existing raw time events and attendance interpretations are never edited or deleted.
- A request is marked `requires_reinterpretation` when an interpretation already exists for the affected date. A later attendance package must explicitly create the new derived interpretation.
- Approved leave blocks a schedule change or swap for the covered date.

## Approval routing

The request records the current direct manager. When no direct manager is configured, the request is explicitly marked `payroll_exception` and can be reviewed only by the configured HR, administrator, or Finance payroll reviewer. This is a controlled staging fallback, not a hard-coded approver.

## Security

The request tables are RLS-protected. Browser clients have read access only to records authorized by employee, direct-reporting, or payroll scope. Inserts and updates are performed through authenticated, security-definer RPCs with explicit actor checks; direct table writes are not granted to authenticated users. Workflow history is append-only.

## Staging test fixture

The synthetic fixture includes a same-date pair for the swap path:

- `PAYROLL TEST 04` — part-time shift on 2026-08-14
- `PAYROLL TEST 07` — split shift on 2026-08-14

The fixture has no direct managers, so its approval mode is `payroll_exception`. This does not alter real employees or production data.

## Next gate

Before payroll calculations consume schedule changes, the next package must add the pre-payroll staging reconciliation that joins approved schedule versions, leave, attendance interpretations, and approved overtime while surfacing requests flagged for reinterpretation.
