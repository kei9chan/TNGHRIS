# Baseline Payroll and Reconciliation Plan

## 1. Baseline status

**Authoritative payroll baseline: BLOCKED — not present in Supabase and not supplied with the repository.**

This is a Phase 0 evidence finding, not a failure to calculate. The live database has zero raw time events, zero interpreted attendance records, and no payroll run/payslip/result tables. Running the prototype would produce an incomplete browser calculation and would not be a valid baseline.

The available technical baseline is:

| Metric | 2026-09-04 observation |
|---|---:|
| HRIS users | 150 |
| Active HRIS users | 144 |
| Missing rate type/amount | 24 / 24 |
| Missing basic salary | 24 |
| Missing tax status | 24 |
| Raw time events | 0 |
| Interpreted attendance records | 0 |
| Attendance exceptions | 0 |
| Approved OT without usable hours | 64 |
| Existing payroll run/result/payslip rows | Not applicable; relations absent |

Finance must provide an approved closed-payroll package before Phase 0 sign-off and before any parallel-run result can be judged correct.

## 2. Baseline selection

Finance, HR and Internal Audit should select:

1. the most recent fully closed, paid, reported and GL-posted regular payroll whose source files can be reproduced;
2. at least one additional regular period containing representative edge cases;
3. an off-cycle/final-pay/retro period if those transaction types are in the pilot scope;
4. workers across each legal entity, payroll group, wage region, pay basis, worker classification, shift pattern, leave/OT case and material earning/deduction type.

The chosen baseline must not be silently “cleaned.” If the legacy payroll contains a known correction, preserve the originally posted result plus its actual adjustment/reversal/reissue and disposition.

## 3. Required evidence package

| Evidence | Required content | Owner |
|---|---|---|
| Approval cover | payroll ID/period, legal entity/group, preparer, reviewer, approver, posted/paid dates and sign-off | Finance/Internal Audit |
| Payroll calendar | cutoff, attendance close, adjustment deadline, pay date and timezone | Payroll |
| Employee population | stable HRIS/external key, status/classification/pay basis/legal entity/group effective for period | HR |
| Compensation input | effective-dated basic/components and source action/contract/PAN | HR + Finance |
| Schedule/time source | schedules, raw device extract, interpreted DTR, corrections, finalization and exceptions | HR Ops |
| Leave/OT source | requests, approval history, approved/worked/payable quantities, conversion/offset entries | HR Ops |
| Earning lines | component code, units/rate/base/formula reference, amount and taxable/contribution classifications | Payroll |
| Deduction lines | component code, base/reference, statutory/voluntary/accountability authority and amount | Payroll |
| Employee results | gross, each contribution, taxable income, withholding, total deductions and net pay | Payroll |
| Payslip artifact | employee-facing result version and publication date | Payroll |
| Government outputs | SSS/EC, PhilHealth, Pag-IBIG, BIR and other applicable report/remittance evidence | Finance/Tax |
| Bank/payment | approved bank file/control total, release evidence, rejects/returns/reissues | Treasury |
| General ledger | balanced journal, account/cost allocation and posting reference | Finance |
| Adjustments | original reference, reason, new transaction, approval and payment/report impact | Payroll/Internal Audit |
| Rule sources | exact policies, official tables, formulas, rounding and effectivity used by the baseline | HR/Finance/Legal |

Original exports should be retained unmodified. Normalized copies used for comparison must identify their transform version and source checksum.

## 4. Secure intake and manifest

Payroll files contain sensitive personal and financial data. They must not be committed to Git or placed in a general shared folder.

For each received file:

- record a baseline ID, evidence type, source system, exact period and legal entity/payroll group;
- record original filename, media type, byte size, row count where applicable, source timezone and export timestamp;
- calculate SHA-256 before transformation;
- record provider and authorized recipient;
- store in an access-controlled, logged location approved by the DPO;
- tokenize or mask government IDs and bank accounts in test copies;
- keep a key map only in an independently controlled secure location;
- record retention and disposal date/condition plus legal hold status.

The companion [baseline-manifest-template.csv](./baseline-manifest-template.csv) contains the header only. Do not place production values in the repository copy.

## 5. Canonical comparison data

Normalize the baseline into three levels while retaining the source pointer:

1. **Run control:** period, population count, currency, gross, deductions, employer costs, net, payment, report, and GL totals.
2. **Employee result:** one row per payroll run/employee/result version.
3. **Component line:** one row per earning, deduction, contribution, tax, employer cost, adjustment or informational line.

The non-sensitive headers are provided in [baseline-employee-results-template.csv](./baseline-employee-results-template.csv) and [baseline-component-lines-template.csv](./baseline-component-lines-template.csv).

Recommended canonical identifiers:

- `baseline_id`
- `source_file_sha256`
- `source_row_or_record_id`
- `legal_entity_key`
- `payroll_group_key`
- `period_start_local`, `period_end_local`, `pay_date_local`
- `employee_external_key` and mapped `hris_user_id`
- `result_type` and `original_result_reference`
- `component_code`, `component_kind`, `units`, `rate`, `base_amount`, `amount`
- `currency`
- `formula_or_rule_reference`
- `posted_at`, `paid_at`, `reporting_reference`

