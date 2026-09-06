# Phase 5 statutory source review — September 6, 2026

Rule identifier: `PH-2026-09-06`; engine `net-ph-2026-v1`. Applicability is deliberately
bounded to covered employee payments January 6–December 31, 2026. No BU has been
activated. Finance must approve applicability, actual payday/contribution month,
monthly bases, coverage and tax/benefit treatment before an internal calculation.

| Source | Implemented interpretation |
| --- | --- |
| [SSS Circular 2024-006 employer/employee schedule](https://www.sss.gov.ph/wp-content/uploads/2024/12/Cir-2024-006-Employers-scaled.jpg), linked by the [current SSS contribution page](https://www.sss.gov.ph/sss-contribution-table/) | Monthly salary credit brackets 5,000–35,000 in steps of 500; first boundary 5,250. Employee 5%, employer 10%. Regular SS capped at MSC 20,000; excess is separately explained as MPF. Employer EC 10 below MSC 15,000, otherwise 30. Effective January 2025. |
| [PhilHealth Circular 2019-0009](https://www.philhealth.gov.ph/circulars/2019/circ2019-0009.pdf), [published contribution table](https://www.philhealth.gov.ph/partners/employers/ContributionTable_v2.pdf), [government report of PhilHealth's May 2026 confirmation](https://pia.gov.ph/news/philhealth-sets-5-premium-contribution-rate-for-2026/) | Premium 5% of reviewed monthly basic salary, floor 10,000 and ceiling 100,000; equal employer/employee shares. Monthly basic must be reviewed separately from cutoff gross, OT and allowances. |
| [DBM Circular Letter 2024-2 implementing HDMF Circular 460](https://www.dbm.gov.ph/wp-content/uploads/Issuances/2024/Circular-Letter/CIRCULAR-LETTER-NO-2024-2-DATED-FEBRUARY-01-2024.pdf) | Maximum Fund Salary 10,000 effective February 2024; employee 1% at monthly compensation up to 1,500 and 2% above, employer 2%. Only the mandatory share enters the statutory deduction; voluntary savings need separate authorization. |
| [BIR RR 11-2018 Annex E](https://bir-cdn.bir.gov.ph/local/pdf/Annex%20E%20RR%2011-2018.pdf), [RR 11-2018 section 2.79](https://bir-cdn.bir.gov.ph/local/pdf/RR%20No.%2011-2018.pdf) | Semi-monthly table effective January 2023 onwards; regular bracket plus ordinary supplementary compensation. Cumulative average applies to previous-employer cases and specified supplementary-pay conditions, and remains in force through the linked tax-year chain. Mandatory employee contributions reduce taxable compensation once; employer costs and loans do not. |
| [BIR RR 29-2025](https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%2029-2025.pdf) | Current benefit-limit source for Finance's reviewed allocation. The engine does not infer a blanket exemption from a legacy de minimis/reimbursable field or label. Finance records each gross line's taxable portion and references the applicable category, limit and prior usage for its exempt portion. |

## Company review still required

* SSS, PhilHealth and Pag-IBIG monthly bases and any coverage exclusions require
  approved records. The engine does not substitute cutoff gross for these bases.
* Finance chooses first-cutoff allocation of 0%, 50% or 100% for each agency;
  the second cutoff deducts monthly due less the recorded/imported first cutoff.
  Employee and employer shares reconcile separately. Prior over-deduction blocks
  calculation pending correction. A contribution-month slot cannot be reused by
  another cutoff, and a saved first cutoff must be linked when it exists.
* Tax allocation is reviewed line by line in a batch workbook. Approved Phase 2
  included/excluded treatment is enforced; unreviewed package tax treatment blocks
  calculation. `rule_defined` permits a documented partial taxable amount.
  Exemption evidence must address MWE qualification where applicable, reimbursement
  substantiation, benefit categories/caps and prior-year-to-date usage. Automated
  de minimis-category cap inference and fringe-benefit-tax processing are not claimed.
* Approved midyear openings include taxable income, withholding, prior semi-monthly
  periods and previous-employer/cumulative-method status. References must cover
  benefit usage and deduction/loan completeness. Linked cutoffs carry YTD and
  projected loan deductions; a new tax year requires a separately reviewed opening.
* Loan balances are immutable, authorized opening/reconciliation versions with
  dates, installment, predecessor and source. A shadow run projects deductions
  since the latest applicable opening date, capped at the available balance.
  It never posts a real loan payment. External payments must be reconciled into a
  new actual balance before a subsequent shadow comparison.
* Insufficient-net policy is explicit: block, or defer authorized loans/deductions.
  Statutory amounts exceeding gross always block. Deferral priority is statutory
  deductions, loan account order, then other deductions in reviewed worksheet order.
* Annual settlement/refunds, 13th-month, linked monetary corrections, final pay,
  fringe-benefit-tax cases and separate professional fees require the later or
  separate reviewed stream. No released payslip, bank payment or filing is created.

Amounts use PostgreSQL numeric and explicit cent rounding. Browser/workbook code
displays or imports decimal strings and does not calculate payroll money.
