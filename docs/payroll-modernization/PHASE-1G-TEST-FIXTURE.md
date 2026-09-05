# Phase 1G — Payroll Staging Test Fixture

**Status:** Applied to `payroll-staging` only  
**Supabase project:** `suxncpnerzfkjhkhjwbd`  
**Migration:** `20260905131600_payroll_staging_test_fixture.sql`  
**Production status:** Not applied and must not be merged to `main`

## Purpose

This fixture supplies synthetic records for testing the payroll foundation. All names use `PAYROLL TEST`, all email addresses use the reserved `.invalid` domain, and none of the ten rows has a real login account. No employee data, salary workbook data, bank information, or statutory identifiers were copied.

The fixture includes:

- 10 labeled mock worker records
- 9 active employee-payroll assignments
- 1 independent-contractor record with no employee-payroll assignment
- 14 effective-dated employee compensation rows
- 2 salary versions for the salary-change scenario
- 6 approved test shift presets, including overnight, split, flexible, and rest-day shifts
- 9 dated schedules for the attendance test period
- 19 immutable raw time events, including one duplicate punch and one offline-sync example
- 1 staging-only attendance rule using a five-minute grace period and one-hour moveable meal break
- 1 draft payroll period for August 11–25, 2026 with pay date September 5, 2026

## Scenarios

| Order | Fixture | Scenario | Main purpose |
|---:|---|---|---|
| 1 | `PAYROLL-TEST-01` | Monthly regular | Basic salary, allowance, and deduction components |
| 2 | `PAYROLL-TEST-02` | Probationary + grace boundary | Five-minute grace and duplicate punch handling |
| 3 | `PAYROLL-TEST-03` | Daily-paid | Daily rate, late arrival, and early departure |
| 4 | `PAYROLL-TEST-04` | Hourly part-time | Partial shift and work-from-home context |
| 5 | `PAYROLL-TEST-05` | Fixed-term rest-day work | Assignment end date and rest-day schedule |
| 6 | `PAYROLL-TEST-06` | Mid-period hire | August 18 hire date and offline punch synchronization |
| 7 | `PAYROLL-TEST-07` | Salary increase + split shift | August 15 effective-dated salary change |
| 8 | `PAYROLL-TEST-08` | Mid-period separation + overnight | August 20 assignment end and overnight punches |
| 9 | `PAYROLL-TEST-09` | Split employee + consultant | Employee salary side plus separate professional-fee expectation |
| 10 | `PAYROLL-TEST-10` | Independent contractor | Professional-fee stream with no employee-payroll assignment |

The consultant fee for scenario 9 is intentionally not stored in employee compensation history. The current guard rejects that mix; the future professional-fee payable stream must remain separate.

## How to test now

1. Open the `payroll-staging` HRIS deployment and sign in with the existing staging account.
2. Search the Employee list for `PAYROLL TEST` and confirm that all ten synthetic records appear.
3. Confirm that the test period is August 11–25, 2026 and the test payroll group is marked `STAGING ONLY`.
4. In the staging database, confirm the fixture counts: 10 users, 9 assignments, 14 compensation rows, 9 schedules, and 19 raw events.
5. Review the raw attendance cases: the duplicate punch belongs to `PAYROLL-TEST-02`; no raw event exists for `PAYROLL-TEST-09`, which is the no-show input.
6. Review `PAYROLL-TEST-07` and confirm that its basic-pay history has a version ending August 15 and a second version beginning August 15.
7. Review `PAYROLL-TEST-09` and confirm that only its employee-payroll basic salary is in compensation history; its consultant side is recorded only as a separate test expectation.

At this point the fixture validates the Phase 1 foundation and data controls. Automatic late-minute, undertime, absence, no-show, and payroll-amount calculation are the next Phase 1H package, so a payslip should not yet be expected from these rows.

## Safety

The fixture migration is additive and reserved for the persistent `payroll-staging` environment. Do not apply it to production, do not create passwords for the fake users, and do not use the fixture values as approved company or statutory policy.
