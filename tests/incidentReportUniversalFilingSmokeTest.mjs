import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const modal = read('components/feedback/IncidentReportModal.tsx');
const service = read('services/incidentReportService.ts');
const migration = read('supabase/migrations/20260824203000_incident_report_filing_directory.sql');

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

console.log('Universal incident-report filing smoke test passed.');
