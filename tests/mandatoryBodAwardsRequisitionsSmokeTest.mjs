import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const awardModal = read('components/evaluation/AssignAwardModal.tsx');
const awardsPage = read('pages/evaluation/Awards.tsx');
const awardService = read('services/awardService.ts');
const requisitionModal = read('components/recruitment/RequisitionModal.tsx');
const requisitionsPage = read('pages/recruitment/Requisitions.tsx');
const requisitionService = read('services/jobRequisitionService.ts');
const migration = read('supabase/migrations/20260824183000_mandatory_bod_awards_requisitions.sql');

assert.match(awardService, /error\?\.code === '42703'/);
assert.match(awardModal, /filteredTemplates/);
assert.match(awardModal, /At least one active Board of Director approver is required/);
assert.match(awardModal, /Role\.GeneralManager, Role\.Manager, Role\.BusinessUnitManager/);
assert.match(awardsPage, /from\('user_roles'\)/);
assert.match(requisitionModal, /Board of Director Approval \(required\)/);
assert.match(requisitionModal, /role: JobRequisitionRole\.BOD/);
assert.doesNotMatch(requisitionModal, /canApprove = !!currentUserStep \|\|/);
assert.match(requisitionsPage, /processJobRequisitionApproval\(requisitionId, 'approve'\)/);
assert.match(requisitionService, /process_job_requisition_approval/);
assert.match(migration, /add column if not exists sort_order/);
assert.match(migration, /At least one active Board of Director approver is required/);
assert.match(migration, /roleSnapshot/);
assert.match(migration, /employee_awards_bod_gate/);
assert.match(migration, /job_requisitions_bod_workflow/);
assert.match(migration, /A completed Board of Director approval is required/);
assert.match(migration, /process_job_requisition_approval/);
assert.match(migration, /status='Approved'/);
assert.match(migration, /status='PendingApproval'/);

console.log('Mandatory BOD awards and requisitions smoke tests passed.');
