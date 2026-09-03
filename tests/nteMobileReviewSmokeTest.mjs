import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [responsive, modal, nteModal, incidentModal, detail, preview, service] = await Promise.all([
  read('components/ui/ResponsiveDocumentPreview.tsx'),
  read('components/ui/Modal.tsx'),
  read('components/feedback/NTEModal.tsx'),
  read('components/feedback/IncidentReportModal.tsx'),
  read('pages/feedback/NTEDetail.tsx'),
  read('components/feedback/NTEPreview.tsx'),
  read('services/nteService.ts'),
]);

assert.match(responsive, /ResizeObserver/);
assert.match(responsive, /Math\.min\(1, availableWidth \/ documentWidth\)/);
assert.match(responsive, /transform: `scale\(\$\{layout\.scale\}\)`/);
assert.match(nteModal, /ResponsiveDocumentPreview/);
assert.match(detail, /Published Notice to Explain preview/);
assert.doesNotMatch(detail, /\[&_table\]:table-fixed/);
assert.match(modal, /100dvh/);
assert.match(incidentModal, /grid grid-cols-2 gap-2/);
assert.match(preview, /overflow: visible/);
assert.match(preview, /objectFit: 'contain'/);

assert.match(detail, /Your NTE Approval Is Required/);
assert.match(detail, /isApprovalActionBusy/);
assert.match(detail, /Approve NTE/);
assert.match(detail, /role="status"/);
assert.match(service, /rpc\('act_on_nte_approval'/);
assert.match(service, /p_nte_id: nteId/);

console.log('NTE mobile layout and approval review smoke test passed.');
