# Phase 5 and on-call routing — release status

September 6, 2026. The user explicitly approved publishing to the existing public
[kei9chan/TNGHRIS](https://github.com/kei9chan/TNGHRIS) main and applying the on-call repair.
The earlier automatic review blocks are resolved. Verify this release's production
deployment reaches READY before reporting the frontend live.

| Item | Status |
| --- | --- |
| Phase 5 database | Applied: `20260906043821_payroll_net_phase5`, `20260906044348_payroll_net_review_guards` |
| Take-home Pay Review frontend | Included in this release at `/payroll/net-pay` |
| Calculation and workbook checks | Passed; fixtures only |
| Read-only access checks | Passed; management alone cannot access salary work |
| Actual staff acceptance | Waiting for assigned duties and reviewed sources |
| Team checklist | Software Phases 1–5 implemented; no team task marked done without evidence |
| Processing | All nine scopes off; no Phase 5 review, loan or net-run rows imported |
| On-call routing | Applied: `20260906050452_manpower_manager_direct_bod_gm` |

## On-call result

Active BU managers, and active Managers reporting directly to active GM/BOD, start
their own BU's on-call requests at the existing BOD/GM approval pool. Ordinary
requests retain BU-manager review. Requester self-approval is denied, and assigned
approvers must still hold the role for the current stage. Shared roles and the
existing one-BOD-or-GM completion rule are preserved; payroll's two-BOD rule is separate.

The two matching pending requests were repaired and initially remained Pending at
BOD/GM, each with three eligible assignments, no pending BU-manager assignment, no
self-assignment and no configuration issue. The migration recorded routing history
and normal application notifications, without approving either request. Subsequent
read-only verification showed both completed by an existing BOD account through
the live approval workflow, with the other pool assignments cancelled. Shared roles
and user-role assignment hashes match their pre-change values.

## Team tasks still pending

* Name and assign the actual scoped payroll handlers. Access management alone does
  not grant salary preparation or Finance review.
* Complete dated pay, schedules/rest days, punches, leave/OT approvals and HR's
  submitted attendance version, then approved gross-pay methods and comparisons.
* Finance completes the batch workbook: monthly contribution bases and allocation,
  line tax/exemption evidence, YTD/previous-employer openings, loans and deduction
  authorizations, plus an approved insufficient-net policy.
* Compare one complete net payroll and both cutoffs of a contribution month,
  including a final loan deduction below the regular installment. Verify actual
  loan balances stay unchanged. Only then record the team's comparison as done.

Next is Phase 6: linked corrections, 13th-month and final pay. It has not been
implemented in this release. Live processing, payslip release, payment and filing
remain disabled. Existing login, HRIS salary/PAN writers and shared roles are preserved.
