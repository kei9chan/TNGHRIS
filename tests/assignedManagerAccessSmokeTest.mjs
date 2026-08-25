import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('App.tsx');
const approvalCenter = read('pages/ApprovalCenter.tsx');
const approvals = read('hooks/useApprovals.ts');
const links = read('services/approvalDeepLinks.ts');
const userManagement = read('pages/admin/UserManagement.tsx');
const accessModal = read('components/admin/UserRoleEditModal.tsx');
const repair = read('supabase/migrations/20260825123000_repair_rbac_editor_and_assigned_manager_access.sql');
const leaveStages = read('supabase/migrations/20260825124000_allow_configured_leave_approval_stages.sql');

assert.match(links, /\/approvals\?type=\$\{kind\}&item=\$\{encodedId\}/);
assert.match(app, /legacyApprovalKind/);
assert.match(app, /getApprovalReviewUrl\(legacyApprovalKind, legacyRequestId\)/);
assert.match(approvalCenter, /rpc\('get_my_direct_report_ids'\)/);
assert.match(approvalCenter, /<WFHReviewModal/);
assert.match(approvalCenter, /<LeaveRequestModal/);
assert.match(approvalCenter, /<OTRequestModal/);
assert.match(approvalCenter, /handleApproveWFH/);
assert.match(approvalCenter, /handleLeaveApproval/);
assert.match(approvalCenter, /handleApproveRejectOT/);
assert.match(approvals, /rpc\('get_my_pending_time_approval_ids'\)/);
assert.doesNotMatch(approvals, /from\('time_request_approval_assignments'\)/);

assert.match(repair, /private\.is_active_time_request_approver/);
assert.match(repair, /public\.get_my_pending_time_approval_ids/);
assert.match(repair, /public\.can_view_time_request/);
assert.match(repair, /v_requested_role_id/);
assert.doesNotMatch(repair, /declare[\s\S]{0,500}\n\s*role_id text;/);
assert.match(repair, /Self-promotion and self-role changes are not permitted/);
assert.match(repair, /SYSTEM_REPAIR_USER_ACCESS/);
assert.match(repair, /'Manager', true, 'DIRECT_REPORTS'/);

assert.match(userManagement, /server did not confirm the requested role configuration/i);
assert.match(userManagement, /Access updated/);
assert.match(accessModal, /Promise<void>/);
assert.match(accessModal, /Select at least one business unit/);
assert.match(leaveStages, /'PendingGM', 'PendingBOD'/);

console.log('Assigned-manager access and audited role editing smoke checks passed.');
