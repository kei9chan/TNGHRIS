import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260825110000_harden_time_request_assignment_and_incident_revision.sql');
const revisionMigration = read('supabase/migrations/20260826113000_allow_incident_report_rejected_revision.sql');
const revisionGuardMigration = read('supabase/migrations/20260826114500_lock_incident_report_revision_state.sql');
const leave = read('pages/payroll/Leave.tsx');
const incidentService = read('services/incidentReportService.ts');
const incidentModal = read('components/feedback/IncidentReportModal.tsx');

assert.match(migration, /private\.is_direct_reporting_manager/);
assert.match(migration, /assignment\.status = 'Pending'/);
assert.match(migration, /Approver Configuration Required/);
assert.match(migration, /employee_id = public\.current_hris_user_id\(\) and status = 'Draft'/);
assert.match(migration, /has_any_recruitment_access/);
assert.doesNotMatch(migration, /delete\s+from\s+public\.(leave_requests|wfh_requests|ot_requests|incident_reports)/i);
assert.match(revisionMigration, /'Returned for Revision', 'Rejected'/);
assert.match(revisionMigration, /Only the original reporter can resubmit/);
assert.match(revisionMigration, /incident_report_reporter_revision_audit/);
assert.match(revisionMigration, /Reporter revised/);
assert.doesNotMatch(revisionMigration, /delete\s+from\s+public\.incident_reports/i);
assert.match(revisionGuardMigration, /waiting for revision by the original reporter/);
assert.match(revisionGuardMigration, /Use the resubmit action/);
assert.match(revisionGuardMigration, /incident_report_revision_state_guard/);

assert.match(leave, /get_my_direct_report_ids/);
assert.doesNotMatch(leave, /return leaveRequests\.filter\(r => r\.departmentId === user\.departmentId\)/);

assert.match(incidentService, /return_incident_report_for_revision/);
assert.match(incidentService, /reject_incident_report/);
assert.match(incidentService, /resubmit_incident_report/);
assert.match(incidentModal, /Returned for Revision/);
assert.match(incidentModal, /IRStatus\.Rejected/);
assert.match(incidentModal, /Edit for resubmission/);
assert.match(incidentModal, /Resubmit report/);
assert.match(incidentModal, /canProcessReport/);
assert.match(incidentModal, /Revision instructions \(required\)/);
assert.match(incidentModal, /Rejection reason \(required\)/);

console.log('Record authorization and Incident Report revision smoke tests passed.');
