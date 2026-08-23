# Production RBAC repair handoff

## Production target and rollback

- Live application: `https://hris.thenextperience.com`
- Production Git branch: `main`
- Pre-change commit: `fde428f15e5e7567e44d4b6b0025c26c56e878fb`
- Git rollback branch: `rollback/rbac-production-20260823-fde428f`
- Supabase project: `kpogfmwsxwikfilxhcqh`
- Database rollback evidence: Supabase Pro daily physical backups plus the in-database snapshot
  `private.rbac_migration_snapshots.pre-rbac-20260823-fde428f`.

The private snapshot contains the pre-change roles, role permissions, user assignments,
public RLS policies, approval counts, and the exact approval record IDs. It is not
readable by `anon` or `authenticated`.

## Current state versus implemented state

| Area | Previous state | Implemented state |
|---|---|---|
| Roles | Fourteen active role records, including `Recruiter` and `test role` | Exactly twelve approved active roles; both legacy roles archived |
| User roles | One mutable role value on `hris_users` | Audited normalized `user_roles`; only Kay and IT are allowlisted for two active roles |
| Permissions | Duplicated frontend constants, role checks, navigation checks, and partial database rules | Supabase feature/action matrices are the runtime source of truth used by routes, navigation, buttons, services, and RLS |
| Scope | Scope and approval authority were conflated in several pages | Feature permission, data scope, sensitive fields, workflow authority, and dashboard presentation are independent checks |
| BOD / HR Manager | Similar but drift-prone behavior | Exact feature, sensitive, and workflow parity enforced by deferred database constraint triggers and an automated test |
| Admin | Broad frontend assumptions could imply HR authority | Technical Admin rights are explicit and do not grant HR workflow or protected-content authority by themselves |
| Unknown roles | Some application paths defaulted to Employee | Unknown, inactive, and broken roles fail closed with a visible diagnostic |
| Sensitive fields | Broad `hris_users` reads could return protected columns | Masked security-definer RPCs plus column-level read protection; hidden values are not fetched and concealed by CSS |
| Workflow actions | Visibility or row ownership could imply final approval | Status-transition triggers require the applicable workflow action independently of row visibility |
| Errors | Some approval queries could appear as empty queues | Query failures remain errors with retry UI and are never converted to a valid empty result |
| Role changes | Frontend-driven role mutation | Atomic audited role/scope/dashboard updates with self-promotion and permission-ceiling checks |
| Public signup | Anonymous RPC accepted caller-provided role and status values | Signup collects a job title only; the guarded RPC verifies the Auth identity and organization references, forces Employee + Inactive + SELF scope, and audits requested versus assigned values |

## Production assignments

| Account | Primary role | Additional role | Dashboard | Scope |
|---|---|---|---|---|
| `kay@thenextperience.com` | Board of Director | Admin | Executive/BOD | GLOBAL |
| `it@thenextperience.com` | IT | Admin | Admin/IT | GLOBAL technical scope |
| `hrs@thenextperience.com` (Jedediah Tejido) | HR Manager | — | HR | GLOBAL |
| Former Recruiter account | HR Staff | — | Existing/default | Preserved existing scope |
| Former test-role account | Employee | — | Existing/default | Preserved existing scope |

Role membership is resolved from the database. No account email is used by runtime
frontend authorization logic.

## Approval baseline proof

| Queue | Before | After core migration |
|---|---:|---:|
| Leave Pending | 26 | 26 |
| WFH Pending BOD | 100 | 100 |
| WFH Pending department head | 42 | 42 |
| WFH combined | 142 | 142 |
| Overtime PendingBOD | 105 | 105 |
| Manpower Pending | 0 | 0 |

The migration compares the counts transactionally and preserves the exact pre-change
record IDs in the private snapshot. A mismatch aborts the migration.

## Runtime model

Every protected operation can require all applicable layers:

1. Feature permission: resource plus explicit action.
2. Data scope: SELF, DIRECT_REPORTS, DEPARTMENT, HOME_ONLY, SPECIFIC, or GLOBAL.
3. Sensitive field permission: separate permission for each protected class.
4. Workflow authority: submit, review, approve, reject, return, cancel, or finalize.
5. Dashboard type: presentation only and never an authorization grant.

The authoritative matrices are the rows in:

- `role_permissions`
- `role_sensitive_permissions`
- `role_workflow_permissions`
- `roles.default_data_scope`

Use [`matrix-queries.sql`](./matrix-queries.sql) to export the complete live matrices.

## High-risk controls

- `admin_set_user_roles` performs role, primary-role, scope, dashboard, and selected
  business-unit updates atomically and records before/after audit data.
- A user cannot change their own roles or raise their own permission ceiling.
- Inactive or unknown roles cannot be assigned.
- The final active Admin is protected.
- Only Kay and IT are permitted to hold two active roles.
- BOD and HR Manager authority changes are linked and parity-checked before commit.
- IT has system administration but no Leave, WFH, Overtime, Manpower, recruitment
  offer, discipline, evaluation, payroll, bank, salary, government-number, medical,
  NTE, investigation, or final-pay authority merely from technical Admin access.
- `hris_users.role`, scope, dashboard type, and auth link cannot be modified outside
  the audited RBAC function.
- Workflow status transitions are protected by server-side triggers.
- All centralized `SECURITY DEFINER` functions revoke anonymous/PUBLIC execution;
  authenticated resolver/RPC entry points are explicitly allowlisted, and trigger
  functions cannot be called directly through PostgREST.
- The one intentional anonymous `SECURITY DEFINER` entry point is
  `register_user_profile`, required before email confirmation creates a session. It
  cannot assign authorization: role, status, scope, and dashboard are fixed by the
  server, Auth email/ID and business-unit/department relationships are validated,
  and every registration is recorded in `rbac_audit_log`.

## Tests and validation

- Full two-migration transactional dry run against production: passed and rolled back.
- Core production migration blocking assertions: passed.
- Board of Director / HR Manager parity: passed.
- Kay effective Admin + BOD authority: passed.
- IT technical authority and HR/sensitive denial boundary: passed.
- Jed global HR authority and Admin ceiling: passed.
- Former Recruiter recruitment access: passed.
- Public self-registration role escalation: blocked; caller role/status ignored and
  the signup UI no longer exposes role selection.
- Approval before/after comparison: passed.
- TypeScript `tsc --noEmit`: passed.
- Vite production build: passed.
- RBAC resolver/static smoke test: passed.
- Recruitment, interview, offer, and social-media-generator smoke tests: passed.
- `git diff --check`: passed.
- No lint script exists in this repository.

## Rollback

If a release-blocking regression is found:

1. Move `main` back to the rollback branch commit
   `fde428f15e5e7567e44d4b6b0025c26c56e878fb`.
2. Restore the Supabase project to the corresponding daily physical backup when a
   full database rollback is required.
3. Use `private.rbac_migration_snapshots` to compare or selectively restore roles,
   role permissions, assignments, and policies under supervised database access.
4. Do not delete business records. The RBAC migrations are additive and do not
   truncate or recreate HRIS workflow tables.
