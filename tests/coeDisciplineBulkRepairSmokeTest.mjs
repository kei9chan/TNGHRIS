import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const migration = read('supabase/migrations/20260824090000_coe_discipline_bulk_and_approval_repair.sql');
const coeRequests = read('pages/admin/COERequests.tsx');
const coeTemplates = read('pages/admin/COETemplates.tsx');
const coeTemplateModal = read('components/admin/COETemplateModal.tsx');
const printableCoe = read('components/admin/PrintableCOE.tsx');
const coeDocument = read('services/coeDocument.ts');
const disciplinePage = read('pages/feedback/CodeOfDiscipline.tsx');
const disciplineImport = read('services/disciplineImportService.ts');
const disciplineImportModal = read('components/feedback/DisciplineBulkImportModal.tsx');
const categoryModal = read('components/feedback/CategoryManagerModal.tsx');
const entryModal = read('components/feedback/DisciplineEntryModal.tsx');
const additionalApprovals = read('hooks/useAdditionalApprovals.ts');

// Immutable COE snapshots, secure retrieval, same-BU fallback, and audit events.
assert.match(migration, /template_snapshot jsonb/);
assert.match(migration, /employee_snapshot jsonb/);
assert.match(migration, /private\.build_coe_document/);
assert.match(migration, /t\.business_unit_id = coalesce\(p_request\.employee_business_unit_id/);
assert.match(migration, /protected system fallback/);
assert.match(migration, /approve_coe_request_with_snapshot/);
assert.match(migration, /get_coe_document/);
assert.match(migration, /record_coe_document_event/);
assert.match(migration, /You do not have permission to approve or reject this COE request/);
assert.match(migration, /Created a protected fallback snapshot while recovering historical COE data/);
assert.match(migration, /employee_value := employee_value - 'salary'/);
assert.match(migration, /grant execute on function public\.get_coe_document\(uuid\) to authenticated/);
assert.doesNotMatch(migration, /drop\s+table/i, 'the migration must preserve existing records');
assert.doesNotMatch(migration, /disable\s+row\s+level\s+security/i, 'RLS must remain enabled');

for (const style of ['classic-corporate', 'modern-minimal', 'branded-accent', 'business-unit-signature']) {
  assert.match(migration, new RegExp(style));
  assert.match(coeDocument, new RegExp(style));
}
for (const placeholder of ['employee_name', 'position', 'department', 'business_unit', 'date_hired', 'end_date', 'employment_status', 'salary', 'purpose', 'date_today', 'business_address', 'signatory_name', 'signatory_position']) {
  assert.match(coeDocument, new RegExp(`\\{\\{${placeholder}\\}\\}`));
}

assert.match(coeRequests, /fetchCoeDocument/);
assert.match(coeRequests, /COE document could not be prepared/);
assert.doesNotMatch(coeRequests, /Template or Employee data missing/);
assert.doesNotMatch(coeRequests, /activeTemplates\[0\]/);
assert.match(coeTemplateModal, /Live Preview/);
assert.match(coeTemplateModal, /Save Draft/);
assert.match(coeTemplateModal, /Publish &amp; Activate/);
assert.match(coeTemplateModal, /validateCoePlaceholders/);
assert.match(coeTemplates, /Duplicate/);
assert.match(coeTemplates, /archiveCoeTemplate/);
assert.doesNotMatch(coeTemplates, /\.delete\(\)/);
assert.match(printableCoe, /Download PDF/);
assert.match(printableCoe, /autoPaging: 'text'/);
assert.match(printableCoe, /recordCoeDocumentEvent/);

// Database-backed category metadata, flexible sanctions, and safe batch import.
assert.match(migration, /description text,[\s\S]*display_order integer[\s\S]*is_active boolean/);
assert.match(migration, /discipline_entry_versions/);
assert.match(migration, /discipline_import_runs/);
assert.match(migration, /bulk_import_discipline_entries/);
assert.match(migration, /discipline_entries_code_ci_unique/);
assert.match(migration, /Duplicate code appears more than once in this upload/);
assert.match(migration, /duplicate entry with the same category and description/);
assert.match(migration, /Sanction levels cannot contain gaps/);
assert.match(migration, /maximum of 5,000 rows/);
assert.match(migration, /grant select on table public\.discipline_import_runs to authenticated/);

assert.match(disciplinePage, /Download CSV Template/);
assert.match(disciplinePage, /Download XLSX Template/);
assert.match(disciplinePage, /Batch Upload/);
assert.match(disciplinePage, /Manage Categories/);
assert.match(disciplinePage, /Configured order/);
assert.doesNotMatch(disciplinePage, /const\s+categories\s*=\s*\[['\"]/i, 'categories must not be hardcoded');
assert.doesNotMatch(disciplinePage, /\.delete\(\)/, 'entries must be archived instead of deleted');
assert.match(categoryModal, /safely archive categories/);
assert.match(categoryModal, /Restore category/);
assert.match(categoryModal, /entryCount|actualCount/);
assert.match(entryModal, /handleMoveSanction/);
assert.match(entryModal, /\+ Add Step/);

assert.match(disciplineImport, /new ExcelJS\.Workbook/);
assert.match(disciplineImport, /Instructions/);
assert.match(disciplineImport, /Reference Data/);
assert.match(disciplineImport, /parseCsvRecords/);
assert.match(disciplineImport, /validateDisciplineImportRows/);
assert.match(disciplineImport, /downloadDisciplineErrorReport/);
assert.match(disciplineImportModal, /Validation preview/);
assert.match(disciplineImportModal, /Confirm Import/);
assert.match(disciplineImportModal, /importDisciplineRows\(rows, mode, file\.name\)/);
for (const mode of ['add_only', 'update_only', 'add_update']) assert.match(disciplineImportModal, new RegExp(mode));

// The award query must never cast the invalid enum literal "Pending".
assert.match(additionalApprovals, /AWARD_PENDING_STATUSES = \['PendingApproval', 'Pending Approval'\]/);
assert.doesNotMatch(additionalApprovals, /\.in\('status',\s*\[[^\]]*['\"]Pending['\"]/);
assert.match(migration, /set status = 'PendingApproval'::public\.award_status/);

console.log('COE, discipline bulk import, and approval workload regression smoke tests passed.');
