import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const migration = read('supabase/migrations/20260824160000_batch_imports_and_bod_routing_hardening.sql');
const assetsPage = read('pages/employees/AssetManagement.tsx');
const assetModal = read('components/employees/BatchAssetUploadModal.tsx');
const memoPage = read('pages/feedback/MemoLibrary.tsx');
const memoModal = read('components/feedback/BatchMemoUploadModal.tsx');
const importUtils = read('services/bulkImportUtils.ts');
const settings = read('pages/admin/Settings.tsx');
const bodDashboard = read('components/dashboard/BODDashboard.tsx');
const quickLinks = read('components/dashboard/QuickLinks.tsx');

for (const field of ['asset_tag', 'asset_name', 'asset_type', 'business_unit', 'employee_email', 'employee_id', 'date_assigned', 'purchase_date', 'warranty_expiry']) {
  assert.match(assetModal, new RegExp(field), `asset template is missing ${field}`);
}
for (const field of ['memo_title', 'memo_number', 'memo_type', 'full_memo_content', 'business_unit', 'department', 'employee_ids', 'employee_emails', 'effective_date', 'publication_date', 'requires_acknowledgement', 'attachment_filename']) {
  assert.match(memoModal, new RegExp(field), `memo template is missing ${field}`);
}

assert.match(importUtils, /parseImportFile/);
assert.match(importUtils, /downloadImportXlsxTemplate/);
assert.match(importUtils, /downloadImportErrorReport/);
assert.match(assetModal, /rpc\('import_assets_batch'/);
assert.match(memoModal, /rpc\('import_memos_batch'/);
assert.match(assetModal, /Download Error Report/);
assert.match(memoModal, /Download Error Report/);
assert.match(assetModal, /Asset tags and serial numbers must be unique/);
assert.match(memoModal, /Publish imported memos after validation/);
assert.match(memoModal, /memo_attachments/);

assert.match(migration, /alter table public\.assets[\s\S]*add column if not exists brand/);
assert.match(migration, /alter table public\.memos[\s\S]*add column if not exists memo_number/);
assert.match(migration, /assets_asset_tag_normalized_key/);
assert.match(migration, /assets_serial_number_normalized_key/);
assert.match(migration, /memos_memo_number_normalized_key/);
assert.match(migration, /create or replace function public\.import_assets_batch/);
assert.match(migration, /create or replace function public\.import_memos_batch/);
assert.match(migration, /public\.has_feature_permission\('Assets', 'manage'\)/);
assert.match(migration, /public\.has_feature_permission\('Feedback', 'edit'\)/);
assert.match(migration, /target_employee_ids/);
assert.match(migration, /MEMO_PUBLISHED/);
assert.match(migration, /name = any\(m\.attachments\)/);
assert.doesNotMatch(migration, /current_hris_user_id\(\) is not null\s*\n\s*\);/, 'memo attachment reads must not be globally open to every HRIS user');

assert.match(settings, /const isBodUser/);
assert.match(settings, /normaliseRole/);
assert.match(settings, /usersLoaded && !approverConfigs/);
assert.match(settings, /disabled={!selected \|\| !isBod}/);
assert.match(bodDashboard, /<QuickLinks hideCOE \/>/);
assert.doesNotMatch(bodDashboard, /RequestCOEModal/);
assert.match(quickLinks, /hideCOE/);

console.log('Batch asset/memo import, BOD routing, and BOD COE visibility smoke checks passed.');
