import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260825110000_harden_time_request_assignment_and_incident_revision.sql');
const leave = read('pages/payroll/Leave.tsx');
const incidentService = read('services/incidentReportService.ts');
const incidentModal = read('components/feedback/IncidentReportModal.tsx');

assert.match(migration, /private\.is_direct_reporting_manager/);
assert.match(migration, /assignment\.status = 'Pending'/);
assert.match(migration, /Approver Configuration Required/);
assert.match(migration, /employee_id = public\.current_hris_user_id\(\) and status = 'Draft'/);
assert.match(migration, /has_any_recruitment_access/);
assert.doesNotMatch(migration, /delete\s+from\s+public\.(leave_requests|wfh_requests|ot_requests|incident_reports)/i);

assert.match(leave, /get_my_direct_report_ids/);
assert.doesNotMatch(leave, /return leaveRequests\.filter\(r => r\.departmentId === user\.departmentId\)/);

assert.match(incidentService, /return_incident_report_for_revision/);
assert.match(incidentService, /reject_incident_report/);
assert.match(incidentService, /resubmit_incident_report/);
assert.match(incidentModal, /Returned for Revision/);
assert.match(incidentModal, /Save and resubmit/);
assert.match(incidentModal, /Revision instructions \(required\)/);
assert.match(incidentModal, /Rejection reason \(required\)/);

console.log('Record authorization and Incident Report revision smoke tests passed.');
