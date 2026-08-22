# Current State vs Proposed State: Limited Dual Roles

Status: **Reviewed target for the dual-role branch change only. The repository-wide RBAC audit remains open.**

## Inventory snapshot

The current repository contains 107 protected application routes, 106 distinct Supabase table names referenced by the frontend, 101 direct role-name checks, and only one checked-in RLS migration covering 28 tables. Authorization is distributed across `hooks/usePermissions.ts`, `constants.ts`, `App.tsx`, `QuickLinks.tsx`, dashboard components, page components, services, and the Supabase migration.

## Conflicts found

| Area | Current state | Risk | Proposed state for this branch |
|---|---|---|---|
| User roles | `hris_users.role` stores one string | Cannot represent owner as Admin+BOD or IT administrator as Admin+IT | Add `user_roles`; retain a primary role for legacy workflows |
| Admin bypass | `public.is_admin()` checks only `hris_users.role = 'Admin'` | Secondary Admin role would be ignored by RLS | Resolve Admin from `user_roles` |
| BOD approvals | `useApprovals` checks `user.role === Board of Director` | Admin+BOD can lose WFH/OT approvals when Admin is primary | Resolve BOD from all assigned roles |
| Approval precedence | HR branch is evaluated before BOD | Admin+BOD may enter the HR queue instead of the BOD final queue | BOD authority takes precedence for Admin+BOD |
| Overtime scope | Normal BOD is limited to direct reports | Does not match the approved owner-wide queue shown in the original system | Admin+BOD receives the global submitted OT queue; BOD alone remains restricted |
| Technical administrator | Admin currently implies HR approval widgets | IT could receive HR workflow authority simply through Admin | Admin+IT is excluded from HR approval widgets |
| Quick links | Static map reads only the primary role | Secondary Admin features disappear | Admin quick links are used when Admin is one of the assigned roles |
| User Management | One role dropdown and direct `hris_users` update | Non-atomic changes; no multiple-role display or audit | Multi-select roles, primary role, warning, audited RPC |
| Dual-role eligibility | Any future implementation could allow arbitrary combinations | Privilege accumulation | Database allowlist permits only the two approved accounts and exact combinations |
| Unknown role handling | Unknown database roles can be converted to Employee in the legacy auth resolver | Silent, contradictory permissions | Multi-role rows are normalized against the TypeScript role enum; migration uses existing role IDs |
| Database coverage | 106 referenced tables versus 28 tables in the checked-in admin RLS migration | Application guards are not sufficient database protection | Full table/RLS reconciliation remains a blocking audit deliverable |
| Sensitive fields | Current Admin RLS bypass includes payroll, payslips, documents, discipline, NTEs, and evaluations | Super Admin is high-risk | Both requested Admin combinations are explicitly high-risk and require the seed review; field-level redesign remains open |

## Approved dual-role feature matrix

This matrix records only the delta approved in this conversation. Existing single-role permissions remain unchanged and the more restrictive behavior is retained where not listed.

| Assignment | Primary role | Effective roles | Feature permissions | Approval permissions |
|---|---|---|---|---|
| Owner account | Board of Director | Admin + Board of Director | Union of the existing Admin and BOD feature permissions | Global final WFH; global submitted OT; existing BOD approvals |
| IT administrator | IT | Admin + IT | Union of the existing Admin and IT feature permissions | No BOD authority; no HR approval widget derived from Admin |
| Every other account | Existing role | Existing single role | Unchanged | Unchanged |

## Data-scope matrix

| Assignment | Default scope | Record scope | Override rule |
|---|---|---|---|
| Owner account | `GLOBAL` | All business units | Explicit database assignment |
| IT administrator | `GLOBAL` | All business units under existing Admin RLS | Explicit database assignment; high-risk |
| Other users | Existing value or `HOME_ONLY` | Unchanged | Existing `HOME_ONLY`, `SPECIFIC`, or `GLOBAL` behavior |

Feature permission and data scope are evaluated separately. Global scope alone does not create BOD workflow authority.

## Sensitive-field matrix for the two assignments

| Sensitive group | Owner Admin+BOD | IT Admin+IT | Current enforcement note |
|---|---|---|---|
| Salary and compensation | Super Admin access | Super Admin access | Existing Admin RLS bypass; high-risk |
| Bank information | Super Admin access | Super Admin access | Field-level database views are not yet present |
| Government IDs | Super Admin access | Super Admin access | Field-level database views are not yet present |
| Employee documents | Super Admin access | Super Admin access | Existing `admin_all_user_documents` policy |
| Disciplinary/NTE evidence | Super Admin access | Super Admin access | Existing Admin policies |
| Evaluation results | Super Admin access | Super Admin access | Existing Admin policies |
| Payroll staging/final pay | Super Admin access | Super Admin access | Existing Admin policies |
| Security PIN/auth fields | Must never be returned by general employee queries | Must never be returned by general employee queries | Requires separate field-level audit |

This is an explicit warning: assigning Admin under the current database policies is unrestricted. The broader sensitive-field redesign remains mandatory before the RBAC repair can be considered complete.

## Workflow-action matrix for the dual-role delta

| Workflow | Owner Admin+BOD | IT Admin+IT |
|---|---|---|
| WFH | Review, approve, reject at BOD stage globally | No HR approval widget |
| Overtime | Review, approve, reject submitted requests globally | No HR approval widget |
| Leave | Existing BOD/Admin behavior retained | No HR approval widget |
| Manpower | Existing BOD/Admin behavior retained; global queue | No HR approval widget |
| Benefits, PAN, Incident/NTE, Evaluations, Awards, Offers, Resignation | Existing workflow routing retained pending full matrix | No authority inferred from IT role |

## Dashboard and navigation matrix

| Assignment | Dashboard | Navigation/quick links | Approval widgets |
|---|---|---|---|
| Owner Admin+BOD | BOD/manager dashboard | Admin quick links and effective Admin navigation | Includes WFH and Overtime |
| IT Admin+IT | Technical/Admin-compatible dashboard | Admin quick links and IT functions | HR approval widget suppressed |
| Other users | Existing dashboard | Existing role behavior | Existing role behavior |

## Seed and validation

`supabase/migrations/20260822_limited_dual_roles.sql`:

- creates `user_roles`, `dual_role_allowlist`, and an assignment audit table;
- backfills every existing primary role;
- restricts two-role assignments to the approved allowlist;
- seeds the exact owner and IT work accounts;
- sets the approved primary roles and `GLOBAL` scope;
- updates the Admin RLS resolver to recognize a secondary Admin role;
- exposes an atomic audited assignment RPC;
- includes verification SQL that must return exactly two rows.

The migration is additive but high-risk because it changes Admin resolution. It must be applied to a non-production Supabase branch first, then tested with both accounts and a negative third account.
