import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260904150000_asset_request_staged_bod_approval.sql');
const service = read('services/assetApprovalService.ts');
const hook = read('hooks/useAdditionalApprovals.ts');
const widget = read('components/dashboard/ApprovalWidget.tsx');
const center = read('pages/ApprovalCenter.tsx');
const modal = read('components/employees/AssetRequestApprovalModal.tsx');
const settings = read('pages/admin/Settings.tsx');
const requestService = read('services/assetService.ts');
const requesterFeed = read('services/myRequestsService.ts');
const requesterWidget = read('components/dashboard/MyRequestsWidget.tsx');
const bodDashboard = read('components/dashboard/BODDashboard.tsx');

// Stored, effective-per-request configuration with the required default.
assert.match(migration, /'asset_request_approvals'[\s\S]*'required_bod_approvals', 2/);
assert.match(migration, /check \(required_bod_approvals in \(1, 2\)\)/);
assert.match(migration, /new\.required_bod_approvals := private\.asset_request_required_bod_approvals\(\)/);
assert.match(migration, /'inFlightRequestsChanged', false/);

// Manager must be resolved from the reporting relationship, not from browser data.
assert.match(migration, /private\.resolve_direct_manager_id\(new\.employee_id\)/);
assert.match(migration, /new\.approval_stage := 'DIRECT_MANAGER'/);
assert.match(migration, /request_row\.approval_stage = 'DIRECT_MANAGER' and request_row\.manager_id <> actor_id/);
assert.doesNotMatch(requestService, /manager_id:\s*request\.managerId/);

// Distinct BOD actions are normalized and cannot be counted twice.
assert.match(migration, /unique \(request_id, approval_stage, approver_user_id\)/);
assert.match(migration, /count\(distinct assignment\.approver_user_id\)/);
assert.match(migration, /You already approved this asset request/);
assert.match(migration, /private\.is_asset_request_bod\(candidate\.id\)/);
assert.match(migration, /approved_bod_count >= request_row\.required_bod_approvals/);

// Stage advancement, rejection, notifications, audit, and historic repair are explicit.
assert.match(migration, /set approval_stage = 'BOD'/);
assert.match(migration, /set status = 'Rejected'::public\.asset_request_status/);
assert.match(migration, /'Asset Request Awaiting BOD Approval'/);
assert.match(migration, /insert into public\.audit_logs/);
assert.match(migration, /'Workflow Repaired'/);
assert.match(migration, /update public\.notifications/);
assert.doesNotMatch(migration, /delete\s+from\s+public\.(asset_requests|asset_request_approval_assignments|asset_request_approval_history)/i);
assert.doesNotMatch(migration, /kay|jed|tejido|regine|@/i, 'migration must not hard-code approver identities');

// RLS/direct mutation protections and hardened RPCs.
assert.match(migration, /asset_requests_scoped_select/);
assert.match(migration, /asset_returns_scoped_update/);
assert.match(migration, /guard_asset_request_workflow_update/);
assert.match(migration, /coalesce\(current_setting\('app\.asset_request_workflow_mutation', true\), ''\) <> 'on'/);
assert.match(migration, /request_row\.manager_id is not null and actor_id = request_row\.manager_id/);
assert.match(migration, /set search_path = ''/);
assert.match(migration, /revoke all on public\.asset_request_approval_assignments from public, anon, authenticated/);
assert.match(migration, /grant execute on function public\.process_asset_request_approval\(uuid, text, text\) to authenticated/);

// All views consume the same queue and detail records.
for (const rpc of [
  'get_my_asset_request_approval_queue',
  'get_asset_request_approval_detail',
  'process_asset_request_approval',
  'get_asset_request_approval_config',
  'save_asset_request_approval_config',
]) assert.match(service, new RegExp(rpc));
assert.match(hook, /fetchMyAssetApprovalQueue/);
assert.match(hook, /table: 'asset_requests'/);
assert.match(widget, /Asset Requests/);
assert.match(center, /kind: 'asset'/);
assert.match(center, /AssetRequestApprovalModal/);
assert.match(modal, /Waiting for Direct Manager Approval/);
assert.match(modal, /detail\.canAct &&/);
assert.match(modal, /approvalProgress/);
assert.match(settings, /Required BOD approvals/);
assert.match(settings, /saveAssetApprovalConfig/);
assert.match(requesterFeed, /get_my_request_summaries_v2/);
assert.match(requesterWidget, /request\.currentStage/);
assert.match(bodDashboard, /ApprovalWidget/);
assert.doesNotMatch(bodDashboard, /You're all caught up!/);

console.log('Asset Request manager-to-BOD approval workflow smoke test passed.');
