# Phase 1I — Attendance Exception Resolution

Status: implemented on `payroll-staging` and applied to the staging Supabase project only.

Phase 1I adds a controlled review path for open attendance exceptions. Authorized HR, Finance, or administrator reviewers can acknowledge, resolve, reopen, or waive an exception with a reason and supporting reference. The original raw time event and attendance interpretation remain immutable; the resolution records the decision that will later be consumed by payroll staging.

The resolution workflow is intentionally separate from payroll calculation. A resolved exception does not itself create a payslip or silently change a locked payroll.
