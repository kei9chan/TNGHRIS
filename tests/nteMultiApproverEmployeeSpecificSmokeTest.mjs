import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const picker = read('components/feedback/NTEApproverPicker.tsx');
const modal = read('components/feedback/NTEModal.tsx');
const incidentModal = read('components/feedback/IncidentReportModal.tsx');
const cases = read('pages/feedback/DisciplinaryCases.tsx');
const detail = read('pages/feedback/NTEDetail.tsx');
const service = read('services/nteService.ts');
const queue = read('hooks/useAdditionalApprovals.ts');
const migration = read('supabase/migrations/20260901140000_nte_multi_approver_employee_specific_workflow.sql');
const integration = read('tests/sql/nte_multi_approver_employee_specific_integration.sql');

assert.match(picker, /Search name, role, position, business unit, or email/);
assert.match(picker, /BOD approver added/);
assert.match(picker, /At least one Board of Director is required/);
assert.match(picker, /new Set\(selected\.map/);
assert.match(modal, /fetchEligibleNTEApprovers/);
assert.match(modal, /selectedApprovers\.some\(item => item\.roleId === Role\.BOD\)/);
assert.match(modal, /recipientEmployeeId/);
assert.match(modal, /existingRecipientIds/);
assert.doesNotMatch(modal, /Que, Regine/);
assert.doesNotMatch(modal, /\(\$\{approver\.role\}\)\(\$\{approver\.role\}\)/);

assert.match(incidentModal, /Employee-specific NTE processing/);
assert.match(incidentModal, /Create NTE/);
assert.match(incidentModal, /Continue Draft/);
assert.match(incidentModal, /employeeNte/);
assert.match(cases, /selectedNteRecipientId/);
assert.match(cases, /n\.employeeId === clickedEmployeeId/);

assert.match(service, /get_eligible_nte_approvers/);
assert.match(service, /create_nte_for_employee/);
assert.match(service, /act_on_nte_approval/);
assert.match(service, /cleanNteDocumentApproverLabels/);
assert.match(queue, /get_my_pending_nte_approvals/);
assert.doesNotMatch(queue, /from\('ntes'\)[\s\S]{0,300}approval_log/);
assert.match(detail, /processNTEApproval/);

assert.match(migration, /create table if not exists public\.nte_approvals/);
assert.match(migration, /unique\(nte_id, approver_user_id\)/);
assert.match(migration, /status not in \('Rejected'::public\.nte_status, 'Closed'::public\.nte_status\)/);
assert.match(migration, /join public\.user_roles ur/);
assert.match(migration, /selected_bod_count = 0/);
assert.match(migration, /A selected approver no longer has the eligible role used for selection/);
assert.match(migration, /on conflict \(user_id, dedupe_key\) do nothing/);
assert.match(migration, /private\.refresh_incident_nte_summary/);
assert.match(migration, /nte-partial/);
assert.match(migration, /recipient_employee_id/);
assert.match(migration, /get_my_pending_nte_approvals/);
assert.match(migration, /Pending NTE approval outcomes must use the assigned approval action/);
assert.match(migration, /selection_reason text/);
assert.doesNotMatch(migration, /Que, Regine|Cepe, Aiza/);

assert.match(integration, /rollback;/i);
assert.match(integration, /mandatory_bod_is_enforced/);
assert.match(integration, /second_employee_can_receive_an_independent_nte/);
assert.match(integration, /existing_nte_is_unchanged/);

console.log('NTE multi-approver and employee-specific workflow smoke test passed.');
