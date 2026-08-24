import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const page = read('pages/employees/PersonnelActionNotice.tsx');
const editor = read('components/employees/PANModal.tsx');
const templates = read('components/employees/PANTemplateTable.tsx');
const templateEditor = read('components/employees/PANTemplateModal.tsx');
const printable = read('components/employees/PrintablePAN.tsx');
const migration = read('supabase/migrations/20260824133000_pan_template_redesign.sql');

assert.match(editor, /size="full"/);
assert.match(editor, /From \/ Current/);
assert.match(editor, /To \/ New/);
assert.match(editor, /shouldShowSalary/);
assert.match(editor, /createTemplateSnapshot/);
assert.match(templates, /Templates can be customized per business unit/);
assert.match(templates, /onDuplicate/);
assert.match(templates, /onArchive/);
assert.match(templateEditor, /Publish template/);
assert.match(templateEditor, /Document sections/);
assert.match(templateEditor, /Field controls/);
assert.match(printable, /createPortal/);
assert.match(printable, /id="pan-print-portal-root"/);
assert.match(printable, /Download PDF/);
assert.match(printable, /body > \*:not\(#pan-print-portal-root\)/);
assert.match(page, /save_pan_template/);
assert.match(page, /archive_pan_template/);
assert.match(page, /set_default_pan_template/);
assert.match(migration, /template_snapshot jsonb/);
assert.match(migration, /pan_templates_one_published_default_idx/);
assert.match(migration, /create policy pan_templates_manager_update/);
assert.match(migration, /security invoker/);

console.log('PAN template redesign smoke tests passed.');
