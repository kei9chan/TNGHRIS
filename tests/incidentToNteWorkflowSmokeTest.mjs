import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const modal = read('components/feedback/IncidentReportModal.tsx');
const cases = read('pages/feedback/DisciplinaryCases.tsx');
const service = read('services/incidentReportService.ts');
const nteModal = read('components/feedback/NTEModal.tsx');
const preview = read('components/feedback/NTEPreview.tsx');
const migration = read('supabase/migrations/20260824010000_repair_incident_to_nte_workflow.sql');

assert.match(modal, /onGenerateNTE\(currentReport\)/, 'Issue NTE must use current modal state');
assert.doesNotMatch(modal, /onGenerateNTE\(report\)/, 'Issue NTE must not validate the stale prop');
assert.match(cases, /assignIncidentCaseHandler\(report\.id, report\.assignedToId, true\)/, 'NTE transition must use the transactional assignment RPC');
assert.match(cases, /r\.assignedToId === userRef\.id/, 'assigned handlers must see their cases');
assert.match(service, /assign_incident_case_handler/, 'frontend service must call the protected assignment RPC');

assert.match(migration, /for update;/i, 'assignment transition must lock the incident report');
assert.match(migration, /has_feature_permission\('IncidentReports', 'assign'\)/, 'backend must enforce assignment permission');
assert.match(migration, /v_assignment_changed/, 'notifications must be de-duplicated by assignment change');
assert.match(migration, /related_entity_id/, 'assignment notifications must deep-link to the case');
assert.match(migration, /memo_ids text\[\]/, 'memo citations must persist as an optional array');

assert.match(nteModal, /Cite Memos \(Optional\)/, 'memo citation must be explicitly optional');
assert.match(nteModal, /setMemoIds\(e\.target\.value\.trim\(\) \? \[e\.target\.value\] : \[\]\)/, 'blank manual memo input must persist as an empty list');
assert.doesNotMatch(preview, /\[No offenses cited\]/, 'empty memo/offense sections must be omitted');
assert.match(preview, /OFFICE OF HUMAN RESOURCES/, 'NTE must use the required sender label');
assert.match(preview, /NTE CODE/, 'NTE opening must contain the NTE code');
assert.match(preview, /NOTICE TO EXPLAIN/, 'NTE opening must contain the required subject');

console.log('Incident Report → NTE workflow smoke tests passed.');
