import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = relativePath => readFile(path.join(root, relativePath), 'utf8');

const summary = await source('services/interviewRatingSummary.ts');
const ratingService = await source('services/interviewRatingService.ts');
const panel = await source('components/recruitment/InterviewSummaryPanel.tsx');
const detail = await source('components/recruitment/InterviewSummaryModal.tsx');
const candidateProfile = await source('components/recruitment/CandidateProfileModal.tsx');

for (const label of ['Very Good', 'Good', 'Average', 'Poor', 'Very Poor']) assert.match(summary, new RegExp(label));
for (const criterion of ['First Impression', 'Appearance', 'Self-Expression/Communication', 'Behaviour', 'Responsiveness', 'Background', 'Track Record', 'Teamwork']) {
  assert.match(summary, new RegExp(criterion.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')));
}
for (const field of ["Applicant's Motivation", 'Possible Reservations', 'Other Positions', 'Apparent Assets and Limitations', 'Additional Comments']) assert.match(summary, new RegExp(field.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')));

assert.match(summary, /const INTERVIEW_RATING_SCALE/);
assert.match(summary, /const submittedIds = new Set/);
assert.match(summary, /overallScore/);
assert.match(summary, /Preliminary recommendation/);
assert.match(summary, /Consensus reached/);
assert.match(panel, /No interview rating submitted yet/);
assert.match(panel, /Based on submitted reviewer ratings/);
assert.match(panel, /View detailed summary/);
assert.match(panel, /View full ratings/);
assert.match(panel, /Download PDF/);
assert.match(panel, /Create Interview Rating/);
assert.match(detail, /Interview Summary · \$\{candidateName\}/);
assert.match(detail, /Rating Breakdown/);
assert.match(detail, /Reviewer Consensus/);
assert.match(detail, /Written Evaluation Highlights/);
assert.match(detail, /View original rating forms/);
assert.match(detail, /View individual reviewer ratings/);
assert.match(detail, /Download combined PDF/);
assert.match(detail, /View individual responses/);
assert.match(candidateProfile, /<InterviewSummaryPanel/);
assert.ok(candidateProfile.indexOf('<InterviewSummaryPanel') < candidateProfile.indexOf('Interview Ratings'), 'Summary must be rendered above the original ratings section.');
assert.match(candidateProfile, /<InterviewSummaryModal/);
assert.match(ratingService, /downloadCombinedInterviewRatingsPdf/);
assert.match(ratingService, /createInterviewRatingSummary\(ratings\)/);
assert.match(ratingService, /Template v\$\{rating\.templateVersion\}/);

console.log('Interview Rating Summary Phase 2 smoke checks passed.');
