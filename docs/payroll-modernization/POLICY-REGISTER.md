# Effective-Dated Payroll Policy and Rule Register

## 1. Register purpose

This is the Phase 0 discovery register. Every entry is `Draft`; no value in this document is an active payroll rule. Unknown values are intentionally `TBD` rather than inferred from prototype code.

The future system of record must store each approved row as an immutable version. Superseding a rule creates a new version and closes the prior version's effective range; it never overwrites the prior version.

## 1A. TNG policy inputs received on 2026-09-05

The following company-policy inputs were supplied for the payroll modernization design. They are captured as **Draft / awaiting formal HR, Finance, and applicable Legal approval**. They must not be activated by frontend defaults or hardcoded calculation logic.

### Payroll calendar

| Cutoff | Scheduled pay date | Example |
|---|---|---|
| 11th through 25th | 5th of the following month | 2026-08-11 through 2026-08-25 → 2026-09-05 |
| 26th through 10th | 20th of the month containing the 10th | 2026-08-26 through 2026-09-10 → 2026-09-20 |

The exact inclusive boundary, weekend/holiday movement rule, attendance-closing date, adjustment deadline, and bank-release cutoff remain to be confirmed. The payroll business timezone is `Asia/Manila`.

### Attendance, leave, overtime, and offset inputs

| Policy area | Captured company input | Still requiring explicit rule metadata |
|---|---|---|
| Tardiness | 5-minute grace period | Whether the grace affects attendance status, pay deduction, or both; rounding order; exceptions |
| Lunch break | 1-hour break; movable according to the prescribed schedule, targeted around the halfway point of the shift | Paid/unpaid treatment, actual-versus-scheduled handling, missed/extended-break treatment, and overnight/split-shift behavior |
| Leave credits | 5 VL and 5 SL | Leave-year basis, accrual/posting date, eligibility/proration, carryover, expiry, conversion, and insufficient-balance handling |
| Manager offsetting | Managers may offset only against extra hours worked on rest days and/or holidays | Legal/company eligibility, conversion rate, approval, expiry, use window, and whether the extra hours are payable or converted; no weekday offset and no accumulation of excess hours by day or week |
| Overtime | Minimum of 1 hour may be considered; fractions of 30 minutes thereafter may be considered | Whether less than 1 hour is ineligible or requires an exception, actual-time reconciliation, rounding, premium calculation, and approval deadline |

### HR and Finance payroll workflow

The required approval sequence is:

1. HR finalizes timekeeping records.
2. HR submits finalized timekeeping to Finance.
3. Finance prepares and encodes the Payroll Register (PR).
4. HR reviews and validates all payroll details.
5. HR endorses the payroll for approval.
6. HR authorizes the payroll.
7. Finance authorizes the payroll.
8. The Board of Directors gives final approval.
9. Finance processes payroll disbursement.
10. Payslips are generated and distributed to employees.

Each step must be represented by a durable status/approval record with actor, timestamp, reason, and the exact payroll snapshot or checksum approved. The same user must not perform incompatible maker/checker steps, and no user or role may be hardcoded as the only approver.

### Baseline sample status

The approved, closed payroll baseline package was received on 2026-09-05 through two uploaded workbooks (the workbooks are controlled evidence and are not copied into Git):

- Payroll Register: `SAMPLE PR for Aug 11 to 25, 2026 (09.05)(1).xlsx`
- Supporting attendance/DTR: `1_StandardReport THE DESSERT MUSEUM (AUGUST 11- 25, 2026)(1).xlsx`

Initial read-only validation confirms that both cover 2026-08-11 through 2026-08-25 and that the PR lists a 2026-09-05 payout date. The PR contains summary payroll, detailed inputs, deductions/contributions, timekeeping, and journal-entry tabs; the supporting workbook contains schedule, attendance, attendance-log, and exception reports. Employee-level and control-total reconciliation remains in progress. No row-level payroll data is stored in Git.

Initial quality findings requiring validation before the workbooks are used as calculation truth:

