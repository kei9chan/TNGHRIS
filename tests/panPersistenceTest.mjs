import assert from 'node:assert/strict';import{build}from'esbuild';import{mkdtemp,rm,readFile}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{pathToFileURL}from'node:url';
const dir=await mkdtemp(join(tmpdir(),'pan-save-'));try{
await build({entryPoints:['services/panPersistence.ts'],bundle:true,platform:'node',format:'esm',outfile:join(dir,'test.mjs')});
const{panAmount,panPayload}=await import(pathToFileURL(join(dir,'test.mjs')));
assert.equal(panAmount('PHP 18,128','Basic'),18128);assert.equal(panAmount('₱ 1,000.50','Basic'),1000.5);assert.equal(panAmount('','Basic'),0);assert.equal(panAmount(0,'Basic'),0);assert.throws(()=>panAmount('oops','Basic'),/Basic/);
const record={id:'11111111-1111-4111-8111-111111111111',employeeId:'22222222-2222-4222-8222-222222222222',employeeName:'Fixture',effectiveDate:new Date(2026,8,7),templateVersion:2,templateName:'Fixture template',templateSnapshot:{name:'Fixture'},actionTaken:{salaryIncrease:true},particulars:{from:{salary:{basic:'PHP 18,128'}},to:{salary:{basic:20000,deminimis:1000,reimbursable:0,payBasis:'net_tax'}}},routingSteps:[{userId:'33333333-3333-4333-8333-333333333333'}]};
const p=panPayload(record,'44444444-4444-4444-8444-444444444444');assert.equal(p.id,record.id);assert.equal(p.effective_date,'2026-09-07');assert.equal(p.particulars.from.salary.basic,18128);assert.equal(p.particulars.from.salary.payBasis,'gross');assert.equal(p.particulars.to.salary.reimbursable,0);assert.equal(p.particulars.to.salary.payBasis,'net_tax');assert.equal(p.particulars.panTemplate.version,2);assert.deepEqual(p.routing_steps,record.routingSteps);
assert.throws(()=>panPayload({...record,particulars:{...record.particulars,to:{salary:{...record.particulars.to.salary,payBasis:'invalid'}}}},'fixture'),/choose Gross or Net/);
for(const column of ['template_version','template_name','template_snapshot','action_type'])assert.equal(column in p,false);
assert.throws(()=>panPayload({...record,effectiveDate:''},'fixture'),/Effective date/);assert.throws(()=>panPayload({...record,employeeId:''},'fixture'),/Employee/);
assert.equal(panPayload({...record,createdByUserId:'original'},'editor').created_by_user_id,'original');
const modal=await readFile('components/employees/PANModal.tsx','utf8');assert.match(modal,/saveLock.current \|\| sent/);assert.match(modal,/error.savedPan.id/);assert.match(modal,/role="alert"/);assert.match(modal,/disabled=\{saving \|\| sent\}/);assert.match(modal,/Employee shoulders withholding tax/);assert.match(modal,/Employer shoulders withholding tax/);
const printable=await readFile('components/employees/PrintablePAN.tsx','utf8');assert.match(printable,/Employer shoulders withholding tax/);assert.match(printable,/Employee shoulders withholding tax/);
const payroll=await readFile('modules/payroll/PayPackagesPage.tsx','utf8');assert.match(payroll,/payBasis:s\.payBasis\|\|'gross'/);
const migration=await readFile('supabase/migrations/20260908220347_pan_gross_net_salary_basis.sql','utf8');assert.match(migration,/'payBasis',coalesce\(v->>'payBasis','gross'\)/);assert.match(migration,/Gross\/net salary arrangement must match the approved PAN/);
console.log('PAN payload, currency, validation, metadata preservation, stable retry ID and form-state checks passed.');
}finally{await rm(dir,{recursive:true,force:true});}
