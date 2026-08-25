import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const generator = read('components/recruitment/JobPostTemplateGenerator.tsx');
const templatePage = read('pages/recruitment/JobPostTemplates.tsx');
const savedPage = read('pages/recruitment/SavedJobPosts.tsx');
const helpers = read('components/recruitment/jobPostDesigns.ts');
const routes = read('App.tsx');
const navigation = read('constants.ts');
const migration = read('supabase/migrations/20260825113000_job_post_design_library.sql');

assert.ok(generator.includes("templateKey: isNew ? undefined : source.templateKey"), 'new templates must not reuse a starter key');
assert.ok(generator.includes("isStarter: isNew ? false : source.isStarter"), 'new templates must be editable custom templates');
assert.ok(generator.includes("purpose?: 'template' | 'post'"), 'editor must support both reusable templates and finished posts');
assert.ok(generator.includes('Save Job Post'), 'post editor must offer a clear save action');
assert.ok(generator.includes('Download Image'), 'saved posts must remain downloadable');

assert.ok(templatePage.includes('Role.HRStaff') && templatePage.includes('Role.HRManager'), 'HR Staff and HR Manager must be explicitly allowed to manage templates');
assert.ok(templatePage.includes('Use Template'), 'template cards must start a finished job post');
assert.ok(templatePage.includes("from('job_post_designs').insert"), 'using a template must save a separate design record');
assert.ok(templatePage.includes("navigate('/recruitment/saved-job-posts')"), 'saved posts must open in the design library');

assert.ok(savedPage.includes("from('job_post_designs').select"), 'saved-job-post page must load the design library');
assert.ok(savedPage.includes("from('job_post_designs').update"), 'saved posts must be editable');
assert.ok(savedPage.includes('Edit / Download'), 'saved posts must expose editing and download access');
assert.ok(helpers.includes('source_template_id'), 'saved posts must retain their source-template relationship');

assert.ok(routes.includes('path="saved-job-posts"'), 'saved-job-post route must be registered');
assert.ok(navigation.includes("name: 'Saved Job Posts'"), 'saved-job-post page must appear in Recruitment navigation');
assert.ok(migration.includes('create table if not exists public.job_post_designs'), 'migration must create the saved design library');
for (const operation of ['insert', 'update', 'delete']) {
  assert.ok(migration.includes(`job_post_templates_hr_${operation}`), `migration must include the HR template ${operation} policy`);
  assert.ok(migration.includes(`job_post_designs_hr_${operation}`), `migration must include the HR design ${operation} policy`);
}

console.log('Job post design library smoke test passed.');
