# Phase 1B — Effective-Dated Worker and Payroll Assignments

**Date:** 2026-09-05  
**Branch:** `payroll-staging`  
**Production impact:** None  
**Status:** Applied and verified in staging; no worker or catalog rows seeded

## Scope

This work package adds the source-of-truth structure for the worker dimensions that payroll will use later:

- Worker-classification catalog
- Legal-engagement catalog
- Employment-status catalog
- Pay-basis catalog
- Effective-dated, versioned worker-to-payroll-group assignments

The assignment record keeps authorization roles separate from payroll meaning. A UI role such as Employee, Manager, HR, Finance, or Board is not used as a worker classification, legal engagement, employment status, or pay basis. Legacy `hris_users` compensation and status fields were not copied, overwritten, or made authoritative.

The tables are intentionally empty. The staging project currently has only one Board user and no approved employee crosswalk. The supplied payroll workbooks remain controlled evidence outside Git and were not imported.

## Tables and relationships

| Table | Purpose | Seeded |
|---|---|---:|
| `payroll_worker_classifications` | Configurable rank-and-file, supervisory, managerial, or other approved classification values | 0 |
| `payroll_legal_engagements` | Employee and separate professional-fee/contractor engagement definitions | 0 |
| `payroll_employment_statuses` | Configurable probationary, regular, project, fixed-term, separated, or other approved statuses | 0 |
| `payroll_pay_bases` | Configurable monthly, daily, hourly, or other pay-basis values | 0 |
| `payroll_worker_assignments` | One effective-dated worker assignment version linked to a payroll group and organizational scope | 0 |

Each assignment references one `hris_users` record, one versioned payroll group, and one approved set of catalog values. Business unit, department, and site are optional only where the payroll-group/organizational configuration permits them; when present, cross-scope mismatches are rejected.

## Controls added

- All five tables have RLS enabled.
- Authenticated reads are limited to the existing payroll configuration access helper for HR/Admin, Board, and Finance; employees and ordinary managers do not receive direct access to these sensitive master records.
- Authenticated insert, update, and delete privileges are denied. Service-side workflows are the only write path until the approved UI/RPC workflow is implemented.
- Catalog values begin in `draft` and require approval evidence and a source document before approval/activation.
- Catalog status transitions are controlled; catalog rows are archived rather than deleted.
- A catalog code/name and other payroll-semantic identity fields cannot be changed after an assignment references the row. A new catalog value must be created for a changed meaning.
- Worker assignments begin in `draft`; approved/active rows require an approver, approval timestamp, source document, and nonblank change reason.
- When requester and approver are both recorded, self-approval is rejected.
- An assignment's effective range must fit inside the selected payroll-group version.
- One employee cannot have overlapping draft, approved, or active assignment ranges.
- Employee assignment versions are unique per employee and cannot be deleted after approval.
- Approved and historical assignment defining fields are immutable. Corrections append a new version and use a controlled supersession path.
- Professional-fee and contractor engagements cannot be attached to the employee-payroll assignment stream; they remain separate for the later vendor/professional-fee workflow.
- Foreign-key indexes cover the assignment and catalog workflow paths.

## Migrations applied

- `20260905061239_phase1_payroll_worker_assignment_foundation.sql`
- `20260905061637_phase1_payroll_worker_catalog_fk_indexes.sql`

Both migrations were applied to the staging project `suxncpnerzfkjhkhjwbd` only. No production migration was applied.

## Verification

Staging transaction tests passed for:

- Draft-only catalog and assignment creation
- Approval evidence requirements
- Maker-checker self-approval rejection
- Assignment date containment within a payroll-group version
- Assignment overlap rejection
- Approved-assignment immutability
- Invalid assignment status-transition rejection
- Approved-assignment delete protection
- Referenced-catalog identity immutability
- Contractor/professional-fee stream rejection from employee payroll
- Active-to-superseded status transition and append-only replacement creation
- Rollback of all test rows; final row counts remain zero in all five new tables
- RLS enabled with one controlled read policy on each new table
- Authenticated table privileges: `SELECT` only; no `INSERT`, `UPDATE`, or `DELETE`; anonymous `SELECT` denied
- Security advisor: no security lints associated with the new tables or functions
- Performance advisor: no missing-FK-index lints associated with the new tables; unused-index notices are expected while the tables are empty
- Production build passed

The project-wide advisors still report unrelated pre-existing lints on legacy tables and functions. Those were not changed by this package.

## Not included

This package does not seed or reconcile employees, create compensation history, calculate salary, define divisors, create schedules, interpret attendance, process leave/OT, or calculate statutory deductions and tax. Catalog vocabulary, effective dates, legal-entity/group population, and employee crosswalk remain business approvals—not inferred defaults.

## Next gate

HR, Finance, and Legal/Compliance must approve the catalog vocabulary and the employee/source crosswalk before any assignment data is loaded. The next implementation package can then add effective-dated compensation history, still on staging and still without making the browser payroll prototype authoritative.
