import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const modal = read('components/feedback/IncidentReportModal.tsx');
const service = read('services/incidentReportService.ts');
const migration = read('supabase/migrations/20260824203000_incident_report_filing_directory.sql');
const workflowMigration = read('supabase/migrations/20260924080000_fix_hris_workflow_integrity.sql');

assert.match(modal, /fetchIncidentReportUserDirectory/);
assert.match(modal, /active users available across all business units/);
assert.match(modal, /showDetails=\{false\}/);
assert.match(modal, /Search for employees or users/);
assert.doesNotMatch(modal, /u\.businessUnitId === currentReport\.businessUnitId/);
assert.match(service, /get_incident_report_user_directory/);
assert.match(migration, /lower\(directory_user\.status\) = 'active'/);
assert.match(migration, /public\.current_hris_id\(\)/);
assert.match(migration, /canonicalize_incident_report_participants/);
assert.match(migration, /notify_hr_on_incident_report_filed/);
assert.match(migration, /array\['view', 'create'\]/);
assert.match(migration, /array\['submit'\]/);
assert.match(migration, /revoke all on function public\.get_incident_report_user_directory/);
assert.doesNotMatch(service, /payroll_debts/);
assert.match(modal, /submissionError/);
assert.match(modal, /await onSave\(reportToSave\)/);
assert.match(service, /payload\.attachment_urls = \(report\.attachmentUrls \|\| \[\]\)/);
assert.match(workflowMigration, /payroll_debt_document_read_allowed/);
assert.match(workflowMigration, /bucket_id = 'payroll-debt-documents'/);
assert.match(workflowMigration, /audit_incident_report_creation_attachments/);
assert.match(workflowMigration, /'actorId', actor[\s\S]*'createdAt'[\s\S]*'attachments', evidence/);

console.log('Universal incident-report filing smoke test passed.');
