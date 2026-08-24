import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260824080000_repair_offboarding_user_management_helpdesk_documents.sql');
const hardeningMigration = read('supabase/migrations/20260824081000_harden_offboarding_auth_and_ticket_access.sql');
const adminScopeMigration = read('supabase/migrations/20260824082000_restore_admin_global_user_management.sql');
const reactivationGuardMigration = read('supabase/migrations/20260824083000_guard_reactivation_auth_state.sql');
const authContext = read('context/AuthContext.tsx');
const profileModal = read('components/employees/ProfileEditModal.tsx');
const employeeList = read('pages/employees/EmployeeList.tsx');
const employeeProfile = read('pages/employees/EmployeeProfile.tsx');
const userManagement = read('pages/admin/UserManagement.tsx');
const ticketPage = read('pages/helpdesk/Tickets.tsx');
const ticketService = read('services/ticketService.ts');
const templateDrawer = read('components/contracts/TemplateDrawer.tsx');
const printableContract = read('components/contracts/PrintableContract.tsx');

assert.match(migration, /add column if not exists end_date date/);
assert.match(migration, /create or replace function public\.set_employee_end_date/);
assert.match(migration, /has_active_role\('HR Staff'\)/);
assert.match(migration, /previousAccountAccess/);
assert.match(migration, /newAccountAccess/);
assert.match(migration, /Cannot offboard the final active Admin/);
assert.match(migration, /Forbidden: Admin authority is required/);
assert.match(migration, /create policy tickets_assignee_access/);
assert.match(migration, /get_accessible_helpdesk_ticket/);
assert.match(migration, /document_settings jsonb/);
assert.doesNotMatch(migration, /drop\s+table/i, 'the repair must preserve existing records');
assert.doesNotMatch(migration, /disable\s+row\s+level\s+security/i, 'RLS must remain enabled');

assert.match(hardeningMigration, /update auth\.users[\s\S]*banned_until = '9999-12-31 23:59:59\+00'/);
assert.match(hardeningMigration, /delete from auth\.sessions/);
assert.match(hardeningMigration, /update auth\.refresh_tokens[\s\S]*revoked = true/);
assert.match(hardeningMigration, /pre_deactivation_banned_until/);
assert.match(hardeningMigration, /where u\.auth_user_id = auth\.uid\(\)/);
assert.match(hardeningMigration, /create policy tickets_access_select/);
assert.match(hardeningMigration, /create policy tickets_access_update/);
assert.match(hardeningMigration, /create policy tickets_access_delete/);
assert.doesNotMatch(hardeningMigration, /create policy tickets_[^\n]+[\s\S]{0,100}for all/i, 'ticket access must not use broad ALL policies');
assert.doesNotMatch(hardeningMigration, /drop\s+table/i, 'hardening must preserve existing records');
assert.doesNotMatch(hardeningMigration, /disable\s+row\s+level\s+security/i, 'hardening must preserve RLS');

assert.match(adminScopeMigration, /has_active_role\('Admin'\)/);
assert.match(adminScopeMigration, /has_feature_permission\('UserManagement', 'view'\)/);
assert.doesNotMatch(adminScopeMigration, /@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, 'Admin scope must not be hardcoded to an email');
assert.doesNotMatch(adminScopeMigration, /disable\s+row\s+level\s+security/i, 'Admin scope repair must preserve RLS');

assert.match(reactivationGuardMigration, /No End Date is recorded/);
assert.match(reactivationGuardMigration, /account is already active/);
assert.match(reactivationGuardMigration, /pre_deactivation_banned_until = current_auth_ban/);
assert.match(reactivationGuardMigration, /revoke all on function public\.set_employee_end_date_core_20260824/);
assert.match(reactivationGuardMigration, /revoke all on function public\.admin_set_account_lifecycle_core_20260824/);

assert.match(authContext, /ACTIVE_SESSION_RECHECK_MS/);
assert.match(authContext, /account_inactive/);
assert.match(authContext, /get_my_hris_bootstrap/);

assert.match(profileModal, /Confirm End Date/);
assert.match(profileModal, /Confirm Reactivation/);
assert.match(profileModal, /endDateReason/);
assert.match(profileModal, /canManageEndDate/);
assert.match(employeeList, /rpc\('set_employee_end_date'/);
assert.match(employeeProfile, /rpc\('set_employee_end_date'/);

assert.match(userManagement, /rpc\('get_accessible_hris_users'/);
assert.doesNotMatch(userManagement, /from\('hris_users'\)\.select/);
assert.match(userManagement, /User Management could not be loaded/);
assert.match(userManagement, /!loading && !error/);

assert.match(ticketPage, /Assigned to Me/);
assert.match(ticketPage, /relatedEntityId: saved\.id/);
assert.match(ticketPage, /handledTicketIdRef\.current = null/);
assert.match(ticketService, /rpc\('get_accessible_helpdesk_ticket'/);

assert.match(templateDrawer, /Document Layout/);
assert.match(templateDrawer, /marginTopMm/);
assert.match(templateDrawer, /Show page numbers/);
assert.match(printableContract, /Download PDF/);
assert.match(printableContract, /autoPaging: 'text'/);
assert.match(printableContract, /margin: \[marginTop, marginRight, marginBottom, marginLeft\]/);
assert.match(printableContract, /getNumberOfPages/);
assert.match(printableContract, /break-inside: avoid/);
assert.doesNotMatch(printableContract, /all: unset/);

console.log('Focused HRIS repair smoke tests passed.');
