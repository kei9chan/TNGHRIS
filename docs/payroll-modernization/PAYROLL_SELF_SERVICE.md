# Payroll self-service

Status: tested locally; production migration applied. Public source publication and UI deployment are blocked by automatic approval review pending explicit approval for this update. Team acceptance awaits released payroll records (none existed at implementation).

- Dashboard: My Payslips follows My Profile in the existing Quick Links grid. The original `/payroll/payslips` route remains; the loose dashboard link is removed.
- Payslips: newest period first, year filter, released snapshot/version, expandable earnings and deduction detail, PDF, Report an Issue. Special-pay remaining balances remain distinct from employer costs. No live attendance recalculation.
- My Payroll Issues: reached from My Payslips. Submitted → HR Review → Finance Verification → Resolved / Rejected / Needs Information. Requested information returns to the requesting review stage. Refresh shows the latest status.
- HR / Finance review: visible from My Payslips and My Payroll Issues only when existing payroll duties, salary permission and role allow it. Access is checked again per employee and original payroll scope. HR Staff alone currently lacks salary-view permission; this release does not expand it.
- Corrections: Finance creates a separate adjustment request, uses the existing Special Pay correction/supplement and payroll authorization workflow, and includes the adjustment UUID in the payroll submission reference. Only a separately approved, released payslip for the same employee and scope can be linked. Original payslips remain immutable; same-period replacement links are labelled Revised, separate corrections Adjustment. Resolution cannot skip release when an adjustment request exists.
- Supporting files: private PDF/PNG/JPEG, maximum 5 MB, own-issue upload, scoped reads. Internal notes never appear in employee RPC responses. No direct client access to the new audit tables.
- Employee number and BU are captured separately at payslip release; existing payroll payloads and policies are not altered. Historical records without captured metadata explicitly say it was not recorded.

## Essential verification

Passed: production build; focused static-render/PDF tests; rollback-only database test for own reads, item details, duplicate submissions, HR/Finance sequence, requested information, private notes, attachment access, unauthorized manager/employee denial, separate correction gates, revision linkage and original preservation.

Repository-wide TypeScript check has pre-existing errors in unrelated files; no errors remain in the changed payroll components.

Browser/mobile visual and authenticated PDF-download click verification remain pending: the available production browser is signed out. No test payslips, employees, payments, issues or permission grants were retained. No production payroll was released for testing.

Supabase advisors flag intentional authenticated SECURITY DEFINER endpoints and RLS tables without direct policies. These match the existing payroll RPC-only model: all direct table grants revoked, active-account and owner/scope checks enforced by each RPC, fixed empty search paths, anonymous execution revoked. Storage has only bucket-specific INSERT/SELECT policies. Existing policies are untouched.
