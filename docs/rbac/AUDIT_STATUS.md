# RBAC Permission-Matrix Audit

Status: **Audit in progress — no access behavior changed on this branch yet.**

This branch starts from `develop` and is intentionally kept compatible with the current Supabase schema so administrators can sign in to its Vercel preview while the audit is prepared.

Before any RBAC implementation is merged, this branch must contain and receive review of:

1. Current State vs Proposed State report
2. Complete role-versus-resource feature/action matrix
3. Role-versus-data-scope matrix
4. Sensitive-field access matrix
5. Workflow-action matrix
6. Dashboard and navigation matrix
7. Legacy conflict inventory
8. Reviewed Supabase seed/migration
9. Automated high-risk permission tests

Conflict handling: preserve the more restrictive existing behavior until a documented target rule is approved.

## Approved target: limited dual-role assignments

The permission model may support multiple role assignments, but the initial rollout will assign two roles only to these verified accounts:

1. Designated owner account: `Admin` + `Board of Director`
   - Primary dashboard: executive/BOD
   - Default data scope: `GLOBAL`
   - BOD workflow approvals must be explicitly granted; they must not be inferred from Admin or Global scope.
2. Designated IT administrator account: `Admin` + `IT`
   - Primary dashboard: admin/IT
   - System-administration permissions must not automatically expose sensitive HR fields or confer HR workflow approval authority.

All other users remain single-role at initial rollout. The implementation must use role assignments stored in Supabase (for example, a `user_roles` junction table) and must not hardcode a person's name or email into the permission resolver. Exact account IDs must be verified during the reviewed seed/deployment step.

The earlier `fix/rbac-single-source-of-truth` pull request is preliminary and must not be merged or used as the audit baseline.
