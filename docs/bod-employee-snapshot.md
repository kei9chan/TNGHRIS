# BOD Employee Snapshot

Route: `/employee-snapshot`. BOD-only shortcuts exist in the main navigation and Employee Management. The UI uses the active effective role list, not Admin equivalence. Database entrypoints independently require an active HRIS identity with an active Board of Director role.

Three read-only RPCs return a narrow directory, filter options and one selected snapshot. Public entrypoints use a fixed empty search path and invoke guarded private functions. No existing table policy, role assignment or table SELECT grant is changed. No government IDs, bank accounts, home address or emergency contacts are projected. Component JSON is whitelisted.

Search is debounced 250 ms and requests are abortable with sequence and employee-ID checks. Browse uses 25-row server pages. URL state preserves filters, sorting, selection and list scroll position. Sensitive detail payloads are held only in component memory and are cleared when the authenticated page unmounts.

## Authoritative sources

- Identity and tenure: canonical nonduplicate `hris_users`, hire/end dates, business units and reports-to records. Missing separation dates prevent a fabricated tenure.
- Compensation: current approved `payroll_pay_packages`, per engagement and effective date, approved base and recurring components. Same-date conflicts are flagged. HRIS rates are labeled unapproved references when no approved package exists.
- Historical company cost: latest disbursed net-run source snapshot recomputed with existing `private.calculate_payroll_net_v1`; gross plus employer contributions. Company top-up is already in gross and is not added twice. This is a cutoff actual, not a monthly forecast.
- Evaluation: completed evaluations, employee submissions and evaluator configuration; individual-before-group weighting normalized over scored groups. No invented official rating labels or summaries.
- Attendance: completed submitted timekeeping cutoffs with ready rows. Missing punches never imply unexcused absence. Period and partial-data limitations are shown.
- Cases: issued NTE evidence and employee-specific finalized resolutions. Draft/rejected/unsent/issuance-unverified notices are excluded from issued counts. Open allegations are not findings. Query failures are separate from zero counts.

## Known limitations — do not describe these as completed calculations

At implementation, no approved pay packages, payroll net runs, submitted timekeeping packages or completed evaluations were present. No authoritative dedicated service-charge eligibility/finalized-payout source was found. The snapshot does not infer these from generic special-pay text.

Monthly employer forecasting is not yet configured in the existing payroll system. This release displays a specific unavailable state, not a calculated monthly estimate. A reviewed forecast input source including paid days/hours, statutory bases and accrual settings is required before monthly estimate and highest-company-cost sorting can become numerical. The latter currently explains its name-order fallback. It is not enough merely to add a salary record.

No separate employment-type field exists; the available extra filter is explicitly payment basis. No finalized unexcused-absence classification is available. Rehire history beyond the authoritative current hire/end fields is not reconstructed.

## Verification

`node tests/employeeSnapshotTest.mjs`: role combinations, tenure, zero vs missing, tax labels and request-cancellation structure.

`node tests/employeeSnapshotRenderTest.mjs`: isolated monthly/daily/hourly/net/split/conflicting/missing package rendering, unavailable/error states and allegation wording. No database fixtures are inserted.

`tests/bodSnapshotAccess.sql`: run inside BEGIN/ROLLBACK; validates current active BOD/non-BOD/anonymous claims, bounded responses and sensitive-field absence. Separately verified public RPC execution under actual authenticated SQL role, non-BOD altered-ID denial, filters, all sorting options, pagination/no overlaps and summary/detail ID consistency.

Production build passes. Authenticated browser interaction, rapid-switch behavior under real network load, mobile visual layout and large synthetic-business-unit load testing remain unverified because the available browser is signed out. Do not treat static guards or server rendering as substitutes for those end-to-end checks.
