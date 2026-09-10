# Attendance clarification and HR review

The attendance request page now separates Approve, Return for Clarification, and Reject and Send to HR Review. Employee revisions retain the original request ID and immutable prior values. Rejection requires a reason, comments and confirmation and creates a factual, private HR-linked Incident Report draft. It does not approve attendance or issue an NTE.

HR can close with no violation (optionally applying the existing validated attendance overlay), request a written explanation with a deadline, or save and edit an NTE draft. NTE submission retains existing designated approvals, including BOD review. Attendance-linked NTEs wait in Approved after designated approval and require the additional explicit HR Approve and Send NTE action. Unrelated NTE issuance is unchanged. Issued notices use the existing receipt, response, reminder and case workflow.

The dashboard surfaces employee clarification tasks and keeps employee, manager and HR queues separate. Original/revised evidence and attachments are available through authenticated request details. Clarification reminders use the existing private delivery queue and Supabase scheduler, with a configurable default of 48 hours. Expiry escalates to HR without automatically creating a disciplinary case.

## Database changes

- `20260910005302_attendance_clarification_hr_review.sql`: private HR cases, linked audit metadata, protected review RPCs, immutable revision history, scoped incident privacy, explicit NTE controls and clarification reminders.
- `20260910010836_attendance_hr_retry_and_scope_guards.sql`: idempotent revision retries, deny-only retention/edit guard for attendance-linked incidents, selected-policy validation, and NTE response state tracking.

Both migrations are additive. No existing requests, schedules, payroll or leave balances are rewritten. Private helper functions remain inaccessible to authenticated clients; RPCs validate the acting account and scope. Medical evidence remains in private storage.

## Verification

- Production build passed.
- `tests/attendanceClarificationRollback.sql` passed: same-request revision, duplicate retry, manager routing, clarification without IR/NTE, confirmed rejection, factual draft, scoped HR response, decision pause, draft edit, designated approval, explicit HR send, original unapproved attendance, no-violation closure and linked immutable audit.
- The test switches to the authenticated database role to verify private-table denial, unsent-NTE redaction and assigned approver RLS access.
- `tests/attendanceIssuesRollback.sql` passed: original approval authorization, withdrawal, schedule preservation, approved absence overlay, punch correction and retention of subsequent raw punches.
- All database test fixtures, notification queues and related personnel records were rolled back. No test emails were delivered.
- Repository-wide TypeScript checking has existing errors outside these changed components. Changed attendance components have no reported TypeScript errors.
- Real employee inbox receipt and interactive desktop/mobile browser checks were not performed in this environment.
