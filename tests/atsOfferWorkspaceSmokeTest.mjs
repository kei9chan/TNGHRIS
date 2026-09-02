import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = relativePath => readFile(path.join(root, relativePath), 'utf8');

const [app, applicants, offers, table, detail, drawer, service, edge, migration] = await Promise.all([
  source('App.tsx'),
  source('pages/recruitment/Applicants.tsx'),
  source('pages/recruitment/Offers.tsx'),
  source('components/recruitment/OfferTable.tsx'),
  source('components/recruitment/OfferDetailModal.tsx'),
  source('components/recruitment/OfferCreationDrawer.tsx'),
  source('services/jobOfferWorkspaceService.ts'),
  source('supabase/functions/public-offer/index.ts'),
  source('supabase/migrations/20260902125000_offer_workspace_integrity.sql'),
]);

assert.match(app, /React\.lazy\(\(\) => import\('\.\/pages\/OfferResponse'\)\)/);
assert.match(app, /path="\/offer\/:token" element=\{<OfferResponse \/>\}/);
for (const label of ['View Job Offers', 'View Profile', 'Create Interview Rating', 'Schedule Interview', 'Create Offer', 'View/Edit Offer', 'Open Live Offer', 'Reject']) {
  assert.ok(applicants.includes(label), `Missing ATS action: ${label}`);
}
assert.match(applicants, />Offer<\/th>/);
assert.match(applicants, /selectCurrentOffer\(offers, app\.id\)/);
assert.match(applicants, /initialApplicationId=\{offerApplication\.id\}/);
assert.match(applicants, /React\.lazy\(\(\) => import\('\.\.\/\.\.\/components\/recruitment\/OfferCreationDrawer'\)\)/);
assert.match(drawer, /initialApplicationId\?: string/);
assert.match(drawer, /Request Offer Approval/);
assert.match(drawer, /saved\.approvalStatus !== 'Approved'/);
assert.match(service, /selectCurrentOffer/);
assert.match(service, /already has a published offer/);
assert.match(service, /draft\.approvalStatus !== 'Approved'/);
assert.match(service, /eq\('approval_status', 'Approved'\)/);
assert.match(table, /Open Live Offer/);
assert.match(detail, /candidateOfferUrl/);
assert.match(offers, /sendApprovedOffer/);
assert.match(edge, /This offer link is invalid/);
assert.match(edge, /This offer link expired/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /already has a current offer/);
assert.match(migration, /approval workflow before it can be sent/);
assert.match(migration, /new\.approval_status := 'Not Requested'/);

console.log('ATS offer workspace smoke test passed.');
