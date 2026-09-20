import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui=fs.readFileSync('modules/payroll/ScenarioRun.tsx','utf8');
const sql=fs.readFileSync('supabase/migrations/20260920040000_test_payroll_completion_flow.sql','utf8');

for(const label of ['Review attendance','Finalize payroll','Generate outputs','Approve & release'])assert.ok(ui.includes(label),`missing workflow step: ${label}`);
for(const label of ['Gross pay','Net pay','Employees','Unresolved issues','Generate payslips & reports','View payroll register','View attendance corrections'])assert.ok(ui.includes(label),`missing overview control: ${label}`);
for(const label of ['Employee payslips','Preview payslips','Download ZIP','Private until final approval','Government reports','SSS R3','PhilHealth RF-1','Pag-IBIG MCRF','BIR 2316','Continue to approval'])assert.ok(ui.includes(label),`missing output control: ${label}`);
for(const label of ['HR validation','HR endorsement','HR Manager authorization','Finance authorization','BOD final approval','Finance disbursement'])assert.ok(sql.includes(label),`missing approval stage: ${label}`);
for(const label of ['Payroll register locked','Payroll snapshot saved','Payslips generated','Government reports ready','All attendance exceptions resolved','Required approvals completed','Release & distribute'])assert.ok(ui.includes(label),`missing release gate: ${label}`);

assert.match(sql,/unique\(seed_run_id,output_key\)/i,'outputs must have an idempotency key');
assert.match(sql,/b\.status='Ready'.*unresolved=0/s,'release must require ready outputs and no unresolved issues');
assert.match(sql,/o\.employee_id=actor and o\.status='Released'/,'employee access must be scoped to the current employee and released outputs');
assert.match(sql,/revoke all on payroll_scenario_private\.outputs from public,anon,authenticated/i,'draft outputs must not be directly readable');
assert.ok(ui.includes('Prepared for review and export only. Nothing is automatically submitted to a government agency.'),'government export disclaimer missing');
assert.ok(ui.includes('This isolated test does not create a real payment or alter official payroll history.'),'test isolation warning missing');

console.log('PASS: four-step payroll completion UI, output controls, approval gates, employee privacy, retry idempotency, and isolation copy are present.');