- Some auxiliary PR tabs contain broken `#REF!`/`#N/A` references.
- Some tabs contain mixed or legacy cutoff/date labels, including a legacy adjustment tab.
- The journal-entry view requires a formal tie-out to the PR summary and control totals.

## 2. Required record shape

Each rule version must contain all of the following:

| Field | Requirement |
|---|---|
| Rule identity | Stable rule ID, rule name, category, and description |
| Organizational scope | Legal entity; business unit; branch/worksite; wage region; department; cost center; payroll group; business timezone |
| Worker applicability | Employment status, worker classification, pay basis, legal engagement, and any explicit inclusion/exclusion criteria as separate dimensions |
| Effective range | Inclusive effective start date and exclusive effective end date, or an approved open end |
| Source | Official/internal document title, document version/date, URL or controlled attachment ID, page/section, and retrieval date |
| Version | Monotonic version, predecessor/successor reference, and change summary |
| Request | Requesting user ID, request timestamp, business reason, and ticket/change ID |
| Approval | Approving user ID, approval timestamp, authority/delegation ID, and approval note |
| Lifecycle | Exactly one of `Draft`, `Approved`, `Active`, `Superseded`, or `Archived` |
| Test evidence | Scenario-set version, expected results, test run ID, reviewer, and review date |
| Impact review | Compared payroll population, aggregate/per-employee deltas, exception list, Finance reviewer, and disposition |
| Calculation semantics | Input definitions, formula expression, calculation order, intermediate precision, rounding mode/scale/stage, output component, and legal/internal basis |

Database validity rules for Phase 1 design:

- no overlapping active effective ranges for the same rule/scope/applicability;
- an `Active` rule must be approved by a different user from its requester and last editor;
- source, test review, and impact review are mandatory before activation;
- an approved/active version is immutable except for controlled status transition;
- a payroll line stores the selected rule-version ID plus an immutable formula/input/result snapshot;
- an effective date is evaluated in the scoped payroll business timezone, defaulting to `Asia/Manila` only when an approved scope explicitly says so;
- retroactive official issuances create a new effective-dated version and a controlled impact assessment; they do not rewrite posted payroll.

## 3. Classification dimensions

These dimensions are deliberately independent. A worker can be, for example, `Regular` for employment status, `Rank-and-file` for worker classification, `Monthly-paid` for pay basis, and `Employee` for legal engagement.

| Dimension | Initial configurable values | Decision owner | Current-system issue |
|---|---|---|---|
| Employment status | Probationary; Regular; Project-based; Fixed-term; Part-time status where TNG treats it as status; other approved statuses | HR + Legal | Current values are Regular, Probationary, Contractual, or blank. |
| Worker classification | Rank-and-file; Supervisory; Managerial; Independent contractor classification where applicable; Other configurable classification | HR + Legal | No dedicated field; frontend single role is incorrectly used in some payroll filters. |
| Pay basis | Daily-paid; Monthly-paid; Part-time/hourly if approved; other approved basis | HR + Finance | Current `rate_type` is Daily, Monthly, or blank and is mutable. |
| Legal engagement | Employee; Independent contractor; Project contract; Fixed-term contract; other legally reviewed engagement | Legal + HR | “Contractual” is currently overloaded in employment status. |
| Organizational assignment | Legal entity; BU; branch/worksite; wage region; department; cost center; payroll group | HR + Finance | Only current BU/department/site fields exist; most required scopes do not. |

Classification changes require a new effective-dated assignment. UI/security roles such as Employee, Manager, HR, Finance, and Board are authorization concepts and must never determine pay eligibility by themselves.

## 4. Source-authority catalogue

These links are discovery sources to be validated by Legal/Finance for the exact earning date. Approved rule versions must attach the exact issuance and section used.

