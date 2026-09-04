import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  dedupeOfferPackageDocuments,
  getDefaultOfferPackageDocumentIds,
  normalizeOfferPackageDocumentType,
  parseSupabaseStorageUrl,
  resolveRecruitmentResumeStorageLocation,
  resolveCandidateDocumentMimeType,
} from '../services/offerApprovalDocuments.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = relativePath => readFile(path.join(root, relativePath), 'utf8');

const candidateId = '3702dff0-617c-436f-8eac-17c22dfb188c';
const applicationId = '48c7f990-05ab-4dd7-98ea-4023b46ee4a8';
const base = {
  candidateId,
  applicationId,
  mimeType: 'application/pdf',
  isSelectable: true,
};
const documents = [
  {
    ...base,
    id: 'candidate-resume',
    documentType: 'Resume',
    fileName: 'TOMBADO, LEIKA BIANCA ISABELLE T. (RESUME) (1).pdf',
    source: 'candidate_document',
    sourceId: '66466997-0000-4000-8000-000000000000',
    storageBucket: 'candidate-recruitment-documents',
    storagePath: `${candidateId}/resume.pdf`,
  },
  {
    ...base,
    id: 'digital-rating',
    documentType: 'Interview Rating',
    fileName: 'Rita Krizelle Enaje · Digital rating.pdf',
    source: 'rating',
    sourceId: '84756452-0000-4000-8000-000000000000',
  },
  {
    ...base,
    id: 'offer',
    documentType: 'Offer',
    fileName: 'OFFER-116245 · Offer PDF',
    source: 'offer',
    sourceId: 'fbdd2792-dd34-4ad3-9872-a7bb4608944d',
  },
];

assert.deepEqual(
  getDefaultOfferPackageDocumentIds(documents),
  ['candidate-resume', 'digital-rating', 'offer'],
  'an existing candidate-document resume must complete the default package',
);
assert.deepEqual(
  getDefaultOfferPackageDocumentIds(documents.filter(document => document.documentType !== 'Resume')),
  ['digital-rating', 'offer'],
  'a missing resume must remain missing',
);
assert.deepEqual(
  getDefaultOfferPackageDocumentIds([{ ...documents[0], isSelectable: false }, ...documents.slice(1)]),
  ['digital-rating', 'offer'],
  'an archived or otherwise unselectable resume must not satisfy the package',
);

const duplicateResume = {
  ...documents[0],
  id: 'duplicate-resume',
  sourceId: 'duplicate-record',
};
assert.deepEqual(
  dedupeOfferPackageDocuments([...documents, duplicateResume]).map(document => document.id),
  documents.map(document => document.id),
  'the same stored file must not be submitted twice',
);
assert.equal(normalizeOfferPackageDocumentType('  resume '), 'Resume');
assert.equal(normalizeOfferPackageDocumentType('INTERVIEW RATING'), 'Interview Rating');
assert.equal(resolveCandidateDocumentMimeType({ name: 'candidate.PDF', type: '' }), 'application/pdf');
assert.equal(resolveCandidateDocumentMimeType({ name: 'candidate.docx', type: 'application/octet-stream' }), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
assert.throws(() => resolveCandidateDocumentMimeType({ name: 'candidate.exe', type: 'application/pdf' }), /PDF, JPG, PNG, DOC, or DOCX/);
assert.throws(() => resolveCandidateDocumentMimeType({ name: 'candidate.pdf', type: 'image/png' }), /do not match/);
assert.deepEqual(
  parseSupabaseStorageUrl('https://project.supabase.co/storage/v1/object/sign/recruitment-uploads/candidate%20files/resume.pdf?token=expired'),
  { bucket: 'recruitment-uploads', path: 'candidate files/resume.pdf' },
);
assert.equal(parseSupabaseStorageUrl('https://example.com/resume.pdf'), null);
assert.deepEqual(
  resolveRecruitmentResumeStorageLocation('resumes/TOMBADO%20LEIKA.pdf'),
  { bucket: 'recruitment-uploads', path: 'resumes/TOMBADO%20LEIKA.pdf' },
);
assert.equal(resolveRecruitmentResumeStorageLocation('https://drive.google.com/resume.pdf'), null);

const migration = await source('supabase/migrations/20260904120000_repair_offer_approval_and_evaluation_assignment_workflows.sql');
const evaluationTimestampMigration = await source('supabase/migrations/20260904123000_add_evaluation_updated_at.sql');
const legacyResumePolicy = await source('supabase/migrations/20260904125500_fix_offer_resume_snapshot_storage_policy.sql');
const workflowIndexes = await source('supabase/migrations/20260904131000_index_offer_evaluation_workflow_foreign_keys.sql');
const offerBaseMigration = await source('supabase/migrations/20260901113000_candidate_rating_summary_offer_approval_phase2.sql');
const offerService = await source('services/offerApprovalService.ts');
const requester = await source('components/recruitment/OfferApprovalPackageModal.tsx');
const approver = await source('components/recruitment/OfferApprovalReviewModal.tsx');
const evaluationService = await source('services/evaluationService.ts');
const performEvaluation = await source('pages/evaluation/PerformEvaluation.tsx');
const evaluationsDashboard = await source('pages/evaluation/Evaluations.tsx');
const submissionHardening = await source('supabase/migrations/20260824062000_harden_evaluation_submission_assignment.sql');

for (const required of ['job_post_id', 'requisition_id', 'offer_id', 'application_id', 'candidate_id', 'requester_user_id']) {
  assert.match(`${offerBaseMigration}\n${migration}`, new RegExp(required), `offer requests must retain ${required}`);
}
assert.match(migration, /function public\.update_job_candidate_document_type/);
assert.match(migration, /CANDIDATE_DOCUMENT_RECLASSIFIED/);
assert.match(migration, /already recorded in an approval package cannot be reclassified/);
assert.match(migration, /set archived_at = now\(\)/);
assert.doesNotMatch(offerService.match(/export const removeCandidateDocument[\s\S]*?\n};/)?.[0] || '', /storage[\s\S]*remove/);
assert.match(migration, /sync_approved_offer_application_stage/);
assert.match(migration, /stage not in \('Offer', 'Hired', 'Rejected', 'Withdrawn'\)/);
assert.match(migration, /assignment\.approver_user_id = \(select public\.current_hris_user_id\(\)\)/);
assert.match(migration, /attachment->>'sourceId'/);
assert.match(offerService, /createSignedUrl\(storagePath, 5 \* 60\)/);
assert.match(offerService, /beginDocumentPreview\(\)/);
assert.match(offerService, /resolveRecruitmentResumeStorageLocation/);
assert.match(offerService, /snapshot\.storagePath/);
assert.match(offerService, /dedupeOfferPackageDocuments\(input\.documents\)/);
assert.match(requester, /getDefaultOfferPackageDocumentIds/);
assert.match(requester, /updateCandidateDocumentType/);
assert.match(requester, /Document type for \$\{document\.fileName\}/);
assert.match(requester, /sm:grid-cols/);
assert.match(requester, /role="alert"/);
assert.match(requester, /role="status"/);
assert.match(approver, /Unable to open \$\{document\.fileName\}/);
assert.match(approver, /String\(result\.status \|\| ''\) === 'Approved'/);

