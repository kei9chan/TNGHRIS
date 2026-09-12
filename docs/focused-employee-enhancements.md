# Focused employee enhancements

## HR usage

- Schedule Plotting: select **Suspended**, select the employee/date, and provide the reason. Only scoped HR Staff, HR Manager and Admin can set or clear a suspension. Original assignments and payroll inputs are retained.
- The expandable **Suspension status report** in Timekeeping, Attendance Pulse and Schedule Compliance shows a selected month separately from absences and exports the reason and actor.
- Inactive status changes ban normal authentication, revoke refresh tokens/sessions and record the lifecycle event. Existing end-date and reactivation workflows remain authoritative. A Data API request guard also denies stale JWTs for inactive profiles; storage has an additional restrictive guard.
- Employees → Onboarding checklist → Offboarding: assign the existing clearance checklist first. **Inactive employee offboarding access** grants/reissues a private link with a reason and expiration (maximum 30 days). Share it only with that employee. This never unbans the normal account or creates another auth identity.
- Offboarding links open an isolated page with only employee-owned checklist tasks. Submissions and uploads require HR clearance review; no self-approval. Documents are limited to PDF/image/text files up to 1 MB and are RPC-only. HR downloads them from the same access panel. Grant hashes—not readable links—are stored. Expiry/completion is checked on every request; the cleanup job records revocation.
- Pulse Survey → Compliance Status → Export Filtered Report downloads an XLSX with Compliance Details, Compliance Summary and Survey Results. All sheets use the same filtered, server-authorized recipient set. Anonymous text/date/time answers and cells smaller than five respondents are withheld, not reported as zero.

## Verification

- `node tests/pulseComplianceTest.mjs`: combined filters, totals, results and XLSX round-trip.
- `node tests/scheduleStatusUiTest.mjs`: suspension label/color and normal schedule display.
- `tests/focusedEmployeeEnhancementsRollback.sql`: run inside BEGIN/ROLLBACK after the three migrations. Temporary employee, identity, schedule and checklist test records are rolled back. Covers attendance exclusion, payroll input preservation, active bootstrap, inactive identity/API/storage denial, offboarding ownership, upload retry, expiration/completion and filtered survey export authorization.
- Production build passes. Existing unrelated TypeScript `tooltip` errors in Timekeeping's publication review were not changed.
- A real employee password sign-in and authenticated browser walkthrough were not performed: no employee browser session or test login was available. SQL authorization tests use transaction-local claims and do not substitute for a real password sign-in.

## Boundaries

Suspension is an attendance overlay, not a pay rule. Existing payroll calculations and historical punches are not rewritten. Inactive employees receive no authenticated Supabase session for offboarding. The private link cannot authorize regular HRIS APIs, storage or other employees' tasks. Existing RLS policies remain in place; no employee or HR scope is widened.
