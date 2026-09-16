# Phase 4: calculation and comparison

## User flow

Select a business unit and completed cutoff in Payroll Home. Under Run Payroll, the consecutive steps are Gross Pay Review → Take-home Pay Review → Compare & Pilot. Existing URLs continue to work. The selected gross/net IDs are stored per signed-in user, BU and cutoff; changing the gross version clears its downstream net selection. The backend rechecks scope, dates, exact lineage, source freshness and existing salary permissions.

Gross and net calculations and dated package selection use the existing engines unchanged. Historical readiness lists missing approved salary dates, unreviewed proration, missing deduction evidence and missing opening-balance evidence. Finance must document zero/none where appropriate; an absent value is not zero. The previous-cutoff picker shows only immediately consecutive latest saved versions. The existing server additionally validates pay dates, contribution months and prior-run freshness.

Compare & Pilot now supports an internal comparison directly from a saved net calculation, before formal payroll submission. Its XLSX format reuses the existing full-roster/component comparison parser. Each employee has system, existing-payroll and difference columns, including equal rows, plus explanations and evidence. Decimal subtraction in the local preview uses integer cents. Saved results use the existing SQL comparison validator.

Internal comparison revisions are immutable and idempotent, bound to the exact net source hash, and stored in `payroll_calculation_private.comparisons`. They do not count as formal HR/Finance acceptance and cannot activate a pilot. Existing six-stage payroll approval, comparison acceptance, BOD decisions and activation controls remain unchanged. No calculation, approval, attendance, loan or payment writers were added or changed.

## Isolation and access

The new table has RLS and no direct client grants. Only authenticated invoker RPCs expose guarded private functions. Every read checks the existing scoped salary permissions; every write additionally requires the existing Finance preparer role. No service key or client-provided pay amounts are used to generate the system-side comparison. Requests for a different BU/cutoff or mismatched gross/net pair fail closed. Existing Phase 2 historical imports remain separate evidence: this phase does not promote those imports into live attendance or manufacture punches from DTR totals.

## Focused verification (2026-09-16)

- `node tests/payrollCalculationComparisonTest.mjs`: passed. Uses actual checked-in gross/net engines in local PGlite, with isolated synthetic fixtures for June 1–15 and June 16–30, 2026. Take-home results: PHP 12,771.30 and PHP 13,071.30. The PHP 300 difference comes from the capped final loan installment (400 then 100), with projected balance reaching zero. Checks historical salary vs later salary, missing openings, separate historical blockers, scope/lineage rejection, component explanations, immutable/idempotent revisions and fresh reads, stale-source rejection, and denied unauthorized access. Auth dependencies are explicit local fixtures, not production impersonation.
- `node tests/payrollCalculationUiTest.mjs`: passed. Actual XLSX round-trip, missing amount rejection, employee comparison rendering, navigation order/permissions, retained user-isolated selection and cross-component selection notifications.
- `npm run build`: passed.
- Type check: existing unrelated repository errors remain; no diagnostics in changed files.
- Production migration applied. Read-only verification confirmed RLS enabled, direct authenticated table SELECT/INSERT denied, anonymous RPC execution denied, public RPCs security-invoker, no comparison records inserted, and Bakebe processing still off. Security advisors show no new warnings; the new private table's no-policy INFO is intentional deny-all direct access.

## Real-data acceptance still blocked

Read-only production inventory found zero Bakebe SM Aura payroll pay packages (including packages for its current employees under other scopes), timekeeping package versions, historical test imports, gross runs, net runs and saved comparisons. Processing is off. No real historical cutoff was reproduced, no real employee payroll was submitted, and no payment was generated. Two-cutoff results above are synthetic verification, not Bakebe acceptance.

Authorized HR/Finance must supply the two actual cutoff datasets, approved dated packages/policies and historical deduction/opening evidence, followed by the existing scope-specific shadow authorization. A signed-in browser flow remains unverified because the available browser session is signed out. A reachable login page is not evidence of payroll success.
