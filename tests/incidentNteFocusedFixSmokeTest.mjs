import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [incidentService, nteModal, incidentModal, cases, detail, preview, migration] = await Promise.all([
  read('services/incidentReportService.ts'),
  read('components/feedback/NTEModal.tsx'),
  read('components/feedback/IncidentReportModal.tsx'),
  read('pages/feedback/DisciplinaryCases.tsx'),
  read('pages/feedback/NTEDetail.tsx'),
  read('components/feedback/NTEPreview.tsx'),
  read('supabase/migrations/20260903121623_fix_rejected_nte_pipeline_routing.sql'),
]);

for (const field of ['attachment_url', 'attachment_urls', 'resolveIncidentEvidence']) {
  assert.match(incidentService, new RegExp(field));
}
for (const label of ['Original Incident Report', 'Date &amp; time of incident', 'Location', 'Category', 'Description', 'Supporting evidence', 'Preview', 'Download']) {
  assert.match(nteModal, new RegExp(label));
}
assert.match(nteModal, /Involved employee\(s\)/);
assert.match(incidentModal, /Create Revised NTE/);
assert.match(incidentModal, /NTEStatus\.Rejected/);
assert.match(cases, /case NTEStatus\.Rejected:\s*return 'ir-review'/);
assert.match(cases, /case NTEStatus\.Issued:\s*return 'nte-sent'/);
assert.doesNotMatch(cases, /default:\s*return 'nte-sent'/);
assert.match(detail, /NTE Rejected/);
assert.match(detail, /Rejected by:/);
assert.match(detail, /NTE_SIGNATURE_CSS/);

assert.match(preview, /data-nte-signature-block/);
assert.match(preview, /maxWidth: '180px'/);
assert.match(preview, /maxHeight: '64px'/);
assert.match(preview, /objectFit: 'contain'/);
assert.match(preview, /textAlign: 'center'/);

assert.match(migration, /n\.status = 'Issued'::public\.nte_status[\s\S]*then 'nte-sent'/);
assert.match(migration, /n\.status = 'Rejected'::public\.nte_status[\s\S]*then 'ir-review'/);
assert.match(migration, /statusCounts/);
assert.doesNotMatch(migration, /delete\s+from|truncate|disable\s+row\s+level\s+security/i);

console.log('Focused Incident Report and NTE workflow fixes passed.');
