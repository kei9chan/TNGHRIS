import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(path, 'utf8');
const [builder, employment, document, offerPdf, table, detail, applicants, mapper, workspace, interviewPdf, migration, constraintFix] = await Promise.all([
  read('components/recruitment/OfferCreationDrawer.tsx'),
  read('components/recruitment/offerEmployment.ts'),
  read('components/recruitment/OfferDocument.tsx'),
  read('components/recruitment/offerPdf.ts'),
  read('components/recruitment/OfferTable.tsx'),
  read('components/recruitment/OfferDetailModal.tsx'),
  read('pages/recruitment/Applicants.tsx'),
  read('services/jobOfferMapper.ts'),
  read('services/jobOfferWorkspaceService.ts'),
  read('services/interviewRatingService.ts'),
  read('supabase/migrations/20260903073000_offer_employment_terms_and_revisions.sql'),
  read('supabase/migrations/20260904081427_fix_job_offer_employment_type_constraint.sql'),
]);

for (const employmentType of ['Regular', 'Probationary', 'Seasonal / Fixed-Term', 'Consultant / Contractor', 'Custom']) {
  assert.ok(employment.includes(employmentType), `Missing employment type: ${employmentType}`);
}
assert.match(builder, /Employment end date/);
assert.match(builder, /Employment end date must be later than the start date/);
assert.match(builder, /Offer expiration is separate from the employment end date/);
assert.match(builder, /Additional Terms & Conditions/);
assert.match(builder, /Save as Default Clause/);
assert.match(document, /Additional Terms &amp; Conditions/);
assert.match(offerPdf, /Additional Terms & Conditions/);
assert.match(table, /employmentTypeLabel/);
assert.match(detail, /Create Revised Version/);
assert.match(applicants, /employmentTypeLabel/);
assert.match(mapper, /employment_end_date/);
assert.match(workspace, /create_job_offer_revision/);

for (const pdfFeature of ['INTERVIEW RATING REPORT', 'Overall score', 'Performance', 'Final Recommendation', 'Rating Matrix', 'Interview Observations', 'Availability, Assets & Limitations', 'Reviewer Details & Acknowledgement']) {
  assert.match(interviewPdf, new RegExp(pdfFeature.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.match(interviewPdf, /Acknowledged/);
assert.match(interviewPdf, /Page \$\{page\} of \$\{totalPages\}/);

assert.match(migration, /add column if not exists employment_end_date date/);
assert.match(migration, /check \(employment_end_date is null or employment_end_date > start_date\)/);
assert.match(migration, /security invoker/);
assert.match(migration, /supersedes_offer_id/);
assert.match(migration, /offer_details - 'candidateResponse' - 'emailDelivery' - 'welcomeEmail'/);
assert.doesNotMatch(migration, /disable row level security|truncate|delete from public\.job_offers/i);

assert.match(constraintFix, /drop constraint if exists job_offers_employment_type_check/);
for (const employmentType of ['Regular', 'Probationary', 'Seasonal / Fixed-Term', 'Consultant / Contractor', 'Custom', 'Full-Time', 'Part-Time', 'Contract']) {
  assert.ok(constraintFix.includes(`'${employmentType}'`), `Database constraint missing employment type: ${employmentType}`);
}
assert.match(constraintFix, /validate constraint job_offers_employment_type_check/);
assert.doesNotMatch(constraintFix, /disable row level security|truncate|delete from public\.job_offers/i);

console.log('Offer employment terms and interview PDF smoke test passed.');