assert.match(migration, /evaluation_evaluators_assignment_shape_check/);
assert.match(migration, /type = 'Individual' and user_id is not null/);
assert.match(migration, /function public\.get_my_evaluation_workspace/);
assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
assert.match(migration, /raise exception 'This evaluation is not assigned to your account'/);
assert.match(migration, /'raterProfileId', actor_id/);
assert.match(migration, /'assignmentRecords'/);
assert.match(migration, /'In Progress'/);
assert.match(migration, /refresh_evaluation_assignment_members/);
assert.match(migration, /after insert or update or delete on public\.evaluation_evaluators/);
assert.match(evaluationTimestampMigration, /add column if not exists updated_at timestamptz/);
assert.match(legacyResumePolicy, /attachment->>'sourceId' = request\.application_id::text/);
assert.match(legacyResumePolicy, /attachment->>'storagePath'/);
assert.match(workflowIndexes, /job_offer_approval_requests_application_id_idx/);
assert.match(workflowIndexes, /evaluation_assignments_timeline_id_idx/);
assert.match(submissionHardening, /rater_id = \(select public\.current_hris_user_id\(\)\)/);

const targetProjection = migration.match(/'targetUsers'[\s\S]*?'questions'/)?.[0] || '';
for (const sensitiveField of ['salary', 'bank', 'tin', 'sss', 'disciplinary']) {
  assert.doesNotMatch(targetProjection, new RegExp(sensitiveField, 'i'), `workspace must not expose ${sensitiveField}`);
}
assert.match(evaluationService, /get_my_evaluation_workspace/);
assert.match(evaluationService, /raterProfileId: String\(payload\.raterProfileId\)/);
assert.doesNotMatch(evaluationService.match(/export const resolveCurrentHrisUserId[\s\S]*?\n};/)?.[0] || '', /return fallbackId/);
assert.match(performEvaluation, /fetchMyEvaluationWorkspace/);
assert.doesNotMatch(performEvaluation, /from\('hris_users'\)/);
assert.doesNotMatch(performEvaluation, /isUserEligibleEvaluator/);
assert.doesNotMatch(performEvaluation, /raterProfileId \|\| user\.id/);
assert.match(evaluationsDashboard, /from\('evaluation_assignments'\)/);
assert.match(evaluationsDashboard, /evaluator_user_ids/);
assert.doesNotMatch(evaluationsDashboard, /employeeProfileId \|\| user\.id/);

assert.equal((migration.match(/\$\$/g) || []).length % 2, 0, 'migration dollar quotes must be balanced');

console.log('Offer approval and evaluation assignment workflow repair checks passed.');
