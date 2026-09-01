import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20260901090000_interview_rating_templates_phase1.sql');
const directoryMigration = read('supabase/migrations/20260901093000_interview_rating_directory_columns.sql');
const grantsMigration = read('supabase/migrations/20260901094500_interview_rating_function_grants.sql');
const service = read('services/interviewRatingService.ts');
const types = read('types.ts');
const templatesPage = read('pages/recruitment/InterviewTemplates.tsx');
const templateEditor = read('components/recruitment/InterviewTemplateEditor.tsx');
const createModal = read('components/recruitment/CreateInterviewRatingModal.tsx');
const ratingEditor = read('components/recruitment/InterviewRatingEditor.tsx');
const candidateProfile = read('components/recruitment/CandidateProfileModal.tsx');
const ratingPage = read('pages/recruitment/InterviewRatingPage.tsx');
const app = read('App.tsx');
const constants = read('constants.ts');

const criteria = [
  'First Impression',
  'Appearance',
  'Self-Expression/Communication',
  'Behaviour',
  'Responsiveness',
  'Background',
  'Track Record',
  'Teamwork',
];
const scale = ['Very Good', 'Good', 'Average', 'Poor', 'Very Poor'];

assert.match(migration, /create table if not exists public\.job_interview_templates/);
assert.match(migration, /create table if not exists public\.job_interview_rating_records/);
assert.match(migration, /create table if not exists public\.job_interview_rating_attachments/);
assert.match(migration, /template_snapshot jsonb/);
assert.match(migration, /unique index if not exists job_interview_rating_records_assignment_key/);
assert.match(migration, /Standard Interview Rating Form — Existing Company Template/);
for (const criterion of criteria) assert.match(migration, new RegExp(criterion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
for (const label of scale) assert.match(migration, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(migration, /'value', 5/);
assert.match(migration, /'value', 1/);
assert.match(migration, /supersedes_template_id/);
assert.match(migration, /INTERVIEW_RATING_ASSIGNED/);
assert.match(migration, /INTERVIEW_RATING_SUBMITTED/);
assert.match(migration, /INTERVIEW_RATING_RETURNED/);
assert.match(migration, /INTERVIEW_RATING_REOPENED/);
assert.match(migration, /security invoker/);
assert.match(migration, /set_config\('tng\.interview_rating_action'/);
assert.match(migration, /Submitted interview ratings are locked/);
assert.match(migration, /interview-rating-attachments/);
assert.match(directoryMigration, /select u\.id, u\.full_name, u\.email, u\.position/);
assert.doesNotMatch(directoryMigration, /select u\.\*/);
assert.match(grantsMigration, /grant execute on function public\.submit_interview_rating/);
assert.match(grantsMigration, /revoke all on function public\.lock_interview_rating/);

assert.match(types, /export type InterviewRatingStatus/);
assert.match(types, /export interface InterviewRatingTemplate/);
assert.match(types, /export interface InterviewRatingRecord/);
assert.match(types, /export interface InterviewRatingAttachment/);
assert.match(types, /INTERVIEW_RATING_ASSIGNED/);

assert.match(service, /fetchActiveInterviewTemplates/);
assert.match(service, /createInterviewRatingAssignments/);
assert.match(service, /submitInterviewRating/);
assert.match(service, /reopenInterviewRating/);
assert.match(service, /uploadInterviewRatingAttachment/);
assert.match(service, /fetchInterviewRatingCandidate/);
assert.match(service, /removeInterviewRatingAttachment/);
assert.match(service, /downloadInterviewRatingPdf/);
assert.match(service, /templateMatchesApplication/);
assert.match(service, /label: String\(option\.label/);
assert.match(service, /value: Number\(item\.value\)/);

assert.match(constants, /Interview Templates/);
assert.match(constants, /interview-templates/);
assert.match(app, /path="interview-templates"/);
assert.match(app, /path="interview-ratings\/:ratingId"/);
assert.match(templatesPage, /Create interview template/);
assert.match(templatesPage, /Duplicate/);
assert.match(templatesPage, /Deactivate/);
assert.match(templateEditor, /Assignment rules/);
assert.match(templateEditor, /Required/);
assert.match(templateEditor, /Move section up/);
assert.match(templateEditor, /Rating scale/);
assert.match(createModal, /Search reviewers/);
assert.match(createModal, /Send rating forms/);
assert.match(createModal, /selectedReviewerIds/);
assert.match(ratingEditor, /returned for revision/i);
assert.match(ratingEditor, /Upload scan/);
assert.match(ratingEditor, /Remove/);
assert.match(ratingEditor, /Submit rating/);
assert.match(ratingEditor, /Download PDF/);
assert.match(candidateProfile, /Interview Ratings/);
assert.match(candidateProfile, /of \{ratings\.length\} Submitted/);
assert.match(candidateProfile, /Create Interview Rating/);
assert.match(candidateProfile, /Remove/);
assert.match(candidateProfile, /View rating/);
assert.match(candidateProfile, /Download PDF/);
assert.match(ratingPage, /This rating is unavailable or not assigned to your account/);
assert.match(migration, /get_interview_rating_candidate/);
assert.match(migration, /INTERVIEW_RATING_ATTACHMENT_ADDED/);
assert.match(migration, /INTERVIEW_RATING_ATTACHMENT_REMOVED/);

const phaseOneFiles = [service, types, templatesPage, templateEditor, createModal, ratingEditor, candidateProfile, ratingPage];
assert.ok(phaseOneFiles.every(file => !file.includes('Prepare Hiring Packet') && !file.includes('Hiring Packet')),
  'Phase 2 hiring-packet work must not be started during Phase 1.');

console.log('Interview Ratings Phase 1 smoke checks passed.');
