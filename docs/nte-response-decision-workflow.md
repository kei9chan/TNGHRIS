# NTE receipt, response and Notice of Decision workflow

This change starts a five-calendar-day response period from documented receipt, ending at 11:59 PM Philippine time on the fifth day after receipt. Drafting and issuance do not establish receipt. Historical notices are not automatically acknowledged or marked as non-responsive.

## Employee experience

The issued NTE page includes acknowledgment and a written explanation form. The employee may attach one PDF, JPG, PNG or DOCX up to 5 MiB, and/or provide an HTTPS document link. Linked documents require the recipient's sharing permission; their remote file size is not verified. Submission requires a signature. The database records server time, checks recipient identity and the deadline, and rejects duplicate submissions.

Draft/pending NTEs are unavailable to their recipients. The employee NTE context returns a restricted incident summary, not the original incident report or internal discussion. Being named in an IR no longer grants access to its original record; the original reporter retains access to their own report.

## Deadline automation

The minute-based cron job sends in-app receipt/deadline notifications, generates the approved non-submission wording when appropriate, and creates one undetermined decision draft per NTE after its response period closes. It never chooses a finding or penalty. Notifications and case events are retained in an append-only audit table. Existing email approval digests remain separate; this change does not claim email delivery.

## Decisions and implementation

HR/Admin completes facts, evidence, explanation/non-submission, allegation findings, policy, circumstances, reasons, decision and effectivity. The initial required approvers are copied from the NTE's completed required approving hierarchy, including BOD. Every approver must approve before issuance. The server locks the issued decision and assigns its NOD reference. Employee receipt and documented valid service are recorded separately from authorization to deduct.

Suspensions support Scheduled or TBA. TBA remains pending implementation. HR sends a confirmed schedule and records all actual days served and return-to-work date before closing. Progress is displayed from the schedule; reaching a calendar date alone does not confirm days served.

Salary deductions generate an ATD only after the employee acknowledges the decision. Signing the ATD, HR verification, and independent scoped Finance approval are separate actions. Finance opens the signed/HR-verified ATDs in Take-home Pay Review and adds an authorized installment to its reviewed inputs. Existing payroll calculations and approval/payment routing remain in place. Additional database guards validate the ATD before saving a payroll review and posting the actual disbursement. Duplicate cutoff deductions and over-authorized amounts are rejected. A returned payment reopens the case for HR/Finance reconciliation and blocks further automatic deductions.

## Deployment gates and verification

- `tests/nteLifecycleStaging.sql`: staging-only rollback fixtures covering receipt, five-day deadline, response/duplicate/IDOR, no-response routing, draft idempotency, approval, suspension and ATD signature/HR verification.
- `tests/nteRlsStaging.sql`: actual authenticated-role table/RPC checks for draft access, original IR access and direct resolution writes.
- `tests/nteWorkflowTest.mjs`: upload size/type boundaries, HTTPS links and Philippine deadline rendering.
- Existing NTE multi-approver and mobile review smoke tests and production Vite build.
- The ATD monetary validator was exercised with an isolated temporary posting table in staging. A full payroll payment cycle has not been exercised: staging lacks the newer production payroll tables.
- An interactive local browser check could not run because the browser rejected the local test URL. No live employee response or signature was simulated.
- Automatic approval review rejected both the production migration and source upload to `kei9chan/TNGHRIS`. A branch was created, but no source upload or PR was completed. Explicit approval of that destination and production deployment is required. No production receipt, response, decision or deduction records have been created by these tests.

Applied production migrations: `supabase/migrations/20260908111156_nte_receipt_response_decision_workflow.sql`, `supabase/migrations/20260908111258_nte_payroll_atd_guards.sql`, and `supabase/migrations/20260908113032_harden_nte_policy_helper_execution.sql`. They were applied in that order and verified before the accompanying application release. Do not deploy the UI to an environment that lacks all three migrations.

The payroll migration requires the existing net-review, approval, disbursement and payment-events tables. Do not enable the ATD UI against a database without that migration. Legacy notices containing old printed deadlines require HR review; their approved document bodies are not silently rewritten.