All money/rate fields must be parsed into exact decimals; never compare binary floating-point output. The transform must reject malformed or duplicate keys and emit an exception file rather than coercing to zero.

## 6. Control totals

Control totals are calculated independently from both the original baseline and the new engine.

| Domain | Required controls |
|---|---|
| Population | expected, included, excluded, added, terminated, unmatched and duplicate employees |
| Time | scheduled/worked/regular/OT/night/holiday/rest/leave/unpaid hours or days by approved unit |
| Earnings | basic and every component; gross and taxable/contribution bases |
| Deductions | each statutory contribution, withholding, loan/accountability/voluntary deduction and arrears |
| Employer costs | each employer contribution/cost component |
| Net/payment | net pay, zero/negative/on-hold results, payment count/total, rejected/returned/reissued amounts |
| Government | report population and totals by agency/form/legal entity/period |
| GL | debit/credit equality and payroll-to-journal component/cost-center mapping |

The companion [baseline-control-totals-template.csv](./baseline-control-totals-template.csv) defines a non-sensitive header.

## 7. Reconciliation procedure

1. Verify baseline approval and every source checksum.
2. Validate the employee-key crosswalk; no fuzzy/name-only match is allowed without explicit human disposition.
3. Reconcile baseline population to the new run population before comparing money.
4. Reconcile effective-dated inputs: employer, group, classification, pay basis, compensation, schedule and rules.
5. Reconcile source time/leave/OT and exception outcomes.
6. Compare component lines by stable component and original-reference keys.
7. Compare employee gross, statutory bases/shares, tax, deductions, employer cost and net.
8. Compare run control totals.
9. Reconcile payslip, bank, government and GL artifacts to the exact posted run checksum.
10. Classify every delta, assign an owner and attach evidence.
11. Re-run from the same frozen input snapshot and prove byte-/value-equivalent results where the output format permits.
12. Obtain Finance, HR, Legal/Tax, Internal Audit and Engineering sign-off.

For every numeric comparison:

`delta = new_engine_amount - approved_baseline_amount`

The report stores both amounts, exact decimal delta, relative delta where meaningful, status, cause code, owner, evidence, and disposition. No tolerance is approved in Phase 0. Finance must approve line/employee/run tolerances after reviewing each rule's rounding semantics; a tolerance must never hide an unexplained net-pay difference.

## 8. Delta classification

| Code | Meaning | Allowed disposition |
|---|---|---|
| POPULATION | employee included/excluded/mapped differently | HR/Finance resolves scope/effectivity |
| SOURCE_DATA | baseline/new source differs or is incomplete | source owner corrects through traceable source transaction |
| POLICY | approved rule interpretation differs | Legal/HR/Finance decides and versions the rule |
| EFFECTIVITY | correct rule/version chosen for different date/scope | correct assignment/rule selection; preserve evidence |
| ROUNDING | same rule but different approved rounding stage/mode | approve one rule and update tests; do not force value |
| TIMING | item belongs to a different regular/off-cycle period | document adjustment/supplemental treatment |
| CONFIG | wrong component mapping, base, ceiling/floor or report schema | correct configuration through maker-checker |
| ENGINE_DEFECT | implementation deviates from approved rule | fix code and create a new run; never edit result lines |
| BASELINE_ERROR | approved legacy result was wrong | preserve it; create/recognize actual correction path |
| UNEXPLAINED | no evidenced cause | cutover blocker |

## 9. Acceptance and cutover gates

A parallel run passes only when:

- population is completely mapped or explicitly approved as excluded;
- every difference has an evidence-backed classification and disposition;
- no unexplained employee net-pay delta remains;
- control totals meet Finance-approved tolerances;
- government, payment and GL outputs reconcile to the same posted result snapshot;
- retrying the run with the same command/input checksum creates no duplicate and produces the same result;
- role/security tests prove only authorized reviewers see baseline and result data;
- reviewers sign the exact run, rule package, input checksum and result checksum.

The number of consecutive parallel cycles and the quantitative tolerances remain `TBD` policy decisions. One successful happy-path run is insufficient.

## 10. Baseline handoff checklist

- [ ] Baseline period(s) and population approved
- [ ] Secure location/DPO handling approved
- [ ] All evidence files received and hashed
- [ ] Payroll approval/posting/payment evidence received
- [ ] Employee crosswalk approved
- [ ] Component mapping approved
- [ ] Rule sources and rounding documented
- [ ] Baseline line and control totals independently recalculated
- [ ] Known corrections/adjustments preserved
- [ ] Government, bank and GL totals tied out
- [ ] Exception and data-gap log assigned
- [ ] Finance and Internal Audit baseline sign-off attached

Until every required item is complete, the new engine may run only with synthetic or approved anonymized test data—not as an authoritative payroll.
