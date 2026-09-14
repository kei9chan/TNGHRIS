import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import ExcelJS from 'exceljs';
import {PGlite} from '@electric-sql/pglite';
const root=new URL('../',import.meta.url);
const text=await fs.readFile(new URL('modules/payroll/payPackageImport.ts',root),'utf8');
const js=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {prepareImport,simpleImportRows,readImportSheet,simpleHeaders,verifySavedImport}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const employee='10000000-0000-0000-0000-000000000001',scope='20000000-0000-0000-0000-000000000001';
const pan='abcdef01-0000-0000-0000-000000000001';
const context={employeeId:employee,sourceHash:'test-hash',legacy:{rateAmount:25000,salaryBasic:25000},scopes:[{id:scope,name:'Test BU',canEdit:true}],packages:[],sources:[{id:null,label:'Current HRIS record',baseAmount:25000,rateType:'Monthly',deminimis:0,reimbursable:0,conflict:false},{id:pan,label:'Completed PAN',baseAmount:25000,rateType:null,deminimis:0,reimbursable:0,effectiveFrom:'2024-07-15',conflict:false}]};
const input={'Employee code':'TEST-1','Business unit':'Test BU','Pay type':'Employee salary','Effective date':'2026-09-01','Amount unit':'Monthly','Approved basic pay / fee':'25000','Salary source':'Current HRIS record','PAN ID (if applicable)':'PAN-ABCDEF01','Source document / note':'PAN-ABCDEF01','Reason for this record':'Initial setup'};
const row=(v=input)=>simpleImportRows([{row:2,values:v}])[0];
const ready=(v=input,c=context)=>prepareImport(row(v),c);
// 1. Exact uploaded workbook can be supplied privately; committed fixtures contain no employee compensation.
if(process.env.PAY_SOURCE_WORKBOOK){
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.readFile(process.env.PAY_SOURCE_WORKBOOK);
 const c=JSON.parse(await fs.readFile(process.env.PAY_SOURCE_CONTEXT,'utf8'));
 const exact=simpleImportRows(readImportSheet(workbook,'Pay Input',simpleHeaders)).find(r=>r.row===2);
 assert(exact);assert.equal(exact.values['Salary source'],'Current HRIS record');
 const p=prepareImport(exact,c);assert.equal(p.payload.sourcePanId,null);
 assert.equal(p.payload.treatment.sourcePanReference,exact.values['PAN ID (optional)']);
 assert.equal(p.payload.sourceRef,exact.values['Source reference']);
 console.log('1 PASS: exact uploaded row 2 is Ready against read-only production salary-source snapshot (offline permission fixture).');
}else{assert.equal(ready().payload.sourcePanId,null);console.log('1 PASS: equivalent source-choice/PAN-reference regression fixture.');}
// 2. Excel dropdowns are values; rich text, header order/case and invisible spacing must compare consistently.
const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet(' PAY INPUT ');
const headers=[...simpleHeaders].reverse();sheet.addRow(headers.map(h=>' '+h.toUpperCase()+'\u200b '));
sheet.addRow(headers.map(h=>input[h]||''));
sheet.getCell(2,headers.indexOf('Salary source')+1).value={richText:[{text:' CURRENT\u00a0 HRIS '},{text:'RECORD\u200b '}]};
sheet.getCell(2,headers.indexOf('Salary source')+1).dataValidation={type:'list',formulae:['"Current HRIS record,Approved PAN"']};
const parsed=simpleImportRows(readImportSheet(workbook,'Pay Input',simpleHeaders))[0];
assert.equal(prepareImport(parsed,context).payload.sourcePanId,null);
assert.equal(ready({...input,'Business unit':' test\u00a0bu ','Amount unit':'monthly','Pay type':' EMPLOYEE SALARY ','PAN ID (if applicable)':' pan-abcdef01 '}).payload.sourcePanId,null);
assert.equal(ready({...input,'Salary source':' APPROVED pan ','PAN ID (if applicable)':pan.toUpperCase(),'Effective date':'2024-07-15'}).payload.sourcePanId,pan);
console.log('2 PASS: capitalization, spacing, invisible characters, dropdown/rich-text values and reordered headers.');
// 3. Missing and unsupported choices are distinct, even when a supporting note exists.
assert.throws(()=>ready({...input,'Salary source':''}),/^Error: Missing salary source/);
assert.throws(()=>ready({...input,'Salary source':'Approved PAN','PAN ID (if applicable)':''}),/Missing salary source.*PAN ID/);
assert.throws(()=>ready({...input,'Salary source':'Unknown source'}),/Invalid salary source/);
console.log('3 PASS: missing and invalid source messages.');
// 4. Genuine mismatches remain blocked; unrelated approved records do not conflict with the selected current record.
assert.throws(()=>ready(input,{...context,sources:context.sources.slice(0,1)}),/Conflicting salary source.*0 approved records.*employee/);
assert.throws(()=>ready({...input,'Business unit':'Other BU'}),/Conflicting salary source.*Business unit/);
assert.throws(()=>ready({...input,'Salary source':'Approved PAN'}),/Conflicting salary source.*effective date/);
assert.throws(()=>ready({...input,'Pay type':'Consultant fee'}),/Conflicting salary source.*Consultant fee/);
assert.throws(()=>ready({...input,'Approved basic pay / fee':'26000'}),/Conflicting salary source.*amount/);
assert.throws(()=>ready({...input,'Amount unit':'Daily'}),/Conflicting salary source.*amount unit/);
assert.throws(()=>ready(input,{...context,sources:[...context.sources,context.sources[1]]}),/Conflicting salary source.*2 approved records/);
assert.throws(()=>ready(input,{...context,sources:context.sources.map(s=>s.id?s:{...s,conflict:true})}),/Conflicting salary source.*HRIS rate/);
assert.equal(ready(input,{...context,sources:[...context.sources,{...context.sources[1],id:'fedcba98-0000-0000-0000-000000000001'}]}).payload.sourcePanId,null);
console.log('4 PASS: employee, BU, date, stream, amount, unit, source and ambiguous-record conflicts.');
// 5. Execute the existing save RPC and package trigger in isolated Postgres, then reload from SQL.
const db=new PGlite();
const phase2=await fs.readFile(new URL('supabase/migrations/20260906004943_payroll_pay_packages_phase2.sql',root),'utf8');
const net=await fs.readFile(new URL('supabase/migrations/20260908070609_payroll_net_arrangements_single_row_import.sql',root),'utf8');
await db.exec(`create schema auth;create schema private;
 create table auth.users(id uuid primary key);create table public.hris_users(id uuid primary key);create table public.payroll_access_scopes(id uuid primary key);create table public.pans(id uuid primary key);
 insert into auth.users values('${employee}');insert into hris_users values('${employee}');insert into payroll_access_scopes values('${scope}');
 create function private.payroll_actor_id() returns uuid language sql as $$select '${employee}'::uuid$$;
 create function private.payroll_package_permission(uuid,uuid,text) returns boolean language sql as $$select true$$;
 create function private.payroll_source_hash(uuid) returns text language sql as $$select 'test-hash'$$;
 create function private.payroll_source_pay_data(uuid,uuid default null) returns jsonb language sql as $$select '{"hash":null}'::jsonb$$;`);
