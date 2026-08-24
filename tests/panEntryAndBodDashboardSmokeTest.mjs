import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const page = read('pages/employees/PersonnelActionNotice.tsx');
const modal = read('components/employees/PANModal.tsx');
const approverSelect = read('components/feedback/EmployeeMultiSelect.tsx');
const dashboard = read('components/dashboard/ManagerDashboard.tsx');
const directoryMigration = read('supabase/migrations/20260824190000_repair_pan_directory_lookup.sql');

assert.match(page, /supabase\.rpc\('get_pan_directory'\)/);
assert.match(page, /directory\.employees/);
assert.match(page, /directory\.approvers/);
assert.match(page, /toLowerCase\(\) === 'active' \? 'Active' : 'Inactive'/);
assert.match(directoryMigration, /public\.can_access_hris_user\(candidate\.id\)/);
assert.match(directoryMigration, /assignment\.role_id = 'Board of Director'/);
assert.match(directoryMigration, /revoke all on function public\.get_pan_directory\(\) from public, anon, authenticated/);
assert.match(modal, /item\.employeeId, item\.email, item\.position, item\.department, item\.businessUnit/);
assert.match(modal, /Selected: \{selectedEmployee\.name\}/);
assert.match(modal, /employeeId: undefined/);
assert.match(modal, /otherBusinessUnitText\[side\]/);
assert.match(modal, /parseBusinessUnitList/);
assert.match(approverSelect, /user\.businessUnit/);
assert.match(approverSelect, /user\.employeeId/);
assert.match(dashboard, /const isBodDashboard/);
assert.match(dashboard, /!isBodDashboard && <Card title="COE Requests">/);
assert.match(dashboard, /if \(isBodDashboard\)[\s\S]*setCoeRequests\(\[\]\)/);

console.log('PAN entry and BOD dashboard smoke tests passed.');
