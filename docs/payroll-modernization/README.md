# TNG HRIS Payroll Modernization — Phase 0 through Phase 1G, plus staging test fixtures

**Assessment date:** 2026-09-04

**Code baseline:** `origin/main` at `2f10f51`

**Database assessed:** connected production Supabase project, read-only inspection
**Decision:** **NO-GO for production payroll processing**

This directory contains the discovery, control-design, and staging-only foundation work. Production payroll behavior remains unchanged and the existing payroll prototype remains **NO-GO** for production use.

## Executive outcome

The repository contains payroll and timekeeping screens, but the connected production database does not contain a payroll ledger or calculation engine. The routed staging screen performs a simplified browser calculation using mutable current employee fields, a hardcoded monthly divisor, and zero statutory deductions. It then attempts one insert per employee into a `payslips` relation that does not exist. There is no durable payroll-period lock, posting, reversal, retro-pay, supplemental, reissue, lineage, or maker-checker control.

The immediate objective is therefore containment and source-of-truth recovery—not activation of the existing prototype.

## Phase 0 deliverables

| Deliverable | File | Status |
|---|---|---|
| Existing-system audit, data-flow map, root-cause analysis, gap/risk register, and decision log | [PHASE-0-AUDIT.md](./PHASE-0-AUDIT.md) | Complete for the accessible repository and connected database |
| Effective-dated policy and rule register | [POLICY-REGISTER.md](./POLICY-REGISTER.md) | Draft register created; business decisions remain unapproved |
| Migration, rollback, feature-flag, parallel-run, and implementation sequence | [MIGRATION-AND-ROLLBACK-PLAN.md](./MIGRATION-AND-ROLLBACK-PLAN.md) | Plan only; no migration executed |
| Production/repository migration name comparison | [MIGRATION-DRIFT-APPENDIX.md](./MIGRATION-DRIFT-APPENDIX.md) | Name-level triage complete; content-level crosswalk remains a prerequisite |
| Baseline payroll and reconciliation design | [BASELINE-RECONCILIATION.md](./BASELINE-RECONCILIATION.md) | Baseline workbooks received; employee and control-total reconciliation pending |
| Phase 1A payroll period foundation | [PHASE-1A-PAYROLL-PERIOD-FOUNDATION.md](./PHASE-1A-PAYROLL-PERIOD-FOUNDATION.md) | Applied to `payroll-staging` only; no rows seeded |
| Phase 1B effective-dated worker/classification foundation | [PHASE-1B-WORKER-ASSIGNMENTS.md](./PHASE-1B-WORKER-ASSIGNMENTS.md) | Applied to `payroll-staging` only; catalogs and assignments remain empty |
| Phase 1C compensation components and history | [PHASE-1C-COMPENSATION-HISTORY.md](./PHASE-1C-COMPENSATION-HISTORY.md) | Applied to `payroll-staging` only; components and compensation history remain empty |
| Phase 1D shift presets and canonical employee roster | [PHASE-1D-SHIFT-ROSTER.md](./PHASE-1D-SHIFT-ROSTER.md) | Applied to `payroll-staging` only; presets, rules, and schedules remain empty |
| Phase 1E effective-dated holiday calendar | [PHASE-1E-HOLIDAY-CALENDAR.md](./PHASE-1E-HOLIDAY-CALENDAR.md) | Applied to `payroll-staging` only; calendars and holiday dates remain empty |
| Phase 1F raw time-event ingestion foundation | [PHASE-1F-RAW-TIME-INGESTION.md](./PHASE-1F-RAW-TIME-INGESTION.md) | Applied to `payroll-staging` only; ingestion batches and raw events remain empty |
| Phase 1G attendance rules, interpretations, and exceptions | [PHASE-1G-ATTENDANCE-INTERPRETATION.md](./PHASE-1G-ATTENDANCE-INTERPRETATION.md) | Applied to `payroll-staging` only; rule sets, interpretations, inputs, and exceptions remain empty |
| Staging payroll test fixture | [PHASE-1G-TEST-FIXTURE.md](./PHASE-1G-TEST-FIXTURE.md) | Applied to `payroll-staging` only; synthetic records are clearly labeled and must never be merged to production |

## Stop-ship findings

1. The payroll backend relations referenced by the UI are absent from production.
2. Production migration history and committed migrations have material drift; the repository cannot recreate the live schema as-is.
3. Compensation, classification, organization, schedule, leave balances, and statutory configuration are mutable current-state values, not effective-dated histories.
4. Raw time events can be updated or deleted by the employee who owns them, and employee deletion cascades into time, leave, OT, shift, and PAN history.
5. The biometric upload control fabricates random punches rather than parsing the selected file.
6. The routed payroll calculation runs in the browser, uses JavaScript floating-point numbers, hardcodes a divisor, ignores OT/holiday/night differential/statutory deductions, and writes one employee at a time.
7. “Lock,” “approve,” publish, and unpublish behaviors are UI state or mutable status updates; there is no immutable posted payroll.
8. Leave and offset credits use non-atomic balance overwrites instead of a ledger.
9. Payroll attachment and report access is not yet designed; existing leave and OT attachment policies expose every object in those buckets to any authenticated user.
10. There is no authoritative payroll result in Supabase to use as the reconciliation baseline.

## Required authorization gates

Do not begin production payroll DDL, authoritative payroll behavior, or calculation work until all of the following are signed off:

- HR, Finance, Legal/Compliance, Data Protection, and IT Security approve the policy decisions in the register.
- Finance approves the supplied closed-payroll baseline and its source extracts.
- Production migration drift is reconciled into a reproducible schema-only baseline.
- Prototype payroll generation, configuration save, final-pay approval, biometric import, and government-file generation are disabled or visibly marked non-production.
- A non-production Supabase branch or isolated project is available for migration rehearsal and anonymized reconciliation.
- The calculation acceptance suite and maker-checker authority matrix are approved.
- The worker-classification, legal-engagement, employment-status, and pay-basis vocabularies are approved before any employee crosswalk is loaded.

## Source authorities consulted

No statutory value is approved or embedded by this Phase 0 work. The register links the current official authority that must be captured with each approved rule version:

- [DOLE-BWC Workers' Statutory Monetary Benefits Handbook, 2024 edition](https://bwc.dole.gov.ph/wp-content/uploads/2024/10/Workers-Statutory-Monetary-Benefits-Handbook-2024-Edition.pdf)
- [DOLE Labor Code, Book III — Conditions of Employment](https://dole.gov.ph/book-3-conditions-of-employment/)
- [NWPC current regional wage information](https://nwpc.dole.gov.ph/)
- [BIR withholding-tax resources](https://www.bir.gov.ph/WithHoldingTax)
- [SSS official 2025 contribution schedule](https://www.sss.gov.ph/wp-content/uploads/2024/12/2025-SSS-Contribution-Table-rev.pdf)
- [PhilHealth employer payment and reporting procedures](https://www.philhealth.gov.ph/partners/employers/pay_procedures.php)
- [Pag-IBIG provident circulars](https://www.pagibigfund.gov.ph/circulars_provident.html)
- [National Privacy Commission Data Privacy Act IRR](https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/)
- [Supabase Row Level Security guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Database Linter guidance](https://supabase.com/docs/guides/database/database-linter)

These are authority starting points, not a substitute for TNG's legal review or the exact issuance effective for a specific employee, location, and earning date.
