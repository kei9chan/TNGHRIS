# Government holiday calendar in payroll readiness

Payroll preparation matches the centrally maintained government calendar automatically. The initial national release covers 2026 under Proclamations 1006, 1189 and 1264. It stores the exact dates, regular/special-working/special-nonworking classifications and government source links. The additional Eid proclamations are explicit; dates are never estimated from a lunar calculation.

No holiday coverage checkbox or manual holiday form is required in payroll preparation. The server ignores the old coverage checkbox when deciding whether authoritative coverage exists. Missing years remain one calendar-update task rather than accepting an unchecked assumption. Each actual overnight calendar-day segment requires coverage.

The national calendar supersedes duplicate legacy entries on the same date. Existing scoped local declarations on other dates remain applicable only within their original scope. **This release is not a live scraper and does not discover new local proclamations or infer a business unit's jurisdiction.** New announcements and additional years require a reviewed central calendar revision. Do not label this a continuously synchronized government feed. Government website failures must never delete a previously verified calendar or turn unknown dates into ordinary days.

Calendar versions and source URLs are part of the payroll snapshot, so a calendar revision changes the payroll source hash and makes previous calculations stale. The original attendance file, punches and saved payroll snapshots are unchanged. The separate recorded-break approval hash remains based on its original evidence, so a holiday-only update does not cancel those decisions. Payroll locks, final approvals and release controls are unchanged.

## Verification

- `node tests/governmentHolidayCalendarTest.mjs`: real interpreter, 21 official national dates, classifications, Eid dates, duplicate replacement, scoped local preservation, unchanged punch/pay minutes, unknown-year and overnight checks, private ACL.
- `node tests/recordedBreakDecisionTest.mjs`: migration applied after submission; existing batch remains current; routing, self-approval, idempotency, stale attendance evidence and payroll locks remain enforced.
- `node tests/governmentHolidayCardBrowserTest.mjs`: calendar shown without manual fields, weekday and source links visible.
- `npm run build`.

Production read-only verification for SM Aura, August 26–September 10: 94 holiday coverage flags became zero; actual minutes 45,507, regular minutes 39,317 and approved OT minutes zero were unchanged. Original event fingerprint was unchanged. Both existing recorded-break batches remained current. No approval, payroll release or payslip publication was performed by this change.
