import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260824170000_modern_awards_studio.sql');
const studio = read('components/evaluation/AwardsStudioDashboard.tsx');
const builder = read('components/evaluation/AwardPresetBuilderPage.tsx');
const visualSystem = read('components/evaluation/AwardVisualSystem.tsx');
const renderer = read('components/evaluation/CertificateRenderer.tsx');
const exporter = read('services/awardCertificateExport.ts');
const service = read('services/awardService.ts');

for (const unit of ['Dessert Museum', 'Gootopia', 'Bakebe', 'Inflatable Island', 'Fun Roof']) assert.match(migration, new RegExp(unit));
for (const key of ['guest-experience-star', 'customer-delight-champion', 'team-player-award', 'above-and-beyond', 'service-excellence', 'problem-solver', 'safety-champion', 'reliability-consistency', 'sales-spark', 'culture-builder']) {
  assert.match(migration, new RegExp(`standard-${key}`));
  assert.match(visualSystem, new RegExp(key));
}

assert.match(migration, /on conflict \(preset_key\)/i);
assert.match(migration, /award_templates_one_default_per_bu|Exactly one active default/i);
assert.match(migration, /alter table public\.award_templates enable row level security/i);
assert.match(studio, /Awards Studio/);
assert.match(studio, /Business-unit presets/);
assert.match(studio, /Recognition Wall/);
assert.match(studio, /Ready-made awards/);
assert.match(builder, /'branding'[\s\S]*'content'[\s\S]*'signatories'[\s\S]*'rules'/);
assert.match(builder, /Changes apply to new awards only/);
assert.match(builder, /Save as business-unit default/);
assert.match(builder, /Publish preset/);
assert.match(renderer, /layoutVersion === 'modern-v2'/);
assert.match(renderer, /replace\(\/\\\\n\/g, '\\n'\)/);
assert.match(exporter, /format: 'a4'/);
assert.match(exporter, /data-certificate-page/);
assert.match(service, /template_status/);
assert.match(service, /badge_key/);
assert.doesNotMatch(studio, /🏆|gold foil|ornate border/i);

console.log('Modern Awards Studio smoke tests passed.');
