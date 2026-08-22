import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const presets = fs.readFileSync(path.join(root, 'components/recruitment/jobPostTemplatePresets.ts'), 'utf8');
const generator = fs.readFileSync(path.join(root, 'components/recruitment/JobPostTemplateGenerator.tsx'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260822050000_job_post_template_starters.sql'), 'utf8');

const names = [
  '[DEMO] Guest Experience Associate — The Dessert Museum',
  'The Dessert Museum — Guest Experience Associate',
  'Gootopia — Experience Facilitator',
  'Bakebe — Baking Studio Host',
  'Inflatable Island — Guest Experience & Safety Associate',
  'The Fun Roof — Guest Experience & Reservations Host',
];

for (const name of names) assert.ok(presets.includes(name), `missing starter: ${name}`);
assert.equal((presets.match(/templateKey:/g) || []).length, 6, 'starter keys must remain stable and unique');
assert.equal((presets.match(/isStarter: true/g) || []).length, 5, 'exactly five business-unit starters are reusable');
assert.ok(!presets.includes('[TEXT_PLACEHOLDER'), 'starter presets must not contain text placeholders');
assert.ok(!generator.includes('[LOGO_PLACEHOLDER]'), 'preview must use a wordmark fallback');
assert.ok(generator.includes('application-page-assets'), 'editor must use the shared storage bucket');
for (const column of ['template_key', 'business_unit', 'status', 'is_starter', 'sections', 'cta_link', 'brand_wordmark']) {
  assert.ok(migration.includes(`add column if not exists ${column}`), `migration missing ${column}`);
}

console.log('Job post template smoke test passed.');
