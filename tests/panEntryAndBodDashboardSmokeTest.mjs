import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const page = read('pages/employees/PersonnelActionNotice.tsx');
const modal = read('components/employees/PANModal.tsx');
const approverSelect = read('components/feedback/EmployeeMultiSelect.tsx');
const dashboard = read('components/dashboard/ManagerDashboard.tsx');

assert.match(page, /id, employee_id, full_name/);
assert.match(page, /toLowerCase\(\) === 'active' \? 'Active' : 'Inactive'/);
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
