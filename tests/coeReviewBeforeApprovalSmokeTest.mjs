import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const employeeModal = read('components/employees/RequestCOEModal.tsx');
const reviewModal = read('components/admin/COEApprovalReviewModal.tsx');
const service = read('services/coeService.ts');
const migration = read('supabase/migrations/20260902053222_coe_review_before_approval.sql');
const approvalSurfaces = [
  read('components/dashboard/HRDashboard.tsx'),
  read('components/dashboard/ManagerDashboard.tsx'),
  read('pages/admin/COERequests.tsx'),
];

assert.doesNotMatch(employeeModal, /Choose a COE Template/);
assert.doesNotMatch(employeeModal, /fetchActiveCoeTemplates/);
assert.doesNotMatch(employeeModal, /templateId:/);
assert.match(employeeModal, /What is this COE for\?/);

assert.match(reviewModal, /Review Certificate of Employment/);
assert.match(reviewModal, /Edit COE Content/);
assert.match(reviewModal, /Approve and Send/);
assert.match(reviewModal, /master template is not changed/i);
assert.match(reviewModal, /fetchCoeReviewDocument/);
assert.match(reviewModal, /approveCoeRequestWithReview/);

for (const surface of approvalSurfaces) {
  assert.match(surface, /COEApprovalReviewModal/);
  assert.match(surface, /setCoeToReview|setRequestToReview/);
}

assert.match(service, /rpc\('get_coe_review_document'/);
assert.match(service, /rpc\('approve_coe_request_with_review'/);
assert.doesNotMatch(service.match(/export const createCoeRequest[\s\S]*?export const approveCoeRequest/)?.[0] || '', /template_id:/);

assert.match(migration, /private\.resolve_coe_template/);
assert.match(migration, /create or replace function public\.get_coe_review_document/);
assert.match(migration, /create or replace function public\.approve_coe_request_with_review/);
assert.match(migration, /approval_content_edited/);
assert.match(migration, /Approved and sent COE after review/);
assert.match(migration, /Review the COE template and generated content before approval/);
assert.doesNotMatch(migration, /delete\s+from\s+public\.coe_requests/i);

console.log('COE review-before-approval smoke test passed.');