await db.exec(phase2.slice(phase2.indexOf('create table public.payroll_pay_packages'),phase2.indexOf('-- Verification references')));
await db.exec(net.slice(net.indexOf('CREATE OR REPLACE FUNCTION private.validate_payroll_package()'),net.indexOf('CREATE OR REPLACE FUNCTION private.payroll_net_review_validate')));
await db.exec('create trigger validate_package before insert or update or delete on payroll_pay_packages for each row execute function private.validate_payroll_package();');
await db.exec(phase2.slice(phase2.indexOf('create function public.save_payroll_pay_package('),phase2.indexOf('create function private.approve_payroll_package(')));
const p=ready();const saved=await db.query('select public.save_payroll_pay_package($1,$2,$3::jsonb,$4) as id',[p.employeeId,p.scopeId,JSON.stringify(p.payload),p.hash]);
const id=saved.rows[0].id;
const reloaded=(await db.query('select to_jsonb(p) as package from public.payroll_pay_packages p where id=$1',[id])).rows[0].package;
const refreshed={...context,packages:[reloaded]};assert.equal(verifySavedImport(p,refreshed,id,row()).status,'draft');
assert.equal(prepareImport(row(),{...refreshed,packages:refreshed.packages.filter(x=>x.id!==id)}).payload.sourcePanId,null);
assert.equal((await db.query('select action from payroll_pay_audit where package_id=$1',[id])).rows[0].action,'draft');
assert.equal(reloaded.approved_at,null);
assert.throws(()=>verifySavedImport(p,{...context,packages:[{...reloaded,source_ref:''}]},id,row()),/could not be verified/);
await db.close();
console.log('5 PASS: isolated Postgres draft save, audit entry, server reload and source verification; no approval/payment. Live authenticated save remains separate.');
