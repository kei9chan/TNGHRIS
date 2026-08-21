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

The earlier `fix/rbac-single-source-of-truth` pull request is preliminary and must not be merged or used as the audit baseline.
