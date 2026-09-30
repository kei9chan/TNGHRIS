# Government holiday calendar in payroll readiness

Payroll preparation matches the centrally maintained government calendar automatically. The initial national release covers 2026 under Proclamations 1006, 1189 and 1264. It stores the exact dates, regular/special-working/special-nonworking classifications and government source links. The additional Eid proclamations are explicit; dates are never estimated from a lunar calculation.

No holiday coverage checkbox or manual holiday form is required in payroll preparation. The server ignores the old coverage checkbox when deciding whether authoritative coverage exists. Missing years remain one calendar-update task rather than accepting an unchecked assumption. Each actual overnight calendar-day segment requires coverage.

The national calendar supersedes duplicate legacy entries on the same date. A scheduled sync checks the published proclamation index twice daily (02:20 and 14:20 UTC), reads the proclamation text from Lawphil's copy of the signed presidential document, validates its number, date, kind and jurisdiction, and appends a new immutable calendar revision when a new declaration is unambiguous. The source URL is attached to each new date. National declarations apply to every business unit; NCR declarations apply only to verified NCR business units. An unavailable or ambiguous page cannot replace a verified calendar; conflicting dates are held for review. Annual proclamations are parsed into the next year's national calendar, while later Eid proclamations add their declared dates. Unknown future periods remain blocked until a calendar is published. Other local jurisdictions remain outside automatic coverage until their business-unit location is verified.

The Edge worker uses a separate private random token and service-role-only RPCs; a public call cannot trigger a sync. The twice-daily job retries transient website errors on the next run. Successful sync time and change count are recorded privately. The original signed documents and raw attendance evidence are unchanged.
Calendar versions and source URLs are part of the payroll snapshot, so a calendar revision changes the payroll source hash and makes previous calculations stale. The original attendance file, punches and saved payroll snapshots are unchanged. The separate recorded-break approval hash remains based on its original evidence, so a holiday-only update does not cancel those decisions. Payroll locks, final approvals and release controls are unchanged.

## Verification

- `node tests/holidayCalendarSyncTest.mjs`: annual list, special-day classification, three-day NCR declaration, document-number mismatch. A live sync returned 23 candidates, added 22 new dates (19 national for 2027 and three NCR in 2026); a second run returned zero additions. SM Aura has November 16–18; Inflatable Island does not. The cron job is active.

- `node tests/governmentHolidayCalendarTest.mjs`: real interpreter, 21 official national dates, classifications, Eid dates, duplicate replacement, scoped local preservation, unchanged punch/pay minutes, unknown-year and overnight checks, private ACL.
- `node tests/recordedBreakDecisionTest.mjs`: migration applied after submission; existing batch remains current; routing, self-approval, idempotency, stale attendance evidence and payroll locks remain enforced.
- `node tests/governmentHolidayCardBrowserTest.mjs`: calendar shown without manual fields, weekday and source links visible.
- `npm run build`.

Production read-only verification for SM Aura, August 26–September 10: 94 holiday coverage flags became zero; actual minutes 45,507, regular minutes 39,317 and approved OT minutes zero were unchanged. Original event fingerprint was unchanged. Both existing recorded-break batches remained current. No approval, payroll release or payslip publication was performed by this change.
