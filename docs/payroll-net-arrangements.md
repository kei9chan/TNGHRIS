# Net arrangements — approved production engine

Explicit approval received to apply the production engine changes and publish their source to kei9chan/TNGHRIS. Applied as migration 20260908070609_payroll_net_arrangements_single_row_import.

The SQL preserves existing access gates, updates no employee pay records, and keeps existing gross-only source hashes unchanged. No roles, permissions, RLS, approval order, loan balances or processing switches are changed.

The UI and importer use `NET_ARRANGEMENTS_LIVE=true` after production migration and arithmetic verification. Custom rows can be saved as drafts but cannot be approved until resolved to a supported arrangement. Tax requests never automatically grant exemption.

## Semantics

- Gross: existing calculation.
- Net / tax only: company-funded taxable top-up reaches the reviewed cutoff target before employee statutory shares and other deductions.
- Net / all employee shares: top-up reaches the reviewed cutoff target after withholding and employee statutory shares, before loans and other deductions.
- The target is a minimum guarantee: existing earned gross is never reduced.
- Approved HRIS/PAN basic salary stays unchanged. The net target is a separate agreement term in the package's amount unit. Finance confirms cutoff allocation, attendance adjustments, allowance inclusion and a source reference.
- Final MONTHLY SSS/PhilHealth/Pag-IBIG bases, including applicable gross-up treatment, are explicitly Finance-reviewed, not inferred from a guessed monthly multiplier. The solver uses those bases. Changing bases requires another calculation.
- Top-up is standard taxable regular compensation. FBT, contractor withholding, mixed arrangements in a cutoff, and custom rules require separate review.
- Tax exemption requests retain unreviewed treatment until the existing HR/Finance workflow classifies each taxable/exempt portion with actual evidence and applicable limits.
- Total company payroll cost = gross (including top-up) + employer statutory contributions. Withholding and employee shares are already inside gross, not added twice.

## Verification

- `node tests/payPackageImportTest.mjs`: single-row values, old normalization, exact headers, dropdowns/freeze panes, sample separation, custom allowance names, source/scope/date/duplicate rules, net metadata, exemption evidence, live feature guards.
- `node tests/payrollPhase5Workbook.mjs`: Finance workbook round-trip and rejection guards.
- `tests/payrollNetArrangement.sql`: pure JSON tax-only/all-share fixtures, taxable top-up, employer-cost reconciliation, loans separate, missing-base confirmation, mode mismatch, exemption evidence.
- `tests/payrollPhase5Arithmetic.sql`: existing gross/net, monthly EE/ER allocation, tax brackets, prior cutoffs/YTD, loan caps and deferrals passed against the proposed functions in a rolled-back transaction.
- Vite production build passes. No live payroll records were created by these tests.

## Sources

- https://bir-cdn.bir.gov.ph/local/pdf/Annex%20E%20RR%2011-2018.pdf
- https://bir-cdn.bir.gov.ph/local/pdf/Digest%20RR%2011-2018.pdf
- https://www.sss.gov.ph/sss-contribution-table/
- https://www.philhealth.gov.ph/partners/employers/pay_procedures.php

## Template maintenance

Run `scripts/build-pay-package-template.mjs OUTPUT_DIR` with the primary runtime's Node from a temporary directory with artifact-tool available; then run `python3 scripts/normalize-pay-template.py OUTPUT_DIR/Pay-Packages-Batch-Template.xlsx`. Copy the validated output to `public/templates/Pay-Packages-Batch-Template.xlsx`.