| Ref | Authority starting point | Intended rule families |
|---|---|---|
| SRC-DOLE-HANDBOOK | [DOLE-BWC Workers' Statutory Monetary Benefits Handbook, 2024 edition](https://bwc.dole.gov.ph/wp-content/uploads/2024/10/Workers-Statutory-Monetary-Benefits-Handbook-2024-Edition.pdf) | Hours of work, rest day, holiday, OT, night differential, service incentive leave, 13th month, retirement |
| SRC-LABOR-CODE | [DOLE Labor Code Book III](https://dole.gov.ph/book-3-conditions-of-employment/) | Conditions of employment and applicability/exclusions |
| SRC-WAGE | [NWPC current regional wage information](https://nwpc.dole.gov.ph/) and the exact regional wage order | Minimum wage and regional/worksite scope |
| SRC-HOLIDAY | Exact annual or special Presidential proclamation plus [Official Gazette](https://www.officialgazette.gov.ph/) and applicable DOLE advisory | Holiday date/type and pay treatment |
| SRC-BIR | [BIR withholding-tax resources](https://www.bir.gov.ph/WithHoldingTax), exact Revenue Regulation/RMC, form and validation package | Withholding, taxable base, exemptions, year-end adjustment, Alphalist |
| SRC-SSS | [SSS official 2025 contribution schedule](https://www.sss.gov.ph/wp-content/uploads/2024/12/2025-SSS-Contribution-Table-rev.pdf) and its superseding circular, if any | SSS/EC/mandatory provident contribution bases and shares |
| SRC-PHIC | [PhilHealth employer payment/reporting procedures](https://www.philhealth.gov.ph/partners/employers/pay_procedures.php) and linked current circular/table | PhilHealth base, floor/ceiling, shares, remittance |
| SRC-HDMF | [Pag-IBIG provident circulars](https://www.pagibigfund.gov.ph/circulars_provident.html), including the exact current circular | Membership savings base, cap, rates, shares, remittance |
| SRC-FINAL-PAY | [DOLE Labor Advisory No. 06-20 page](https://dole.gov.ph/news/labor-advisory-no-06-20-guidelines-on-the-payment-of-final-pay-and-issuance-of-certificate-of-emplo/) and exact attached issuance | Final-pay timing and scope |
| SRC-13TH | [DOLE Labor Advisory No. 23-22](https://bwc.dole.gov.ph/wp-content/uploads/2024/06/Labor-Advisory-No.-23-22-Guidelines-on-the-Payment-of-Thirteenth-Month-Pay.pdf) and applicable later advisory | 13th-month coverage, basis, deadline, report |
| SRC-PRIVACY | [Data Privacy Act](https://privacy.gov.ph/data-privacy-act/), [IRR](https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/), and exact NPC circular/advisory | Purpose, minimization, access, retention, disposal, security and data-subject handling |
| SRC-TNG | Controlled TNG policy, contract/CBA, board resolution, delegation, or signed employee authorization | Company-specific schedules, benefits, deductions, approvals, and enhancements |

## 5. Draft rule register

Common values for every row below unless explicitly stated:

- **Effective range:** `TBD — activation prohibited`
- **Version:** `D0`
- **Requester:** `Unassigned`
- **Approver/date:** `Unassigned / —`
- **Status:** `Draft`
- **Test/impact:** `Required before approval and activation`

### 5.1 Organizational scope

| ID | Rule | Scope/applicability decision | Source | Primary owner |
|---|---|---|---|---|
| ORG-001 | Legal employer | Map every worker and pay result to the registered employing entity; capture official names and agency registration identities | SRC-TNG + registrations | Finance + Legal |
| ORG-002 | Business unit | Map each existing BU to a legal employer and define whether a BU can cross employers | SRC-TNG | HR + Finance |
| ORG-003 | Branch/worksite | Define physical/remote worksite, geofence relevance, local holiday applicability, and transfer effectivity | SRC-TNG | HR Operations |
| ORG-004 | Wage region | Map worksite/worker arrangements to the legally approved regional wage order; define travel/remote exceptions | SRC-WAGE + Legal opinion | Legal + HR |
| ORG-005 | Department | Effective-date department assignment; define reporting versus costing use | SRC-TNG | HR |
| ORG-006 | Cost center | Define effective-dated cost allocation and split-cost rules | SRC-TNG | Finance |
| ORG-007 | Payroll group | Define population, frequency, calendar, bank/payment method, and legal entity per group | SRC-TNG | Payroll |
| ORG-008 | Business timezone | Approve `Asia/Manila` for payroll boundary calculations and document any site exception | SRC-TNG | Payroll + IT |

### 5.2 Worker coverage and compensation

| ID | Rule | Scope/applicability decision | Source | Primary owner |
|---|---|---|---|---|
| WRK-001 | Employment-status vocabulary | Define independent status values and transitions | Contract/policy + Legal | HR + Legal |
| WRK-002 | Rank-and-file classification | Define evidence and effectivity; separate from system role | SRC-LABOR-CODE + position evidence | HR + Legal |
| WRK-003 | Supervisory classification | Define evidence and treatment separately from managerial | SRC-LABOR-CODE + position evidence | HR + Legal |
| WRK-004 | Managerial classification | Define legal test, covered premiums, company enhancements, and offset eligibility | SRC-LABOR-CODE + Legal opinion | Legal |
| WRK-005 | Probationary/regular treatment | Define eligibility differences without conflating classification or pay basis | Contract/policy | HR + Legal |
| WRK-006 | Project-based/fixed-term treatment | Define engagement, end condition, benefit eligibility and final-pay treatment | Contract + Legal opinion | Legal + HR |
| WRK-007 | Part-time treatment | Define schedules, divisor/proration, statutory coverage, and leave accrual | Contract + authority | HR + Legal |
| WRK-008 | Independent contractor treatment | Exclude from employee payroll only on approved legal classification; define separate payment/reporting path | Contract + Legal/Tax opinion | Legal + Finance |
| WRK-009 | Daily-paid treatment | Define payable days, absences, holidays, rest days, premiums and divisor | SRC-DOLE-HANDBOOK + SRC-TNG | Payroll + Legal |
| WRK-010 | Monthly-paid treatment | Define inclusions, absence treatment, divisor, holidays, and proration | SRC-DOLE-HANDBOOK + SRC-TNG | Payroll + Legal |
| WRK-011 | Other classification | Controlled extension process; no free-text rule activation | Approved source | HR + Legal |
| COMP-001 | Compensation components | Define basic, allowance, de minimis, reimbursement, bonus, commission, premium, taxable and contribution bases | Contract/policy + SRC-BIR/agency sources | Finance + HR |
| COMP-002 | Compensation change | Effective start/end, source action, reason, maker/checker, no overlap, no overwrite | Contract/PAN/board approval | HR + Finance |
| COMP-003 | Currency and precision | Approve PHP scale, intermediate precision, rounding mode, and per-line/per-total rounding order | SRC-TNG + agency formats | Finance |
| COMP-004 | Minimum-wage validation | Validate the correct wage region/category and effectivity; define exception handling | SRC-WAGE | HR + Legal |

### 5.3 Payroll calendar and period controls

| ID | Rule | Scope/applicability decision | Source | Primary owner |
|---|---|---|---|---|
| CAL-001 | Payroll frequency | Weekly, semi-monthly, monthly, or other approved frequency by payroll group | SRC-TNG | Finance |
| CAL-002 | Cutoff start/end | Inclusive/exclusive boundary and Manila local-date semantics | SRC-TNG | Payroll |
| CAL-003 | Attendance-closing date | When attendance becomes calculation-ready and who may reopen it | SRC-TNG | HR Ops + Payroll |
| CAL-004 | Adjustment deadline | Cutoff for normal-run adjustments and treatment after deadline | SRC-TNG | Payroll |
| CAL-005 | Pay date | Scheduled date, weekend/holiday movement, and bank release cutoff | SRC-TNG + legal review | Finance |
| CAL-006 | Period state machine | Draft, collecting, attendance closed, calculating, reviewed, approved, posted, paid, reversed/voided semantics | SRC-TNG control policy | Finance + Internal Audit |
| CAL-007 | Reopen control | Reopen only before posting, with reason and independent approval; posted periods never reopen | SRC-TNG control policy | Finance + Internal Audit |
| CAL-008 | Off-cycle/supplemental/reissue | Define supplemental, adjustment, reversal, retro-pay, final-pay, and payment reissue lifecycles | SRC-TNG + legal review | Finance |

### 5.4 Work schedules and attendance interpretation

| ID | Rule | Scope/applicability decision | Source | Primary owner |
|---|---|---|---|---|
| TIME-001 | Workweek | Start/end, regular hours, day boundary, and employee applicability | SRC-LABOR-CODE + SRC-TNG | HR + Legal |
| TIME-002 | Scheduled workdays | Effective-dated recurring and exception schedules | SRC-TNG | HR Ops |
| TIME-003 | Overnight shifts | Attribute local work date, breaks, premiums, holidays, and cutoff crossing | SRC-DOLE-HANDBOOK + SRC-TNG | HR + Payroll |
| TIME-004 | Split/broken shifts | Pair segments, breaks, gaps, daily thresholds, and exception treatment | SRC-TNG + Legal opinion | HR + Legal |
| TIME-005 | Flexible shifts | Core hours, minimum hours, first/last event, and exception rules | SRC-TNG | HR |
| TIME-006 | Grace period | Eligibility and whether grace changes attendance status, pay, or both | SRC-TNG + Legal review | HR |
| TIME-007 | Time rounding | Increment, direction, symmetry, event/stage, and anti-bias validation | SRC-TNG + Legal review | HR + Legal |
| TIME-008 | Meal/break deductions | Paid/unpaid, actual versus scheduled, missed-break exception, and approval | SRC-LABOR-CODE + SRC-TNG | HR + Legal |
| TIME-009 | Tardiness | Scheduled reference, grace/rounding order, payable deduction formula, and disputes | SRC-TNG + Legal review | HR + Payroll |
| TIME-010 | Undertime | Scheduled reference, authorized/unauthorized treatment, deduction formula, and disputes | SRC-TNG + Legal review | HR + Payroll |
| TIME-011 | Rest day | Assignment, changes, work premium, OT interaction, and absence context | SRC-DOLE-HANDBOOK + SRC-TNG | HR + Legal |
| TIME-012 | Holiday calendar | Exact proclamation/local ordinance, type, location, date, source, and version | SRC-HOLIDAY | HR + Legal |
| TIME-013 | Holiday pay | Eligibility, absence adjacency, worked/unworked treatment, rest-day and OT combinations | SRC-DOLE-HANDBOOK + exact advisory | Legal + Payroll |
| TIME-014 | Night differential | Eligibility, local clock window, premium base, holiday/rest/OT stacking, and exclusions | SRC-DOLE-HANDBOOK | Legal + Payroll |
| TIME-015 | Raw-punch ingestion | Preserve original device event, source sequence, server receipt, checksum, timezone, and batch | SRC-TNG control policy | IT + Security |
| TIME-016 | Punch pairing | Deterministic pairing for multiple/missing/out-of-order events; never silently clip work | SRC-TNG + Legal review | HR Ops |
| TIME-017 | Attendance exception | Visible exception types, severity, owner, deadline, evidence, and resolution | SRC-TNG | HR Ops |
| TIME-018 | Attendance correction | Separate correction fact that supersedes interpretation without altering raw event | SRC-TNG control policy | HR Ops + Audit |
| TIME-019 | Correction deadline | Employee/manager filing deadline and post-close adjustment route | SRC-TNG + Legal review | HR |
| TIME-020 | Attendance finalization | Required exception resolution, reviewer, checksum, close, and controlled pre-post reopen | SRC-TNG control policy | HR Ops + Payroll |

### 5.5 Overtime and offset credits

| ID | Rule | Scope/applicability decision | Source | Primary owner |
|---|---|---|---|---|
| OT-001 | OT eligibility | Classification/engagement eligibility and explicit company enhancements | SRC-LABOR-CODE + SRC-TNG | Legal + HR |
| OT-002 | OT request/approval | Pre/post approval, thresholds, evidence, authority stages, deadline, and exception route | SRC-TNG + Legal review | HR |
| OT-003 | Requested/approved/worked/payable OT | Keep quantities separate; payable result reconciles approval to finalized attendance | SRC-TNG + Legal review | Payroll + HR |
| OT-004 | OT premium | Ordinary/rest/holiday/night combinations and calculation order | SRC-DOLE-HANDBOOK + exact advisory | Legal + Payroll |
| OT-005 | Managerial offset credits | Eligibility, earning formula, cap/expiry, use, conversion and legal basis | SRC-TNG + Legal opinion | Legal + HR |
| OT-006 | Offset conversion | Ledger transaction, idempotency, approval, formula/version, and no mutable balance overwrite | SRC-TNG | HR + Finance |
| OT-007 | Rejected/excess OT | Visible reason, dispute/exception workflow, and no silent rejection or clipping | SRC-TNG + Legal review | HR |

### 5.6 Leave

| ID | Rule | Scope/applicability decision | Source | Primary owner |
|---|---|---|---|---|
| LEAVE-001 | Leave-type catalog | Statutory/company type, units, eligibility, paid/unpaid, and payroll component mapping | Authority + SRC-TNG | HR + Legal |
| LEAVE-002 | Accrual | Frequency, service threshold, proration, earning base, and posting date | Authority + SRC-TNG | HR |
| LEAVE-003 | Carryover | Eligible balance, cap, carry date, and scoped exceptions | Authority + SRC-TNG | HR + Legal |
| LEAVE-004 | Forfeiture | Trigger, notice, exception, legal/contract basis, and ledger transaction | Authority + SRC-TNG | Legal + HR |
| LEAVE-005 | Conversion | Eligible type/balance, rate, timing, tax/contribution treatment, and approval | Authority + SRC-TNG | Legal + Finance |
| LEAVE-006 | Exhaustion order | Paid balance order, partial day, unpaid remainder, employee notice, and exception | SRC-TNG + Legal review | HR |
| LEAVE-007 | Negative balance | Whether allowed, limit, recovery, final-pay treatment, and consent | SRC-TNG + Legal review | HR + Legal |
| LEAVE-008 | Leave approval | Authority, supporting evidence, effective status, cancellation, and payroll close interaction | SRC-TNG | HR |
| LEAVE-009 | Attendance interaction | Scheduled-day validation, holidays/rest days, overlapping requests, and visible exceptions | SRC-TNG + Legal review | HR |
| LEAVE-010 | Balance ledger | Accrual, use, reversal, expiry, conversion, opening balance and adjustment as immutable entries | SRC-TNG control policy | HR + Internal Audit |

### 5.7 Earnings, deductions, tax and contributions

| ID | Rule | Scope/applicability decision | Source | Primary owner |
|---|---|---|---|---|
| PAY-001 | Salary divisor | Divisor by pay basis/schedule/classification; source and effectivity | SRC-TNG + legal review | Finance + Legal |
| PAY-002 | Proration | Hire, separation, unpaid absence, pay change, schedule change, transfer, and partial period | SRC-TNG + legal review | Finance |
| PAY-003 | Regular pay | Daily/monthly treatment and finalized-attendance inputs | SRC-TNG + authority | Finance |
| PAY-004 | Allowances/reimbursements | Eligibility, recurrence, proration, evidence, taxable/contribution treatment | Contract/policy + agency sources | Finance + HR |
| PAY-005 | 13th-month pay | Coverage, earned-basic basis, exclusions/enhancements, period, prior paid amount, rounding and reporting | SRC-13TH + contract/CBA | Legal + Finance |
| PAY-006 | SSS/EC/provident contribution | Exact official schedule, base, floor/ceiling, shares, frequency, rounding and special cases | SRC-SSS | Finance/Payroll |
| PAY-007 | PhilHealth contribution | Exact current circular/table, base, floor/ceiling, shares, frequency and rounding | SRC-PHIC | Finance/Payroll |
| PAY-008 | Pag-IBIG contribution | Exact current circular, base/cap, mandatory/voluntary shares, frequency and rounding | SRC-HDMF | Finance/Payroll |
| PAY-009 | Withholding tax | Exact table/version, taxable base, payroll frequency conversion, prior-period/YTD inputs, exemptions and rounding | SRC-BIR | Tax + Finance |
| PAY-010 | Tax-exemption limits | Benefit/component limit, aggregation period, excess treatment, source and effectivity | SRC-BIR | Tax |
| PAY-011 | Year-end adjustment | Annualization, previous-employer inputs, refund/collection, terminated workers and reporting | SRC-BIR | Tax + Finance |
| DED-001 | Deduction catalog | Statutory, loan, benefit, accountability, court/order, and voluntary categories | Authority + SRC-TNG | Finance + Legal |
| DED-002 | Deduction authorization | Required legal basis/consent/order, attachment, effective range, amount/cap and revocation | Exact authority/authorization | Legal + Finance |
| DED-003 | Deduction priority | Statutory and company priority; arrears/carry-forward behavior | Authority + SRC-TNG | Finance + Legal |
| DED-004 | Minimum net pay | Protected amount/percentage, exception, partial deduction, arrears and notice | Legal opinion + SRC-TNG | Legal + Finance |
| DED-005 | Accountabilities | Evidence, employee notice/consent or other lawful basis, dispute, cap, approval and final-pay interaction | Exact authority + SRC-TNG | Legal + HR |
| DED-006 | Loans | Principal/interest schedule, balance source, payroll deduction, missed deduction and final-pay treatment | Loan agreement/policy | Finance |

### 5.8 Final pay, approvals, reporting and privacy

| ID | Rule | Scope/applicability decision | Source | Primary owner |
|---|---|---|---|---|
| FINAL-001 | Final-pay trigger/timeline | Separation event, required clearance inputs, calculation date, release deadline and exception | SRC-FINAL-PAY + SRC-TNG | HR + Legal |
| FINAL-002 | Final-pay components | Unpaid wages, prorated 13th month, leave conversion, separation/retirement pay, deductions and other approved items | Exact authority + contract/policy | Legal + Finance |
| FINAL-003 | Final-pay approval/release | Maker, checker, approver, employee statement, payment, reissue, dispute and evidence | SRC-TNG control policy | Finance + HR |
| CTRL-001 | Payroll approval matrix | Prepare, calculate, review, approve, post, bank release and GL-post authorities by scope/threshold | Board delegation + SRC-TNG | Finance + Internal Audit |
| CTRL-002 | Maker-checker | Prohibit requester/editor/preparer from self-approving; enforce by user ID, not only role | SRC-TNG control policy | Internal Audit + Security |
| CTRL-003 | Emergency delegation | Named delegate, scope, start/end, reason, approver, MFA and retrospective review | Board delegation | Internal Audit + Security |
| CTRL-004 | Closed-period correction | Adjustment, reversal, retro-pay, supplemental, final-pay and reissue transaction rules; never in-place change | SRC-TNG control policy | Finance |
| CTRL-005 | Payment control | Bank file generation, checksum, dual release, returned payment and reissue without changing posted net pay | Bank agreement + SRC-TNG | Treasury + Finance |
| CTRL-006 | GL control | Effective-dated account/cost mapping, balanced journal, posting reference and reconciliation | Finance policy | Finance |
| GOV-001 | Government reporting matrix | Agency/form, legal entity, population, frequency, due date, format/schema version, signer and proof of filing | Exact agency issuance | Finance/Tax |
| GOV-002 | Report snapshot | Generate only from posted payroll and immutable employee/legal-entity snapshots | SRC-TNG control policy | Finance + Audit |
| GOV-003 | Remittance reconciliation | Employee/employer totals, payroll-to-report-to-payment tie-out, exceptions and sign-off | Agency source + SRC-TNG | Finance |
| DATA-001 | Record retention | Record class, statutory/business period, legal hold, archive, disposal and review cadence | SRC-PRIVACY + exact retention authority | DPO + Legal |
| DATA-002 | Payroll privacy/access | Purpose, least privilege, field/row scope, download control, masking, session/MFA and access review | SRC-PRIVACY | DPO + Security |
| DATA-003 | Biometric/GPS/photo processing | Necessity, proportionality, notice, consent/other basis, alternatives, retention and processor controls | SRC-PRIVACY + legal review | DPO + Legal |
| DATA-004 | Data-subject and correction rights | Access/correction request, identity verification, response, dispute and audit trail without rewriting posted payroll | SRC-PRIVACY | DPO + HR |
| DATA-005 | Incident and breach response | Detection, containment, assessment, notification, evidence preservation and regulator handling | SRC-PRIVACY + incident plan | DPO + Security |

## 6. Required test-scenario register

Policy approval must include concrete inputs and expected results. At minimum, Finance/HR/Legal must supply examples for:

| Scenario family | Minimum cases |
|---|---|
| Calendar | each payroll group; leap day; month/year boundary; weekend/holiday pay-date movement; Manila cutoff boundary |
| Compensation | hire/separation mid-period; salary change on cutoff; retroactive change; daily/monthly/part-time; transfer across legal entity/region |
| Attendance | on time; late/undertime; missing/duplicate/out-of-order punches; manual correction; paid/unpaid break; overnight; split; flexible; rest day; cross-cutoff shift |
| Holiday/premium | unworked/worked regular and special holidays; rest-day combination; OT; night differential; consecutive/double holiday where applicable |
| OT | requested below/above worked; partial approval; rejected exception; post-approved; paid versus offset; managerial rules |
| Leave | paid/unpaid; partial day; overlap; insufficient balance; negative disallowed/allowed; accrual/carry/expiry/conversion/reversal; post-close approval |
| Contributions | every bracket boundary, below floor, above ceiling, zero/negative correction, multiple payrolls in a month, mid-period hire/separation |
| Tax | every threshold, non-taxable limits, YTD adjustment/refund/collection, previous-employer input, termination, rounding boundary |
| Deductions | priority conflict, insufficient net, arrears, lawful accountability dispute, loan payoff, reversal |
| Close/correction | retry/idempotency; duplicate command; lock; post; forbidden in-place edit; reversal; retro; supplemental; payment return/reissue |
| Security | every payroll role/scope; own payslip only; BU/legal-entity isolation; maker self-approval denied; expired delegation; attachment/download access |
| Reports | payroll totals tie to payslips, agency file, remittance, bank file and GL; schema validation and reproducible checksum |

## 7. Draft maker-checker matrix

Role names are placeholders for duties, not assignments to existing TNG roles.

| Critical action | Maker | Checker/approver | Enforced separation |
|---|---|---|---|
| Create/change policy rule | Policy editor | Authorized policy approver | Different user; approver must have valid scoped authority |
| Activate policy version | Release maker | Policy owner + Finance impact reviewer | Activator cannot be requester, editor, tester, or sole impact reviewer |
| Correct/finalize attendance | Timekeeper/manager | HR time approver | Employee cannot approve own correction; no raw punch change |
| Prepare payroll | Payroll preparer | Payroll reviewer | Different users; frozen input snapshot |
| Approve payroll | Payroll reviewer submits | Authorized Finance approver | Approver cannot have prepared or edited the run |
| Post payroll | Approved run | Posting authority | Only exact approved checksum may post |
| Release bank payment | Treasury maker | Treasury releaser | Dual control; neither can alter payroll result |
| Closed-period correction | Adjustment maker | Independent payroll approver | References original line; creates new transaction |
| Final pay | HR/Payroll maker | Authorized Finance/HR checker per matrix | Employee/accountability disputes visible; no self-approval |
| Government filing | Report maker | Authorized signer | File checksum and posted-run reconciliation required |

## 8. Register sign-off

Required signatories before any row becomes `Active`:

- HR policy owner
- Payroll/Finance owner
- Legal/Tax reviewer as applicable
- Data Protection Officer for personal-data rules
- Information Security for access and critical-action controls
- Internal Audit/Control owner for segregation and reconciliation
- Engineering owner confirming implemented rule/version and automated test evidence

Approval of this Markdown document alone does not activate a rule. Activation must occur through the future controlled rule-version workflow and be tied to an approved release.
