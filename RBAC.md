# Authoritative RBAC

The application resolves access in this order:

1. AuthContext loads the active hris_users profile and validates its role against roles.
2. roles.dashboard_type selects the dashboard layout.
3. PermissionsProvider loads role_permissions once and supplies can(resource, action) to routes, navigation, quick links, pages, and buttons.
4. hris_users.data_access_scope independently restricts accessible business units.
5. Supabase RLS repeats both checks for database reads and writes.

An unknown role fails closed. It is never converted to Employee. GLOBAL changes row scope only and never creates a missing feature permission.

## Deployment

1. Apply supabase/migrations/20260822_rbac_single_source_of_truth.sql.
2. Verify Jedediah Tejido using the SQL at the bottom of the migration.
3. Deploy the frontend after the migration is successful.
4. Confirm the selected HR role grants the intended resources.
5. Sign in as Jed and confirm the HR dashboard, multi-BU records, and direct-URL denial for an ungranted resource.

The exact Admin role retains the documented emergency superuser bypass.

## Intentionally retained role names

Some modules still use named roles only to route multi-step business workflows (for example,
the required Board of Director final approver, Manager department routing, and selecting
non-employee approver candidates). These checks do not grant page or database access.
Feature access remains controlled by role_permissions and row scope by data_access_scope.
