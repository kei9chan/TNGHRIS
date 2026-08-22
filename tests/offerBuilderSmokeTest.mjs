import fs from 'node:fs';
import assert from 'node:assert/strict';

const builder = fs.readFileSync('components/recruitment/OfferCreationDrawer.tsx', 'utf8');
const offers = fs.readFileSync('pages/recruitment/Offers.tsx', 'utf8');
const publicOffer = fs.readFileSync('supabase/functions/public-offer/index.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260822060000_offer_value_builder.sql', 'utf8');

for (const label of ['Role & Job Details', 'Compensation', 'Schedule & Location', 'Benefits & Growth', 'Review & Send']) assert.match(builder, new RegExp(label.replace('&', '\\&')));
for (const behavior of ['localStorage', 'beforeunload', 'Saving…', 'Draft saved just now', 'Unable to save. Retry', 'Save Draft', 'Preview Offer', 'Send Offer']) assert.ok(builder.includes(behavior), `Missing ${behavior}`);
for (const feature of ['Role Purpose', 'Key Responsibilities', 'What Success Looks Like', 'First 90 Days', 'grossAnnualizedSalary', 'Career Growth Journey', 'Candidate signature', 'Download PDF']) assert.ok(builder.includes(feature), `Missing ${feature}`);
assert.match(builder, /amount \* 12/);
assert.match(builder, /file\.size > 2 \* 1024 \* 1024/);
assert.match(builder, /image\/svg\+xml/);
assert.match(offers, /status: OfferStatus\.Draft/);
assert.match(offers, /\/api\/recruitment-email/);
assert.match(offers, /status: OfferStatus\.Sent/);
assert.match(publicOffer, /\.eq\('secure_token', token\)/);
assert.match(publicOffer, /\['accept', 'decline'\]/);
assert.match(migration, /offer_details jsonb/);
assert.match(migration, /enable row level security/);
assert.match(migration, /file_size_limit/);
assert.match(migration, /false,\n\s+2097152/);
assert.match(migration, /revoke all on function public\.capture_job_offer_history/);

console.log('Offer builder smoke test passed.');
