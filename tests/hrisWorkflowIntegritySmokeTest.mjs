import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260924080000_fix_hris_workflow_integrity.sql');
const incidentService = read('services/incidentReportService.ts');
const incidentModal = read('components/feedback/IncidentReportModal.tsx');
const logoService = read('services/businessUnitLogoService.ts');
const offerBuilder = read('components/recruitment/OfferCreationDrawer.tsx');
const offerService = read('services/jobOfferWorkspaceService.ts');
const offerMapper = read('services/jobOfferMapper.ts');
const offersPage = read('pages/recruitment/Offers.tsx');
const leaveModal = read('components/payroll/LeaveRequestModal.tsx');
const manpowerForm = read('components/payroll/ManpowerRequestModal.tsx');
const manpowerReview = read('components/payroll/ManpowerReviewModal.tsx');
const manpowerService = read('services/manpowerService.ts');

// Incident reports use their own record/evidence path and retain retryable evidence.
assert.doesNotMatch(incidentService, /payroll_debts/);
assert.match(incidentModal, /Your draft and uploaded evidence are still here/);
assert.match(incidentModal, /await onSave\(reportToSave\)/);
assert.match(incidentService, /payload\.attachment_urls = \(report\.attachmentUrls \|\| \[\]\)/);
assert.match(migration, /security definer[\s\S]*audit_incident_report_creation_attachments/);
assert.match(migration, /'actorId', actor[\s\S]*'createdAt'[\s\S]*'attachments', evidence/);
assert.match(migration, /jsonb_typeof\(evidence\) <> 'array'/);

// Logo assets are persistent per BU, validated, and managed under HR access policies.
for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'svg']) assert.match(logoService, new RegExp(`${ext}: \\{ mime:`));
assert.match(logoService, /MAX_BYTES = 2 \* 1024 \* 1024/);
assert.match(logoService, /MAX_EDGE = 4096/);
assert.match(logoService, /MAX_PIXELS = 8_000_000/);
assert.match(logoService, /validateSvg/);
assert.match(logoService, /from\('business-unit-logos'\)/);
assert.match(logoService, /from\('business_unit_logos'\)/);
assert.match(logoService, /is_removed: true/);
assert.match(offerBuilder, /saveBusinessUnitLogo\(selectedBusinessUnitId, file\)/);
assert.match(offerBuilder, /removeBusinessUnitLogo\(selectedBusinessUnitId\)/);
assert.match(offerBuilder, /DEFAULT_COMPANY_LOGO/);
assert.match(migration, /business_unit_logos_hr_admin_manage/);
assert.match(migration, /business_unit_logos_storage_insert/);

// Sending is an Offer transition based on an approved, immutable Job Order snapshot.
assert.match(offerMapper, /jobRequisitionSnapshot: row\.job_requisition_snapshot/);
assert.match(offerService, /alreadySent: true/);
assert.match(offerService, /jobOrder\.status\)\.toLowerCase\(\) !== 'approved'/);
assert.match(offerService, /OfferStatus\.Sent/);
assert.doesNotMatch(offerService, /from\('job_requisitions'\)[\s\S]{0,160}\.update\(/);
assert.match(migration, /guard_job_offer_send_requires_approved_requisition/);
assert.match(migration, /jobOrderReference/);
assert.match(migration, /JOB_OFFER_SENT/);
assert.match(offersPage, /if \(!result\.alreadySent\)/);

// BOD exception decisions remain at PendingBOD, respect active role/self checks,
// and record LWOP without paid-credit deductions.
assert.match(migration, /public\.has_active_role\('Board of Director'\)/);
assert.match(migration, /request_row\.status <> 'PendingBOD'/);
assert.match(migration, /request_row\.employee_id = actor/);
assert.match(migration, /lower\(coalesce\(employee_status, ''\)\) like '%probation%'/);
assert.match(migration, /paid_days = case[\s\S]*then 0/);
assert.match(migration, /unpaid_days = case[\s\S]*then duration_days/);
assert.match(migration, /'exceptionReason'/);
assert.match(migration, /'availableCredits'/);
assert.match(leaveModal, /get_leave_exception_approval_context/);
assert.match(leaveModal, /progress\?\.canAct===true/);
for (const label of ['Available credits', 'Credit shortfall', 'Current approval stage', 'Required approver', 'Paid or unpaid']) assert.ok(leaveModal.includes(label), `Leave context missing ${label}`);

// One resolver drives the preview, database submission guard and saved route.
assert.match(migration, /A Business Unit Manager must be assigned before this request can be submitted\./);
assert.match(migration, /DIRECT_BOD_REPORT/);
assert.match(migration, /BUM_REQUESTER/);
assert.match(migration, /BUM_THEN_BOD/);
assert.match(migration, /preview_manpower_approval_route[\s\S]*private\.resolve_manpower_approval_route/);
assert.match(migration, /require_manpower_approval_route[\s\S]*private\.resolve_manpower_approval_route/);
assert.match(migration, /initialize_manpower_request_workflow[\s\S]*private\.resolve_manpower_approval_route/);
assert.match(migration, /approval_route_snapshot = route/);
assert.match(migration, /selectedApprovers/);
assert.match(migration, /insert into public\.notifications/);
assert.match(manpowerForm, /previewManpowerApprovalRoute\(selectedBuId\)/);
assert.match(manpowerForm, /Board of Director/);
assert.match(manpowerService, /approvalRouteSnapshot/);
assert.match(manpowerReview, /Pending approver:/);
assert.match(manpowerReview, /Final approver:/);

console.log('HRIS workflow integrity smoke test passed.');
