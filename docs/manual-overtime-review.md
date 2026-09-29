# Temporary manual overtime review

Employee requests declare actual extra work. Managers verify minutes; HRIS punches are not required for the OT decision. The production payroll engine still independently verifies regular attendance and entitlement rules.

Approval Center and Overtime Management group by employee and Monday–Sunday work week in Philippine time. Current server totals distinguish schedule/manager-confirmed baseline, final approved OT, manager-reviewed pending OT and unreviewed requests. Old request snapshots remain audit evidence, not the current total. No 40/48-hour fallback is used. Legacy approved/escalated records without an approved quantity make the weekly total unknown and require quantity reconciliation; they are never silently counted as zero.

Published schedule snapshots provide the regular-hour baseline. If incomplete, the direct manager records a weekly baseline and evidence once. Manager review can be saved while the baseline is missing; final routing waits for that confirmation.

The manager can reduce or verify exact minutes, including zero. BOD approves that same quantity; changes require return to the manager. Existing configured required BOD assignments remain required. Individual records, assignments and historical decisions are retained.

Select all eligible requests, approve the selected set, or approve all eligible requests in the displayed week directly. Notes are optional for approval and required for rejection/return. The server checks actor, self-approval, every selected ID, current week version, payroll locks, overlaps and quantities before applying any decisions. An operation key makes retries idempotent. Blocked rows stay visible and can be returned/rejected where payroll is not locked.

Duration-only submissions never receive invented timestamps. The manager explicitly verifies night-work minutes (zero if none) for the stated work date. Final approved manual paid OT becomes one payroll source identified by its existing request ID. Imported clock evidence does not create another payment. When a reduced interval crosses different premium rates, an exact approved interval/split is needed before payroll can value it without guessing. Offset authorization requirements are unchanged.

Source evidence is included in the existing payroll snapshot hash. Existing current-version checks require recalculation before stale payroll can be approved. Frozen payroll requires its authorized correction path. There is no automatic switch away from manual mode; an attendance-based transition requires a separately authorized change preserving historical evidence modes.

## Verification

- `node tests/manualOvertimeReviewTest.mjs`: database review, routing through the existing approval core, ACLs, exact quantities, overnight/break handling, baseline confirmation, zero, stale snapshots, atomic errors, replay, self-approval, duplicates and frozen payroll.
- `node tests/otVisibilityTest.mjs`: reporting scopes and authenticated RLS regression.
- `TEST_MANUAL_OT=1 node tests/connectedPayrollDraftTest.mjs`: isolated production time/gross/net calculation with persisted draft, 60 manual OT minutes without OT punches; later punches do not duplicate payment; duration/night allocation; premium-boundary ambiguity is explicit.
- `node tests/connectedPayrollDraftTest.mjs`: ordinary attendance/payroll regression.
- `node tests/manualOtBrowserFixture.mjs`: synthetic local-only UI harness, no HRIS connection.
- `tests/manualOtBrowserCheck.mjs`: Playwright test; set `PLAYWRIGHT_MODULE` and `CHROME_EXECUTABLE` when installed outside the project. Uses the generated local harness. Checks desktop/mobile layout, exact selected minutes, a single decision call and no confirmation modal.
- `npm run build`.

No production request decisions, payments, payslip releases or filings are performed by verification.
